import { timingSafeEqual } from 'node:crypto';
import { kv } from '../../src/server/kv.js';
import { readJsonBody } from '../../src/server/request.js';
import { todayUTC } from '../../src/server/date.js';

function sameSecret(received, expected) {
  const a = Buffer.from(String(received || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const staffPin = process.env.COUPON_STAFF_PIN;
  if (!staffPin) {
    return res.status(503).json({
      error: 'redemption_not_configured',
      message: 'Coupon redemption is not configured for this location.',
    });
  }

  const body = await readJsonBody(req);
  if (!sameSecret(body.pin, staffPin)) {
    return res.status(403).json({ error: 'invalid_staff_pin', message: 'Incorrect staff PIN.' });
  }

  const code = normalizeCode(body.code);
  if (code.length !== 8) {
    return res.status(400).json({ error: 'invalid_code', message: 'Enter the 8-character coupon code.' });
  }

  const jti = await kv.get(`coupon-code:${code}`);
  if (!jti) {
    return res.status(404).json({ error: 'coupon_not_found', message: 'Coupon not found or expired.' });
  }

  const coupon = await kv.get(`coupon:${jti}`);
  if (!coupon || Date.now() > coupon.expiresAt) {
    return res.status(410).json({ error: 'coupon_expired', message: 'This coupon has expired.' });
  }

  const ttlSeconds = Math.max(1, Math.ceil((coupon.expiresAt - Date.now()) / 1000));
  const redeemedAt = Date.now();
  const firstRedemption = await kv.set(
    `coupon-used:${jti}`,
    { redeemedAt, code },
    { nx: true, ex: ttlSeconds },
  );

  if (!firstRedemption) {
    const existing = await kv.get(`coupon-used:${jti}`);
    return res.status(409).json({
      error: 'coupon_already_redeemed',
      message: 'This coupon has already been redeemed.',
      redeemedAt: existing?.redeemedAt ?? null,
    });
  }

  await kv.incr(`analytics:coupon_redeemed:${todayUTC()}`);
  return res.status(200).json({
    valid: true,
    status: 'redeemed',
    discountPercent: coupon.discountPercent,
    game: coupon.game,
    redeemedAt,
  });
}
