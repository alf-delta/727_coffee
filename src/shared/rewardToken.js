/**
 * Reward token sign/verify. Node-only (uses node:crypto) — imported by the
 * /api serverless functions, never by client code.
 */
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const COUPON_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function fromBase64url(input) {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function sign(payloadB64, secret) {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

function createCouponCode(length = 8) {
  const bytes = randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += COUPON_ALPHABET[bytes[i] % COUPON_ALPHABET.length];
  }
  return code;
}

/**
 * @param {{uid:string, attemptId:string, game:string, discountPercent:number}} data
 * @param {string} secret
 * @param {number} ttlMinutes
 */
export function issueRewardToken(data, secret, ttlMinutes = 20) {
  const now = Date.now();
  const payload = {
    jti: randomUUID(),
    uid: data.uid,
    attemptId: data.attemptId,
    game: data.game,
    discountPercent: data.discountPercent,
    couponCode: createCouponCode(),
    issuedAt: now,
    exp: now + ttlMinutes * 60 * 1000,
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  const signature = sign(payloadB64, secret);
  return { token: `${payloadB64}.${signature}`, payload };
}

/** Verifies signature + expiry. Does NOT check single-use — caller must check/mark KV. */
export function verifyRewardToken(token, secret) {
  const [payloadB64, signature] = String(token).split('.');
  if (!payloadB64 || !signature) return { valid: false, reason: 'malformed' };
  const expected = sign(payloadB64, secret);
  if (expected.length !== signature.length) return { valid: false, reason: 'bad_signature' };
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  const same = a.length === b.length && timingSafeEqual(a, b);
  if (!same) return { valid: false, reason: 'bad_signature' };
  const payload = JSON.parse(fromBase64url(payloadB64));
  if (Date.now() > payload.exp) return { valid: false, reason: 'expired', payload };
  return { valid: true, payload };
}
