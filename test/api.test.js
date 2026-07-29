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

function mockReq({ uid, body }) {
  const cookie = uid ? `mb_uid=${uid}` : '';
  return { method: 'POST', headers: { cookie }, body };
}

function mockRes() {
  const res = {
    statusCode: null,
    jsonBody: null,
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
  const res = mockRes();
  await startHandler(mockReq({ uid, body: { game } }), res);
  return res;
}

async function getGameStatus(uid) {
  const res = mockRes();
  await gameStatusHandler(mockReq({ uid }), res);
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

test('api: start issues an attempt for a fresh uid', async () => {
  const uid = randomUUID();
  const res = await startGame(uid, 'flappy');
  assert.equal(res.statusCode, 200);
  assert.ok(res.jsonBody.attemptId);
  assert.ok(res.jsonBody.seed !== undefined);
  assert.equal(res.jsonBody.rewardEligible, true);
});

test('api: daily limit blocks the 4th attempt', async () => {
  const uid = randomUUID();
  let last;
  for (let i = 0; i < 4; i++) last = await startGame(uid, 'tap');
  assert.equal(last.statusCode, 403);
  assert.equal(last.jsonBody.error, 'daily_limit_reached');
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

test('api: game status offers a choice once and reports tomorrow after three starts', async () => {
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
  }

  const exhausted = await getGameStatus(uid);
  assert.equal(exhausted.statusCode, 200);
  assert.equal(exhausted.jsonBody.selectedGame, 'tap');
  assert.equal(exhausted.jsonBody.attemptsRemainingToday, 0);
  assert.equal(exhausted.jsonBody.canChoose, false);
  assert.equal(exhausted.jsonBody.exhausted, true);
});

test('api: a player can claim the current best result before using all attempts', async () => {
  const uid = randomUUID();

  const start1 = await startGame(uid, 'tap');
  const finish1 = await finishGame(uid, start1, [500, 700, 900, 1100, 1300, 1500]);
  assert.equal(finish1.statusCode, 200);
  assert.equal(finish1.jsonBody.valid, true);
  assert.equal(finish1.jsonBody.rewardToken, null, 'coupon should wait for a claim or the end of the set');
  assert.equal(finish1.jsonBody.attemptsRemainingToday, 2);
  assert.equal(finish1.jsonBody.canClaim, true);
  assert.equal(finish1.jsonBody.isPractice, false);

  const claim = await claimGame(uid, 'tap');
  assert.equal(claim.statusCode, 200);
  assert.ok(claim.jsonBody.rewardToken);
  assert.match(claim.jsonBody.couponCode, /^[A-Z2-9]{8}$/);
  assert.ok(claim.jsonBody.couponExpiresAt > Date.now());

  const start2 = await startGame(uid, 'tap');
  const finish2 = await finishGame(uid, start2, [500, 700, 900, 1100, 1300, 1500]);
  assert.equal(finish2.statusCode, 200);
  assert.equal(finish2.jsonBody.rewardToken, null, 'runs after an early claim should be practice-only');
  assert.equal(finish2.jsonBody.isPractice, true);
});

test('api: the third run issues a coupon for the best result of the set', async () => {
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
  assert.equal(finish3.jsonBody.setComplete, true);
  assert.equal(finish3.jsonBody.bestAttemptNumber, 2);
  assert.equal(finish3.jsonBody.bestDiscountPercent, finish2.jsonBody.currentDiscountPercent);
  assert.ok(finish3.jsonBody.rewardToken);
  assert.equal(finish3.jsonBody.discountPercent, finish1.jsonBody.currentDiscountPercent);
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

test('api: coupon can be redeemed exactly once and reports terminal status', async () => {
  const uid = randomUUID();
  const start = await startGame(uid, 'tap');
  const finish = await finishGame(uid, start, [500, 700, 900, 1100, 1300, 1500]);
  assert.equal(finish.jsonBody.valid, true);
  const claim = await claimGame(uid, 'tap');
  assert.equal(claim.jsonBody.valid, true);

  const firstRedemption = mockRes();
  await redeemCouponHandler(
    mockReq({
      body: {
        code: claim.jsonBody.couponCode,
        pin: process.env.COUPON_STAFF_PIN,
      },
    }),
    firstRedemption,
  );
  assert.equal(firstRedemption.statusCode, 200);
  assert.equal(firstRedemption.jsonBody.status, 'redeemed');
  assert.equal(firstRedemption.jsonBody.discountPercent, finish.jsonBody.discountPercent);

  const replay = mockRes();
  await redeemCouponHandler(
    mockReq({
      body: {
        code: claim.jsonBody.couponCode,
        pin: process.env.COUPON_STAFF_PIN,
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
