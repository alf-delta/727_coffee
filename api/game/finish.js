import { kv } from '../../src/server/kv.js';
import { parseCookies, readJsonBody } from '../../src/server/request.js';
import { UID_COOKIE, MAX_ATTEMPTS_PER_DAY } from '../../src/server/config.js';
import { todayUTC } from '../../src/server/date.js';
import { claimBestReward, getAttemptsUsed, recordBestResult } from '../../src/server/gameSet.js';
import { evaluateFlappyRisk, evaluateTapRisk, riskResponse } from '../../src/shared/antiBot.js';
import { filterValidFlaps, simulateRun } from '../../src/shared/flappyPhysics.js';
import { computeFlappyResult } from '../../src/shared/flappyScoring.js';
import { analyzeTapSession } from '../../src/shared/tapPhysics.js';
import { computeTapResult } from '../../src/shared/tapScoring.js';

function resultMismatch(claimed, authoritative, field, tolerance = 1) {
  if (claimed == null || authoritative == null) return false;
  return Math.abs(claimed - authoritative) > tolerance;
}

async function updateStats(uid, variant, { durationMs, score }) {
  const key = `stats:${uid}`;
  const existing = (await kv.get(key)) || { variant, plays: 0, totalDurationMs: 0, sumScore: 0, sumScoreSq: 0, maxScore: 0 };
  existing.variant = variant;
  existing.plays += 1;
  existing.totalDurationMs += durationMs;
  existing.sumScore += score;
  existing.sumScoreSq += score * score;
  existing.maxScore = Math.max(existing.maxScore, score);
  await kv.set(key, existing);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const cookies = parseCookies(req);
  const uid = cookies[UID_COOKIE];
  if (!uid) return res.status(400).json({ error: 'missing_uid' });

  const body = await readJsonBody(req);
  const { attemptId, nonce } = body;
  if (!attemptId || !nonce) return res.status(400).json({ error: 'missing_fields' });

  const attempt = await kv.get(`attempt:${attemptId}`);
  if (!attempt) return res.status(400).json({ error: 'attempt_not_found', message: 'This attempt has expired or was already submitted.' });
  // Single-use: delete immediately so a duplicate submission of the same attemptId always misses above.
  await kv.del(`attempt:${attemptId}`);

  if (attempt.uid !== uid) return res.status(403).json({ error: 'uid_mismatch' });
  if (attempt.nonce !== nonce) return res.status(400).json({ error: 'nonce_mismatch' });

  const serverElapsedMs = Date.now() - attempt.startedAt;
  const taps = Array.isArray(body.taps) ? body.taps : [];
  const isTrustedFlags = Array.isArray(body.isTrustedFlags) ? body.isTrustedFlags : taps.map(() => true);
  const pointerIds = Array.isArray(body.pointerIds) ? body.pointerIds : taps.map(() => 1);
  const visibilityEvents = Array.isArray(body.visibilityEvents) ? body.visibilityEvents : [];
  const clientElapsedMs = typeof body.clientElapsedMs === 'number' ? body.clientElapsedMs : serverElapsedMs;
  const date = todayUTC();

  let scoring;
  let risk;
  let sessionSummary;

  if (attempt.game === 'flappy') {
    const validFlaps = filterValidFlaps(taps, pointerIds);
    const authoritative = simulateRun(attempt.seed, validFlaps, attempt.maxDurationMs);
    const mismatch = resultMismatch(body.clientClaimedResult?.passedObstacles, authoritative.passedObstacles, 'passedObstacles');
    risk = evaluateFlappyRisk({ tapTimestampsMs: taps, isTrustedFlags, pointerIds, visibilityEvents, clientElapsedMs, serverElapsedMs, resultMismatch: mismatch });
    scoring = computeFlappyResult({ ...authoritative, securityRiskScore: risk.riskScore });
    sessionSummary = {
      passedObstacles: authoritative.passedObstacles,
      longestCleanStreak: authoritative.longestCleanStreak,
      survivalSeconds: authoritative.survivalSeconds,
      collision: authoritative.collision,
    };
  } else if (attempt.game === 'tap') {
    const authoritative = analyzeTapSession(taps, attempt.maxDurationMs);
    risk = evaluateTapRisk({ tapTimestampsMs: taps, isTrustedFlags, pointerIds, visibilityEvents, pressDurationsMs: body.pressDurationsMs });
    scoring = computeTapResult({ ...authoritative, peakReachedWithMsRemaining: authoritative.peakReachedWithMsRemaining, securityRiskScore: risk.riskScore });
    sessionSummary = {
      averageScoringTps: authoritative.averageScoringTps,
      peakSmoothedTps: authoritative.peakSmoothedTps,
      rhythmStabilityScore: authoritative.rhythmStabilityScore,
      continuityScore: authoritative.continuityScore,
    };
  } else {
    return res.status(400).json({ error: 'invalid_game' });
  }

  const response = riskResponse(risk.riskScore);
  await kv.incr(`analytics:game_completed:${date}`);

  if (!response.sessionValid) {
    // A run that we explicitly ask the player to repeat must not consume one
    // of their three daily attempts. DECR is atomic in Redis, and attemptId is
    // single-use, so the same rejected run cannot be refunded twice.
    const attemptDate = attempt.attemptDate || date;
    const attemptsRemainingToday = Math.max(
      0,
      MAX_ATTEMPTS_PER_DAY - Math.max(0, await kv.decr(`attempts:${uid}:${attemptDate}`)),
    );
    await kv.incr(`analytics:game_invalidated:${date}`);
    console.warn('[game-invalid]', {
      attemptId,
      game: attempt.game,
      riskScore: risk.riskScore,
      triggeredRules: risk.triggeredRules,
    });
    return res.status(200).json({
      valid: false,
      message: response.userMessage
        ? `${response.userMessage} Your attempt was restored.`
        : "We couldn't verify this attempt. Your attempt was restored — please try again.",
      blockedMinutes: response.temporarySessionBlockMinutes,
      attemptRestored: true,
      attemptsRemainingToday,
      ...(process.env.NODE_ENV !== 'production'
        ? {
            debug: {
              riskScore: risk.riskScore,
              triggeredRules: risk.triggeredRules,
            },
          }
        : {}),
    });
  }

  await updateStats(uid, attempt.game, { durationMs: serverElapsedMs, score: scoring.finalScore });

  const attemptDate = attempt.attemptDate || date;
  const attemptsUsed = await getAttemptsUsed(uid, attemptDate);
  const attemptsRemainingToday = Math.max(0, MAX_ATTEMPTS_PER_DAY - attemptsUsed);
  const existingReward = await kv.get(`rewarded:${uid}:${attemptDate}`);
  const isPractice = !attempt.rewardEligible || Boolean(existingReward);

  let best = null;
  let isCurrentBest = false;
  if (!isPractice && response.rewardAllowed) {
    const recorded = await recordBestResult(uid, attemptDate, {
      attemptId,
      game: attempt.game,
      attemptNumber: attemptsUsed,
      discountPercent: scoring.discountPercent,
      finalScore: scoring.finalScore,
      components: scoring.components,
      session: sessionSummary,
    });
    best = recorded.best;
    isCurrentBest = recorded.isCurrentBest;
  }

  // Finishing the third verified run closes the set and locks the coupon to
  // the best result. Before that, the client offers "claim now" or another run.
  let reward = null;
  if (!isPractice && attemptsRemainingToday === 0 && best) {
    const claimed = await claimBestReward(uid, attemptDate);
    if (claimed.ok) reward = claimed.reward;
  }

  return res.status(200).json({
    valid: true,
    isPractice,
    finalScore: scoring.finalScore,
    discountPercent: scoring.discountPercent,
    currentDiscountPercent: scoring.discountPercent,
    bestDiscountPercent: best?.discountPercent ?? scoring.discountPercent,
    bestFinalScore: best?.finalScore ?? scoring.finalScore,
    bestAttemptNumber: best?.attemptNumber ?? attemptsUsed,
    isCurrentBest,
    attemptsUsed,
    attemptsRemainingToday,
    setComplete: attemptsRemainingToday === 0,
    canClaim: !isPractice && Boolean(best),
    rewardToken: reward?.rewardToken ?? null,
    couponCode: reward?.couponCode ?? null,
    couponExpiresAt: reward?.couponExpiresAt ?? null,
    components: scoring.components,
    session: sessionSummary,
    securityRiskScore: risk.riskScore,
  });
}
