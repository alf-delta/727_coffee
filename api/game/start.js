import { randomUUID, randomInt } from 'node:crypto';
import { kv } from '../../src/server/kv.js';
import { parseCookies, readJsonBody } from '../../src/server/request.js';
import { UID_COOKIE } from '../../src/server/config.js';
import { todayUTC, secondsUntilNextUTCMidnight } from '../../src/server/date.js';
import { lockDailyGameChoice } from '../../src/server/gameChoice.js';
import { hasCurrentConsent } from '../../src/server/consent.js';
import {
  getPlayerContext,
  publicContact,
} from '../../src/server/contactIdentity.js';
import { LEGAL_VERSION } from '../../src/shared/legal.js';
import { PHYSICS_VERSION as FLAPPY_PHYSICS_VERSION, SESSION as FLAPPY_SESSION } from '../../src/shared/flappyPhysics.js';
import { PHYSICS_VERSION as TAP_PHYSICS_VERSION, SESSION as TAP_SESSION } from '../../src/shared/tapPhysics.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const cookies = parseCookies(req);
  const uid = cookies[UID_COOKIE];
  if (!uid) return res.status(400).json({ error: 'missing_uid', message: 'Reload the page and try again.' });
  if (!(await hasCurrentConsent(uid))) {
    return res.status(403).json({
      error: 'consent_required',
      message: 'Please accept the current Terms & Game Rules before playing.',
      legalVersion: LEGAL_VERSION,
    });
  }

  const body = await readJsonBody(req);
  const game = body.game;
  if (game !== 'flappy' && game !== 'tap') return res.status(400).json({ error: 'invalid_game' });

  const date = todayUTC();
  const context = await getPlayerContext(uid, date);
  const selectedGame = await lockDailyGameChoice(context.subject, date, game);
  if (selectedGame !== game) {
    return res.status(403).json({
      error: 'daily_game_locked',
      message: 'You already chose your game for today. Come back tomorrow to switch.',
      selectedGame,
    });
  }

  const dailyKey = `attempts:${context.subject}:${date}`;
  const attemptsToday = await kv.incr(dailyKey);
  if (attemptsToday === 1) await kv.expire(dailyKey, secondsUntilNextUTCMidnight());
  if (attemptsToday > context.attemptLimit) {
    await kv.decr(dailyKey);
    if (!context.phoneVerified) {
      return res.status(403).json({
        error: 'phone_verification_required',
        message: 'Verify your mobile number to receive your coupon.',
      });
    }
    if (!context.emailVerified) {
      return res.status(403).json({
        error: 'email_verification_or_claim_required',
        message: 'Verify your email for one extra run, or send your current coupon.',
      });
    }
    return res.status(403).json({
      error: 'daily_limit_reached',
      message: 'You have used all your attempts for today — come back tomorrow.',
    });
  }

  const rewardedKey = `rewarded:${context.subject}:${date}`;
  const alreadyRewardedToday = Boolean(await kv.get(rewardedKey));

  const attemptId = randomUUID();
  const nonce = randomUUID();
  const seed = randomInt(0, 0xffffffff);
  const maxDurationMs = game === 'flappy' ? FLAPPY_SESSION.maximumActiveDurationSeconds * 1000 : TAP_SESSION.activeDurationMs;
  const sessionMaxAgeSeconds = game === 'flappy' ? FLAPPY_SESSION.maximumSessionAgeSeconds : 60;
  const physicsVersion = game === 'flappy' ? FLAPPY_PHYSICS_VERSION : TAP_PHYSICS_VERSION;

  await kv.set(
    `attempt:${attemptId}`,
    {
      uid,
      subject: context.subject,
      game,
      seed,
      nonce,
      startedAt: Date.now(),
      attemptDate: date,
      maxDurationMs,
      attemptLimit: context.attemptLimit,
      verifiedAtStart: context.phoneVerified,
      emailVerifiedAtStart: context.emailVerified,
      rewardEligible: !alreadyRewardedToday,
    },
    { ex: sessionMaxAgeSeconds },
  );

  await kv.incr(`analytics:game_started:${date}`);

  return res.status(200).json({
    attemptId,
    seed,
    nonce,
    serverTime: Date.now(),
    physicsVersion,
    maxDurationMs,
    rewardEligible: !alreadyRewardedToday,
    selectedGame,
    verified: context.verified,
    phoneVerified: context.phoneVerified,
    emailVerified: context.emailVerified,
    contact: publicContact(context.contact),
    attemptsRemainingToday: Math.max(0, context.attemptLimit - attemptsToday),
  });
}
