import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.env.REWARD_TOKEN_SECRET = 'test-secret-do-not-use-in-prod';
process.env.COUPON_STAFF_PIN = '2468';

import startHandler from '../api/game/start.js';
import gameStatusHandler from '../api/game/status.js';
import finishHandler from '../api/game/finish.js';
import claimHandler from '../api/game/claim.js';
import redeemCouponHandler from '../api/coupon/redeem.js';
import couponStatusHandler from '../api/coupon/status.js';
import checkerLoginHandler from '../api/checker/login.js';
import consentHandler from '../api/consent.js';
import sendVerificationHandler from '../api/verification/send.js';
import checkVerificationHandler from '../api/verification/check.js';
import {
  contactIdentityHash,
  normalizeEmail,
} from '../src/server/contactIdentity.js';
import { kv } from '../src/server/kv.js';
import { LEGAL_VERSION } from '../src/shared/legal.js';
import { computeFlappyProgress } from '../src/shared/flappyProgress.js';
import { computeTapProgress } from '../src/shared/tapProgress.js';

function mockReq({ uid, body, cookie = '', method = 'POST' }) {
  const cookies = [
    uid ? `mb_uid=${uid}` : '',
    cookie,
  ].filter(Boolean).join('; ');
  return { method, headers: { cookie: cookies }, body };
}

function mockRes() {
  const res = {
    statusCode: null,
    jsonBody: null,
    headers: {},
    setHeader(name, value) {
      res.headers[String(name).toLowerCase()] = value;
      return res;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.jsonBody = payload;
      return res;
    },
  };
  return res;
}

async function startGame(uid, game) {
  await acceptLegal(uid);
  const res = mockRes();
  await startHandler(mockReq({ uid, body: { game } }), res);
  return res;
}

async function getGameStatus(uid) {
  await acceptLegal(uid);
  const res = mockRes();
  await gameStatusHandler(mockReq({ uid }), res);
  return res;
}

