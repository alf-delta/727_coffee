import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BASE_ATTEMPTS_PER_DAY,
  EMAIL_ONLY_CONTACT_MODE,
  UID_COOKIE,
  VERIFIED_ATTEMPTS_PER_DAY,
} from '../../src/server/config.js';
import {
  decryptContact,
  linkVerifiedEmail,
  linkVerifiedEmailBonus,
  linkVerifiedPhone,
  publicContact,
} from '../../src/server/contactIdentity.js';
import { checkTwilioVerification } from '../../src/server/contactProviders.js';
import { todayUTC } from '../../src/server/date.js';
import { getAttemptsUsed } from '../../src/server/gameSet.js';
import { kv } from '../../src/server/kv.js';
import { parseCookies, readJsonBody } from '../../src/server/request.js';

function codeHash(challengeId, code) {
  const secret = process.env.IDENTITY_HMAC_SECRET || process.env.REWARD_TOKEN_SECRET;
  if (!secret) throw new Error('identity_secret_missing');
  return createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');
}

function sameHash(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const uid = parseCookies(req)[UID_COOKIE];
  if (!uid) return res.status(400).json({ error: 'missing_uid', message: 'Reload the page and try again.' });

  const body = await readJsonBody(req);
  const challengeId = String(body.challengeId || '');
  const code = String(body.code || '').replace(/\D/g, '').slice(0, 10);
  if (!challengeId || code.length < 4) {
    return res.status(400).json({ error: 'invalid_code', message: 'Enter the verification code.' });
  }

  const challenge = await kv.get(`verification:${challengeId}`);
  if (!challenge || challenge.uid !== uid) {
    return res.status(410).json({
      error: 'verification_expired',
      message: 'This code has expired. Request a new one.',
    });
  }

  const checksKey = `verification-checks:${challengeId}`;
  const checks = await kv.incr(checksKey);
  if (checks === 1) await kv.expire(checksKey, 10 * 60);
  if (checks > 5) {
    await kv.del(`verification:${challengeId}`);
    return res.status(429).json({
      error: 'verification_attempts_exhausted',
      message: 'Too many incorrect attempts. Request a new code.',
    });
  }

  let destination;
  let approved = false;
  try {
    destination = decryptContact(challenge.sealedDestination);
    approved = challenge.providerMode === 'twilio-verify'
      ? await checkTwilioVerification({ destination, code })
      : sameHash(challenge.codeHash, codeHash(challengeId, code));
  } catch (error) {
    console.error('[verification-check]', error);
    return res.status(503).json({
      error: 'verification_check_failed',
      message: 'We could not check the code. Please try again.',
    });
  }

  if (!approved) {
    return res.status(400).json({
      error: 'incorrect_code',
      message: 'That code is not correct. Please try again.',
      attemptsRemaining: Math.max(0, 5 - checks),
    });
  }

  const date = todayUTC();
  let contact;
  let emailContact = null;
  try {
    if (EMAIL_ONLY_CONTACT_MODE) {
      if (challenge.channel !== 'email') {
        return res.status(400).json({
          error: 'verification_channel_unavailable',
          message: 'Email verification is currently available for coupon delivery.',
        });
      }
      contact = await linkVerifiedEmail(uid, date, {
        normalizedValue: destination,
      });
      emailContact = contact;
    } else if (challenge.channel === 'sms') {
      contact = await linkVerifiedPhone(uid, date, {
        normalizedValue: destination,
      });
    } else {
      const linked = await linkVerifiedEmailBonus(uid, date, {
        normalizedValue: destination,
      });
      contact = linked.phone;
      emailContact = linked.emailContact;
    }
  } catch (error) {
    if (error.message === 'phone_verification_required') {
      return res.status(403).json({
        error: error.message,
        message: 'Verify your mobile number first.',
      });
    }
    if (error.message === 'email_already_used_today') {
      return res.status(409).json({
        error: error.message,
        message: 'This email has already unlocked an extra run today.',
      });
    }
    throw error;
  }
  await kv.del(`verification:${challengeId}`);

  const subject = `identity:${contact.identityHash}`;
  const attemptsUsed = await getAttemptsUsed(subject, date);
  const attemptLimit = !EMAIL_ONLY_CONTACT_MODE && emailContact
    ? VERIFIED_ATTEMPTS_PER_DAY
    : BASE_ATTEMPTS_PER_DAY;
  return res.status(200).json({
    verified: true,
    verificationType: challenge.channel === 'sms' ? 'phone' : 'email',
    contact: publicContact(contact),
    emailContact: publicContact(emailContact),
    attemptsUsed,
    attemptsRemainingToday: Math.max(0, attemptLimit - attemptsUsed),
    bonusAttemptUnlocked: !EMAIL_ONLY_CONTACT_MODE
      && Boolean(emailContact)
      && attemptsUsed < VERIFIED_ATTEMPTS_PER_DAY,
  });
}
