import { createHash } from 'node:crypto';
import {
  CHECKER_SESSION_TTL_SECONDS,
  checkerCookie,
  createCheckerSession,
  hasCheckerSession,
  verifyCheckerPassword,
} from '../../src/server/checkerAuth.js';
import { kv } from '../../src/server/kv.js';
import { readJsonBody } from '../../src/server/request.js';

function clientKey(req) {
  const source = String(
    req.headers?.['x-forwarded-for']
    || req.headers?.['x-real-ip']
    || 'unknown',
  ).split(',')[0].trim();
  return createHash('sha256').update(source).digest('hex').slice(0, 24);
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      authenticated: await hasCheckerSession(req),
    });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!process.env.COUPON_STAFF_PIN) {
    return res.status(503).json({
      error: 'checker_not_configured',
      message: 'Coupon checker access is not configured.',
    });
  }

  const rateKey = `checker-login:${clientKey(req)}`;
  const attempts = Number(await kv.get(rateKey)) || 0;
  if (attempts >= 10) {
    return res.status(429).json({
      error: 'login_rate_limited',
      message: 'Too many sign-in attempts. Please try again in 15 minutes.',
    });
  }

  const body = await readJsonBody(req);
  if (!verifyCheckerPassword(body.password)) {
    const nextAttempts = await kv.incr(rateKey);
    if (nextAttempts === 1) await kv.expire(rateKey, 15 * 60);
    return res.status(403).json({
      error: 'invalid_checker_password',
      message: 'Incorrect password.',
    });
  }

  await kv.del(rateKey);
  const token = await createCheckerSession();
  res.setHeader('Set-Cookie', checkerCookie(token));
  return res.status(200).json({
    authenticated: true,
    expiresInSeconds: CHECKER_SESSION_TTL_SECONDS,
  });
}
