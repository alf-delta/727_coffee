import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { kv } from './kv.js';
import { parseCookies } from './request.js';

export const CHECKER_COOKIE = 'mb_checker';
export const CHECKER_SESSION_TTL_SECONDS = 60 * 60 * 12;

function sameSecret(received, expected) {
  const left = Buffer.from(String(received || ''));
  const right = Buffer.from(String(expected || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

function sessionKey(token) {
  const digest = createHash('sha256').update(String(token || '')).digest('hex');
  return `checker-session:${digest}`;
}

export function verifyCheckerPassword(password) {
  const expected = process.env.COUPON_STAFF_PIN;
  return Boolean(expected) && sameSecret(password, expected);
}

export async function createCheckerSession() {
  const token = randomBytes(32).toString('base64url');
  await kv.set(
    sessionKey(token),
    { createdAt: Date.now() },
    { ex: CHECKER_SESSION_TTL_SECONDS },
  );
  return token;
}

export async function hasCheckerSession(req) {
  const token = parseCookies(req)[CHECKER_COOKIE];
  if (!token) return false;
  return Boolean(await kv.get(sessionKey(token)));
}

export async function destroyCheckerSession(req) {
  const token = parseCookies(req)[CHECKER_COOKIE];
  if (token) await kv.del(sessionKey(token));
}

export function checkerCookie(token, { clear = false } = {}) {
  const secure = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
  const parts = [
    `${CHECKER_COOKIE}=${clear ? '' : token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    clear
      ? 'Max-Age=0'
      : `Max-Age=${CHECKER_SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
