import { kv } from '../../src/server/kv.js';
import { readJsonBody } from '../../src/server/request.js';
import { todayUTC } from '../../src/server/date.js';
import { hasCheckerSession } from '../../src/server/checkerAuth.js';
import { revealContact } from '../../src/server/contactIdentity.js';
import { BUSINESS_TIME_ZONE } from '../../src/server/config.js';

function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  if (!process.env.COUPON_STAFF_PIN) {
    return res.status(503).json({
      error: 'redemption_not_configured',
      message: 'Coupon redemption is not configured for this location.',
    });
  }

  const body = await readJsonBody(req);
  if (!(await hasCheckerSession(req))) {
    return res.status(401).json({
      error: 'checker_authentication_required',
      message: 'Staff sign-in is required.',
    });
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

  let email = null;
  if (coupon.contactChannel === 'email' && coupon.sealedContactValue) {
    try {
      email = revealContact({ sealedValue: coupon.sealedContactValue });
    } catch (error) {
      console.error('[coupon-contact]', error);
    }
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
      discountPercent: coupon.discountPercent,
      email,
      maskedEmail: coupon.contactChannel === 'email'
        ? coupon.contactMasked
        : null,
      issuedAt: coupon.issuedAt,
      expiresAt: coupon.expiresAt,
      timeZone: BUSINESS_TIME_ZONE,
      redeemedAt: existing?.redeemedAt ?? null,
    });
  }

  await kv.incr(`analytics:coupon_redeemed:${todayUTC()}`);
  return res.status(200).json({
    valid: true,
    status: 'redeemed',
    discountPercent: coupon.discountPercent,
    game: coupon.game,
    email,
    maskedEmail: coupon.contactChannel === 'email'
      ? coupon.contactMasked
      : null,
    issuedAt: coupon.issuedAt,
    expiresAt: coupon.expiresAt,
    timeZone: BUSINESS_TIME_ZONE,
    remainingSeconds: Math.max(0, Math.floor((coupon.expiresAt - redeemedAt) / 1000)),
    redeemedAt,
  });
}