async function acceptLegal(uid) {
  const res = mockRes();
  await consentHandler(
    mockReq({
      uid,
      body: {
        version: LEGAL_VERSION,
        accepted: true,
        ageConfirmed: true,
      },
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  return res;
}

async function finishGame(uid, start, taps = []) {
  const res = mockRes();
  await finishHandler(
    mockReq({
      uid,
      body: {
        attemptId: start.jsonBody.attemptId,
        nonce: start.jsonBody.nonce,
        taps,
        isTrustedFlags: taps.map(() => true),
        pointerIds: taps.map(() => 1),
        visibilityEvents: [],
        // omitted: clientElapsedMs defaults to serverElapsedMs server-side,
        // avoiding a spurious time_scale_manipulation flag from test-harness
        // timing (real clients report actual wall-clock play duration).
      },
    }),
    res,
  );
  return res;
}

async function claimGame(uid, game) {
  const res = mockRes();
  await claimHandler(mockReq({ uid, body: { game } }), res);
  return res;
}

async function sendVerification(uid, {
  channel = 'email',
  value = `${randomUUID()}@example.com`,
} = {}) {
  await acceptLegal(uid);
  const res = mockRes();
  await sendVerificationHandler(
    mockReq({ uid, body: { channel, value } }),
    res,
  );
  return res;
}

async function verifyContact(uid, options = {}) {
  const sent = await sendVerification(uid, options);
  assert.equal(sent.statusCode, 200);
  assert.ok(sent.jsonBody.challengeId);
  assert.match(sent.jsonBody.devCode, /^\d{6}$/);

  const checked = mockRes();
  await checkVerificationHandler(
    mockReq({
      uid,
      body: {
        challengeId: sent.jsonBody.challengeId,
        code: sent.jsonBody.devCode,
      },
    }),
    checked,
  );
  assert.equal(checked.statusCode, 200);
  assert.equal(checked.jsonBody.verified, true);
  return checked;
}

async function verifyEmail(uid, value = `${randomUUID()}@example.com`) {
  return verifyContact(uid, {
    channel: 'email',
    value,
  });
}

test('api: a fresh uid must accept the current legal terms before playing', async () => {
  const uid = randomUUID();
  const status = mockRes();
  await gameStatusHandler(mockReq({ uid }), status);
  assert.equal(status.statusCode, 200);
  assert.equal(status.jsonBody.consentRequired, true);
  assert.equal(status.jsonBody.legalVersion, LEGAL_VERSION);

  const blocked = mockRes();
  await startHandler(mockReq({ uid, body: { game: 'flappy' } }), blocked);
  assert.equal(blocked.statusCode, 403);
  assert.equal(blocked.jsonBody.error, 'consent_required');

  await acceptLegal(uid);
  const acceptedStatus = mockRes();
  await gameStatusHandler(mockReq({ uid }), acceptedStatus);
  assert.equal(acceptedStatus.statusCode, 200);
  assert.equal(acceptedStatus.jsonBody.consentRequired, undefined);
  assert.equal(acceptedStatus.jsonBody.attemptsRemainingToday, 3);
});

test('api: start issues an attempt after consent', async () => {
  const uid = randomUUID();
  const res = await startGame(uid, 'flappy');
  assert.equal(res.statusCode, 200);
  assert.ok(res.jsonBody.attemptId);
  assert.ok(res.jsonBody.seed !== undefined);
  assert.equal(res.jsonBody.rewardEligible, true);
});

test('api: a player must verify an email to receive a coupon after run three', async () => {
  const uid = randomUUID();
  let last;
  for (let i = 0; i < 4; i++) last = await startGame(uid, 'tap');
  assert.equal(last.statusCode, 403);
  assert.equal(last.jsonBody.error, 'email_verification_required');
});

test('api: the first game started is locked for the rest of the day', async () => {
  const uid = randomUUID();
  const first = await startGame(uid, 'flappy');
  assert.equal(first.statusCode, 200);
  assert.equal(first.jsonBody.selectedGame, 'flappy');

  const otherGame = await startGame(uid, 'tap');
  assert.equal(otherGame.statusCode, 403);
  assert.equal(otherGame.jsonBody.error, 'daily_game_locked');
  assert.equal(otherGame.jsonBody.selectedGame, 'flappy');
});

test('api: game status asks for email verification after three completed runs', async () => {
  const uid = randomUUID();

  const fresh = await getGameStatus(uid);
  assert.equal(fresh.statusCode, 200);
  assert.equal(fresh.jsonBody.selectedGame, null);
  assert.equal(fresh.jsonBody.canChoose, true);
  assert.equal(fresh.jsonBody.attemptsRemainingToday, 3);
  assert.equal(fresh.jsonBody.exhausted, false);

  for (let i = 0; i < 3; i += 1) {
    const start = await startGame(uid, 'tap');
    assert.equal(start.statusCode, 200);
    const finish = await finishGame(uid, start, [500, 700, 900, 1100, 1300, 1500]);
    assert.equal(finish.jsonBody.valid, true);
  }

  const verificationGate = await getGameStatus(uid);
  assert.equal(verificationGate.statusCode, 200);
  assert.equal(verificationGate.jsonBody.selectedGame, 'tap');
  assert.equal(verificationGate.jsonBody.attemptsRemainingToday, 0);
  assert.equal(verificationGate.jsonBody.canChoose, false);
  assert.equal(verificationGate.jsonBody.contactVerificationRequired, true);
  assert.equal(verificationGate.jsonBody.emailVerificationRequired, true);
  assert.equal(verificationGate.jsonBody.verificationChannel, 'email');
  assert.equal(verificationGate.jsonBody.phoneVerificationRequired, false);
  assert.equal(verificationGate.jsonBody.phoneVerified, false);
  assert.equal(verificationGate.jsonBody.emailVerified, false);
  assert.equal(verificationGate.jsonBody.exhausted, false);
});

test('api: a player can claim the current best result before using all attempts', async () => {
  const uid = randomUUID();

  const start1 = await startGame(uid, 'tap');
  const finish1 = await finishGame(uid, start1, [500, 700, 900, 1100, 1300, 1500]);
  assert.equal(finish1.statusCode, 200);
  assert.equal(finish1.jsonBody.valid, true);
  assert.equal(finish1.jsonBody.rewardToken, null, 'coupon should wait for a claim or the end of the set');
  assert.equal(finish1.jsonBody.attemptsRemainingToday, 2);
  assert.equal(finish1.jsonBody.canClaim, false);
  assert.equal(finish1.jsonBody.isPractice, false);

  const blockedClaim = await claimGame(uid, 'tap');
  assert.equal(blockedClaim.statusCode, 403);
  assert.equal(blockedClaim.jsonBody.error, 'email_verification_required');

  const verified = await verifyEmail(uid);
  assert.equal(verified.jsonBody.attemptsUsed, 1);
  assert.equal(verified.jsonBody.attemptsRemainingToday, 2);
  assert.equal(verified.jsonBody.bonusAttemptUnlocked, false);

  const claim = await claimGame(uid, 'tap');
  assert.equal(claim.statusCode, 200);
  assert.ok(claim.jsonBody.rewardToken);
  assert.match(claim.jsonBody.couponCode, /^[A-Z2-9]{8}$/);
  assert.ok(claim.jsonBody.couponExpiresAt > Date.now());
  assert.equal(claim.jsonBody.delivery.delivered, true);
  assert.equal(claim.jsonBody.delivery.channel, 'email');

  const start2 = await startGame(uid, 'tap');
  const finish2 = await finishGame(uid, start2, [500, 700, 900, 1100, 1300, 1500]);
  assert.equal(finish2.statusCode, 200);
  assert.equal(finish2.jsonBody.rewardToken, null, 'runs after an early claim should be practice-only');
  assert.equal(finish2.jsonBody.isPractice, true);
});

test('api: email verification delivers the best coupon without a bonus run', async () => {
  const uid = randomUUID();
  const lowTaps = [700, 1700, 2700, 3700, 4700, 5700];
  const highTaps = Array.from({ length: 48 }, (_, i) => 300 + i * 150 + (i % 5) * 7);

  const start1 = await startGame(uid, 'tap');
  const finish1 = await finishGame(uid, start1, lowTaps);
  const start2 = await startGame(uid, 'tap');
  const finish2 = await finishGame(uid, start2, highTaps);
  const start3 = await startGame(uid, 'tap');
  const finish3 = await finishGame(uid, start3, lowTaps);

  assert.equal(finish1.jsonBody.valid, true);
  assert.equal(finish2.jsonBody.valid, true);
  assert.equal(finish3.jsonBody.valid, true);
  assert.ok(finish2.jsonBody.currentDiscountPercent > finish1.jsonBody.currentDiscountPercent);
  assert.equal(finish3.jsonBody.attemptsRemainingToday, 0);
  assert.equal(finish3.jsonBody.contactVerificationRequired, true);
  assert.equal(finish3.jsonBody.emailVerificationRequired, true);
  assert.equal(finish3.jsonBody.phoneVerificationRequired, false);
  assert.equal(finish3.jsonBody.setComplete, false);
  assert.equal(finish3.jsonBody.bestAttemptNumber, 2);
  assert.equal(finish3.jsonBody.bestDiscountPercent, finish2.jsonBody.currentDiscountPercent);
  assert.equal(finish3.jsonBody.rewardToken, null);
  assert.equal(finish3.jsonBody.discountPercent, finish1.jsonBody.currentDiscountPercent);

  const email = await verifyEmail(uid);
  assert.equal(email.jsonBody.verificationType, 'email');
  assert.equal(email.jsonBody.attemptsUsed, 3);
  assert.equal(email.jsonBody.attemptsRemainingToday, 0);
  assert.equal(email.jsonBody.bonusAttemptUnlocked, false);

  const verifiedStatus = await getGameStatus(uid);
  assert.equal(verifiedStatus.jsonBody.postPhoneActionRequired, false);
  assert.equal(verifiedStatus.jsonBody.couponClaimRequired, true);
  assert.equal(verifiedStatus.jsonBody.attemptLimit, 3);

  const claim = await claimGame(uid, 'tap');
  assert.equal(claim.statusCode, 200);
  assert.equal(claim.jsonBody.bestAttemptNumber, 2);
  assert.equal(claim.jsonBody.discountPercent, finish2.jsonBody.currentDiscountPercent);
  assert.equal(claim.jsonBody.delivery.delivered, true);
  assert.equal(claim.jsonBody.delivery.channel, 'email');

  const blockedFourth = await startGame(uid, 'tap');
  assert.equal(blockedFourth.statusCode, 403);
  assert.equal(blockedFourth.jsonBody.error, 'daily_limit_reached');
});

test('api: an incorrect verification code does not unlock an identity', async () => {
  const uid = randomUUID();
  const start = await startGame(uid, 'tap');
  const finish = await finishGame(uid, start, [500, 700, 900, 1100, 1300, 1500]);
  assert.equal(finish.jsonBody.valid, true);
  const sent = await sendVerification(uid);
  assert.equal(sent.statusCode, 200);

  const checked = mockRes();
  await checkVerificationHandler(
    mockReq({
      uid,
      body: {
        challengeId: sent.jsonBody.challengeId,
        code: sent.jsonBody.devCode === '000000' ? '111111' : '000000',
      },
    }),
    checked,
  );
  assert.equal(checked.statusCode, 400);
  assert.equal(checked.jsonBody.error, 'incorrect_code');

  const status = await getGameStatus(uid);
  assert.equal(status.jsonBody.verified, false);
  assert.equal(status.jsonBody.attemptLimit, 3);
});

test('api: email verification is unavailable before a verified result exists', async () => {
  const uid = randomUUID();
  const sent = await sendVerification(uid, {
    channel: 'email',
    value: `${randomUUID()}@example.com`,
  });
  assert.equal(sent.statusCode, 403);
  assert.equal(sent.jsonBody.error, 'verified_result_required');
});

test('api: the same verified email shares daily progress across devices', async () => {
  const email = `${randomUUID()}@example.com`;
  const firstUid = randomUUID();
  const secondUid = randomUUID();

  const firstStart = await startGame(firstUid, 'flappy');
  assert.equal(firstStart.statusCode, 200);
  const firstFinish = await finishGame(firstUid, firstStart, []);
  assert.equal(firstFinish.jsonBody.valid, true);
  await verifyEmail(firstUid, email);

  const identityHash = contactIdentityHash('email', normalizeEmail(email));
  await kv.del(`verify-cooldown:${identityHash}`);

  const secondStart = await startGame(secondUid, 'flappy');
  assert.equal(secondStart.statusCode, 200);
  const secondFinish = await finishGame(secondUid, secondStart, []);
  assert.equal(secondFinish.jsonBody.valid, true);
  const secondVerification = await verifyEmail(secondUid, email);
  assert.equal(secondVerification.jsonBody.attemptsUsed, 1);
  assert.equal(secondVerification.jsonBody.attemptsRemainingToday, 2);

  const secondStatus = await getGameStatus(secondUid);
  assert.equal(secondStatus.jsonBody.selectedGame, 'flappy');
  assert.equal(secondStatus.jsonBody.attemptsUsed, 1);
  assert.equal(secondStatus.jsonBody.attemptLimit, 3);
});

test('api: an attempt cannot be submitted twice (single-use nonce)', async () => {
  const uid = randomUUID();
  const start = await startGame(uid, 'flappy');
  const first = await finishGame(uid, start, [200, 900, 1600]);
  assert.equal(first.statusCode, 200);
  assert.equal(first.jsonBody.valid, true);

  const replay = mockRes();
  await finishHandler(
    mockReq({ uid, body: { attemptId: start.jsonBody.attemptId, nonce: start.jsonBody.nonce, taps: [] } }),
    replay,
  );
  assert.equal(replay.statusCode, 400);
  assert.equal(replay.jsonBody.error, 'attempt_not_found');
});

test('api: synthetic (non-trusted) taps invalidate the session', async () => {
  const uid = randomUUID();
  const start = await startGame(uid, 'flappy');
  const res = mockRes();
  await finishHandler(
    mockReq({
      uid,
      body: {
        attemptId: start.jsonBody.attemptId,
        nonce: start.jsonBody.nonce,
        taps: [200, 900],
        isTrustedFlags: [true, false],
        pointerIds: [1, 1],
        clientElapsedMs: 2000,
      },
    }),
    res,
  );
  assert.equal(res.jsonBody.valid, false);
  assert.ok(res.jsonBody.debug.triggeredRules.includes('synthetic_event'));
});

test('api: an invalid run restores the daily attempt', async () => {
  const uid = randomUUID();

  for (let i = 0; i < 3; i++) {
    const start = await startGame(uid, 'flappy');
    assert.equal(start.statusCode, 200);

    const finish = mockRes();
    await finishHandler(
      mockReq({
        uid,
        body: {
          attemptId: start.jsonBody.attemptId,
          nonce: start.jsonBody.nonce,
          taps: [200, 900],
          isTrustedFlags: [true, false],
          pointerIds: [1, 1],
          clientElapsedMs: 2000,
        },
      }),
      finish,
    );

    assert.equal(finish.jsonBody.valid, false);
    assert.equal(finish.jsonBody.attemptRestored, true);
    assert.equal(finish.jsonBody.attemptsRemainingToday, 3);
  }

  const retry = await startGame(uid, 'flappy');
  assert.equal(retry.statusCode, 200, 'rejected runs must not exhaust the daily limit');
  assert.equal(retry.jsonBody.rewardEligible, true);
});

test('api: client score mismatch falls back to authoritative replay without rejecting', async () => {
  const uid = randomUUID();
  const start = await startGame(uid, 'flappy');
  const res = mockRes();
  await finishHandler(
    mockReq({
      uid,
      body: {
        attemptId: start.jsonBody.attemptId,
        nonce: start.jsonBody.nonce,
        taps: [],
        isTrustedFlags: [],
        pointerIds: [],
        visibilityEvents: [],
        clientClaimedResult: { passedObstacles: 99 },
      },
    }),
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.jsonBody.valid, true);
  assert.equal(res.jsonBody.session.passedObstacles, 0);
});

test('api: flappy finish exactly matches the shared live reward pipeline', async () => {
  const uid = randomUUID();
  const start = await startGame(uid, 'flappy');
  const taps = [0, 318, 579, 907, 1196, 1511, 1784, 2108, 2397];
  const pointerIds = taps.map(() => 1);
  const live = computeFlappyProgress({
    seed: start.jsonBody.seed,
    tapTimestampsMs: taps,
    pointerIds,
    durationMs: start.jsonBody.maxDurationMs,
  });

  const finish = await finishGame(uid, start, taps);

  assert.equal(finish.jsonBody.valid, true);
  assert.equal(finish.jsonBody.discountPercent, live.scoring.discountPercent);
  assert.equal(finish.jsonBody.finalScore, live.scoring.finalScore);
  assert.equal(finish.jsonBody.session.passedObstacles, live.metrics.passedObstacles);
});

test('api: tap finish exactly matches the shared live reward pipeline', async () => {
  const uid = randomUUID();
  const start = await startGame(uid, 'tap');
  const taps = [500, 682, 901, 1075, 1308, 1489, 1713, 1902, 2141, 2318];
  const live = computeTapProgress({
    tapTimestampsMs: taps,
    durationMs: start.jsonBody.maxDurationMs,
  });

  const finish = await finishGame(uid, start, taps);

  assert.equal(finish.jsonBody.valid, true);
  assert.equal(finish.jsonBody.discountPercent, live.scoring.discountPercent);
  assert.equal(finish.jsonBody.finalScore, live.scoring.finalScore);
});

test('api: coupon can be redeemed exactly once and reports terminal status', async () => {
  const uid = randomUUID();
  const start = await startGame(uid, 'tap');
  const finish = await finishGame(uid, start, [500, 700, 900, 1100, 1300, 1500]);
  assert.equal(finish.jsonBody.valid, true);
  const couponEmail = `${randomUUID()}@example.com`;
  await verifyEmail(uid, couponEmail);
  const claim = await claimGame(uid, 'tap');
  assert.equal(claim.jsonBody.valid, true);

  const unauthenticated = mockRes();
  await redeemCouponHandler(
    mockReq({ body: { code: claim.jsonBody.couponCode } }),
    unauthenticated,
  );
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(unauthenticated.jsonBody.error, 'checker_authentication_required');

  const badLogin = mockRes();
  await checkerLoginHandler(
    mockReq({ body: { password: 'wrong-password' } }),
    badLogin,
  );
  assert.equal(badLogin.statusCode, 403);

  const login = mockRes();
  await checkerLoginHandler(
    mockReq({ body: { password: process.env.COUPON_STAFF_PIN } }),
    login,
  );
  assert.equal(login.statusCode, 200);
  assert.equal(login.jsonBody.authenticated, true);
  const checkerCookie = String(login.headers['set-cookie']).split(';')[0];
  assert.match(checkerCookie, /^mb_checker=/);

  const firstRedemption = mockRes();
  await redeemCouponHandler(
    mockReq({
      cookie: checkerCookie,
      body: {
        code: claim.jsonBody.couponCode,
      },
    }),
    firstRedemption,
  );
  assert.equal(firstRedemption.statusCode, 200);
  assert.equal(firstRedemption.jsonBody.status, 'redeemed');
  assert.equal(firstRedemption.jsonBody.discountPercent, finish.jsonBody.discountPercent);
  assert.equal(firstRedemption.jsonBody.email, couponEmail);
  assert.ok(firstRedemption.jsonBody.issuedAt <= firstRedemption.jsonBody.redeemedAt);
  assert.ok(firstRedemption.jsonBody.expiresAt > firstRedemption.jsonBody.redeemedAt);
  assert.ok(firstRedemption.jsonBody.remainingSeconds > 0);
  assert.equal(firstRedemption.jsonBody.timeZone, 'America/New_York');

  const replay = mockRes();
  await redeemCouponHandler(
    mockReq({
      cookie: checkerCookie,
      body: {
        code: claim.jsonBody.couponCode,
      },
    }),
    replay,
  );
  assert.equal(replay.statusCode, 409);
  assert.equal(replay.jsonBody.error, 'coupon_already_redeemed');

  const status = mockRes();
  await couponStatusHandler(
    mockReq({ body: { token: claim.jsonBody.rewardToken } }),
    status,
  );
  assert.equal(status.statusCode, 200);
  assert.equal(status.jsonBody.status, 'redeemed');
});
