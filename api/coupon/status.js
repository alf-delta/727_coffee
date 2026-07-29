import { kv } from '../../src/server/kv.js';
import { readJsonBody } from '../../src/server/request.js';
import { verifyRewardToken } from '../../src/shared/rewardToken.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const secret = process.env.REWARD_TOKEN_SECRET;
  if (!secret) return res.status(503).json({ error: 'reward_verification_unavailable' });

  const body = await readJsonBody(req);
  const verified = verifyRewardToken(body.token, secret);
  if (!verified.valid) {
    return res.status(400).json({
      valid: false,
      status: verified.reason === 'expired' ? 'expired' : 'invalid',
    });
  }

  const coupon = await kv.get(`coupon:${verified.payload.jti}`);
  if (!coupon) return res.status(410).json({ valid: false, status: 'expired' });

  const redemption = await kv.get(`coupon-used:${verified.payload.jti}`);
  return res.status(200).json({
    valid: true,
    status: redemption ? 'redeemed' : 'issued',
    discountPercent: coupon.discountPercent,
    couponCode: coupon.couponCode,
    expiresAt: coupon.expiresAt,
    redeemedAt: redemption?.redeemedAt ?? null,
  });
}
