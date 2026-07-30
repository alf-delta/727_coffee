import { kv } from '../../src/server/kv.js';
import { parseCookies, readJsonBody } from '../../src/server/request.js';
import {
  BASE_ATTEMPTS_PER_DAY,
  EMAIL_ONLY_CONTACT_MODE,
  UID_COOKIE,
} from '../../src/server/config.js';
import { todayUTC } from '../../src/server/date.js';
import {
  claimBestReward,
  getAttemptsUsed,
  getBestResult,
  recordBestResult,
} from '../../src/server/gameSet.js';
import {
  getPlayerContext,
  publicContact,
} from '../../src/server/contactIdentity.js';
import { deliverRewardToContact } from '../../src/server/couponDelivery.js';
import { evaluateFlappyRisk, evaluateTapRisk, riskResponse } from '../../src/shared/antiBot.js';
import { computeFlappyProgress } from '../../src/shared/flappyProgress.js';
import { computeTapProgress } from '../../src/shared/tapProgress.js';

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
    const progress = computeFlappyProgress({
      seed: attempt.seed,
      tapTimestampsMs: taps,
      pointerIds,
      durationMs: attempt.maxDurationMs,
    });
    const authoritative = progress.metrics;
    const mismatch = resultMismatch(body.clientClaimedResult?.passedObstacles, authoritative.passedObstacles, 'passedObstacles');
    risk = evaluateFlappyRisk({ tapTimestampsMs: taps, isTrustedFlags, pointerIds, visibilityEvents, clientElapsedMs, serverElapsedMs, resultMismatch: mismatch });
    scoring = progress.scoring;
    sessionSummary = {
      passedObstacles: authoritative.passedObstacles,
      collision: authoritative.collision,
    };
  } else if (attempt.game === 'tap') {
    const progress = computeTapProgress({
      tapTimestampsMs: taps,
      durationMs: attempt.maxDurationMs,
    });
    const authoritative = progress.metrics;
    risk = evaluateTapRisk({ tapTimestampsMs: taps, isTrustedFlags, pointerIds, visibilityEvents, pressDurationsMs: body.pressDurationsMs });
    scoring = progress.scoring;
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
    const subject = attempt.subject || uid;
    const attemptLimit = attempt.attemptLimit || BASE_ATTEMPTS_PER_DAY;
    const attemptsRemainingToday = Math.max(
      0,
      attemptLimit - Math.max(0, await kv.decr(`attempts:${subject}:${attemptDate}`)),
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

  const attemptDate = attempt.attemptDate || date;
  const subject = attempt.subject || uid;
  const attemptLimit = attempt.attemptLimit || BASE_ATTEMPTS_PER_DAY;
  await updateStats(subject, attempt.game, { durationMs: serverElapsedMs, score: scoring.finalScore });

  const attemptsUsed = await getAttemptsUsed(subject, attemptDate);
  const attemptsRemainingToday = Math.max(0, attemptLimit - attemptsUsed);
  const existingReward = await kv.get(`rewarded:${subject}:${attemptDate}`);
  const isPractice = !attempt.rewardEligible || Boolean(existingReward);

  let best = null;
  let isCurrentBest = false;
  if (!isPractice && response.rewardAllowed) {
    const recorded = await recordBestResult(subject, attemptDate, {
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

  // The legacy phone + email-bonus mode automatically closes the set after its
  // fourth run. Email-only mode claims immediately after email verification.
  let reward = null;
  let delivery = null;
  if (!best && !isPractice) best = await getBestResult(subject, attemptDate);
  if (
    !EMAIL_ONLY_CONTACT_MODE
    && !isPractice
    && attempt.emailVerifiedAtStart
    && attemptsRemainingToday === 0
    && best
  ) {
    const issuingPlayer = await getPlayerContext(uid, attemptDate);
    const claimed = await claimBestReward(
      subject,
      attemptDate,
      uid,
      issuingPlayer.contact,
    );
    if (claimed.ok) reward = claimed.reward;
    if (reward) {
      delivery = await deliverRewardToContact(issuingPlayer.contact, reward);
    }
  }
  const player = await getPlayerContext(uid, attemptDate);
  const contactVerificationRequired = EMAIL_ONLY_CONTACT_MODE
    && !player.verified
    && attemptsUsed >= BASE_ATTEMPTS_PER_DAY;
  const phoneVerificationRequired = !EMAIL_ONLY_CONTACT_MODE
    && !player.phoneVerified
    && attemptsUsed >= BASE_ATTEMPTS_PER_DAY;
  const emailOfferAvailable = !EMAIL_ONLY_CONTACT_MODE
    && player.phoneVerified
    && !player.emailVerified
    && !existingReward
    && Boolean(best);

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
    attemptLimit,
    verified: player.verified,
    phoneVerified: player.phoneVerified,
    emailVerified: player.emailVerified,
    contact: publicContact(player.contact),
    emailContact: publicContact(player.emailContact),
    verificationChannel: EMAIL_ONLY_CONTACT_MODE ? 'email' : 'sms',
    contactVerificationRequired,
    emailVerificationRequired: contactVerificationRequired,
    phoneVerificationRequired,
    emailOfferAvailable,
    setComplete: EMAIL_ONLY_CONTACT_MODE
      ? Boolean(existingReward || reward)
      : player.emailVerified && attemptsRemainingToday === 0,
    canClaim: player.verified && !isPractice && Boolean(best),
    rewardToken: reward?.rewardToken ?? null,
    couponCode: reward?.couponCode ?? null,
    couponExpiresAt: reward?.couponExpiresAt ?? null,
    delivery,
    components: scoring.components,
    session: sessionSummary,
    securityRiskScore: risk.riskScore,
  });
}
