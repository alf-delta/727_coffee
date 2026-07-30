import { randomUUID } from 'node:crypto';
import { kv } from './kv.js';
import { secondsUntilNextUTCMidnight } from './date.js';
import { issueRewardToken } from '../shared/rewardToken.js';

function bestKey(uid, date) {
  return `game-best:${uid}:${date}`;
}

function rewardedKey(uid, date) {
  return `rewarded:${uid}:${date}`;
}

function isBetterResult(candidate, current) {
  if (!current) return true;
  if (candidate.discountPercent !== current.discountPercent) {
    return candidate.discountPercent > current.discountPercent;
  }
  return candidate.finalScore > current.finalScore;
}

export async function recordBestResult(uid, date, candidate) {
  const key = bestKey(uid, date);
  const current = await kv.get(key);
  const isCurrentBest = isBetterResult(candidate, current);
  const best = isCurrentBest ? candidate : current;

  if (isCurrentBest) {
    await kv.set(key, best, { ex: secondsUntilNextUTCMidnight() });
  }

  return { best, isCurrentBest };
}

export async function getBestResult(uid, date) {
  return kv.get(bestKey(uid, date));
}

export async function getAttemptsUsed(uid, date) {
  const count = Number(await kv.get(`attempts:${uid}:${date}`)) || 0;
  return Math.max(0, count);
}

function publicReward(reward) {
  return {
    rewardToken: reward.rewardToken,
    couponCode: reward.couponCode,
    couponExpiresAt: reward.couponExpiresAt,
    couponId: reward.couponId,
    discountPercent: reward.discountPercent,
    finalScore: reward.finalScore,
    bestAttemptNumber: reward.bestAttemptNumber,
    attemptsUsed: reward.attemptsUsed,
  };
}

export async function claimBestReward(uid, date, tokenUid = uid, contact = null) {
  const key = rewardedKey(uid, date);
  const existing = await kv.get(key);
  if (existing?.status === 'issued') {
    return { ok: true, alreadyIssued: true, reward: publicReward(existing) };
  }
  if (existing) {
    return { ok: false, status: 409, error: 'reward_is_being_issued', message: 'Your coupon is being prepared. Please try again.' };
  }

  const best = await getBestResult(uid, date);
  if (!best) {
    return { ok: false, status: 400, error: 'no_verified_result', message: 'Complete one verified run before claiming a coupon.' };
  }

  const secret = process.env.REWARD_TOKEN_SECRET;
  if (!secret) {
    return { ok: false, status: 503, error: 'reward_unavailable', message: 'Coupon service is temporarily unavailable.' };
  }

  const lockId = randomUUID();
  const dayTtlSeconds = secondsUntilNextUTCMidnight();
  const reserved = await kv.set(
    key,
    { status: 'issuing', lockId },
    { nx: true, ex: dayTtlSeconds },
  );
  if (!reserved) {
    const concurrent = await kv.get(key);
    if (concurrent?.status === 'issued') {
      return { ok: true, alreadyIssued: true, reward: publicReward(concurrent) };
    }
    return { ok: false, status: 409, error: 'reward_is_being_issued', message: 'Your coupon is being prepared. Please try again.' };
  }

  try {
    const { token, payload } = issueRewardToken(
      {
        uid: tokenUid,
        attemptId: best.attemptId,
        game: best.game,
        discountPercent: best.discountPercent,
        expiresAt: Date.now() + dayTtlSeconds * 1000,
      },
      secret,
    );
    const couponTtlSeconds = dayTtlSeconds;
    const attemptsUsed = await getAttemptsUsed(uid, date);
    const reward = {
      status: 'issued',
      rewardToken: token,
      couponCode: payload.couponCode,
      couponId: payload.jti,
      couponExpiresAt: payload.exp,
      discountPercent: best.discountPercent,
      finalScore: best.finalScore,
      bestAttemptNumber: best.attemptNumber,
      attemptsUsed,
    };

    await kv.set(
      `coupon:${payload.jti}`,
      {
        jti: payload.jti,
        uid: tokenUid,
        subject: uid,
        attemptId: best.attemptId,
        game: best.game,
        discountPercent: best.discountPercent,
        couponCode: payload.couponCode,
        issuedAt: payload.issuedAt,
        expiresAt: payload.exp,
        contactChannel: contact?.channel || null,
        contactMasked: contact?.masked || null,
        sealedContactValue: contact?.sealedValue || null,
      },
      { ex: couponTtlSeconds },
    );
    await kv.set(`coupon-code:${payload.couponCode}`, payload.jti, { ex: couponTtlSeconds });
    await kv.set(key, reward, { ex: dayTtlSeconds });
    await kv.incr(`analytics:reward_generated:${date}`);

    return { ok: true, alreadyIssued: false, reward: publicReward(reward) };
  } catch (error) {
    const lock = await kv.get(key);
    if (lock?.status === 'issuing' && lock.lockId === lockId) await kv.del(key);
    throw error;
  }
}
