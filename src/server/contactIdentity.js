import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { kv } from './kv.js';
import { secondsUntilNextUTCMidnight } from './date.js';
import {
  BASE_ATTEMPTS_PER_DAY,
  CONTACT_SESSION_TTL_SECONDS,
  VERIFIED_ATTEMPTS_PER_DAY,
} from './config.js';

function identitySecret() {
  const secret = process.env.IDENTITY_HMAC_SECRET || process.env.REWARD_TOKEN_SECRET;
  if (!secret) throw new Error('identity_secret_missing');
  return secret;
}

export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new Error('invalid_email');
  }
  return email;
}

export function normalizePhone(value) {
  const raw = String(value || '').trim();
  let digits = raw.replace(/\D/g, '');
  if (!raw.startsWith('+')) {
    if (digits.length === 10) digits = `1${digits}`;
    if (digits.length !== 11 || !digits.startsWith('1')) throw new Error('invalid_phone');
  }
  if (digits.length < 8 || digits.length > 15) throw new Error('invalid_phone');
  return `+${digits}`;
}

export function normalizeContact(channel, value) {
  if (channel === 'sms') return normalizePhone(value);
  if (channel === 'email') return normalizeEmail(value);
  throw new Error('invalid_channel');
}

export function contactIdentityHash(channel, normalizedValue) {
  return createHmac('sha256', identitySecret())
    .update(`${channel}:${normalizedValue}`)
    .digest('hex');
}

export function maskContact(channel, normalizedValue) {
  if (channel === 'sms') return `••• ••• ${normalizedValue.slice(-4)}`;
  const [local, domain] = normalizedValue.split('@');
  return `${local.slice(0, 1)}•••@${domain}`;
}

function encryptionKey() {
  return createHash('sha256').update(`contact:${identitySecret()}`).digest();
}

export function encryptContact(normalizedValue) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(normalizedValue, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptContact(sealedValue) {
  const [ivB64, tagB64, encryptedB64] = String(sealedValue || '').split('.');
  if (!ivB64 || !tagB64 || !encryptedB64) throw new Error('invalid_contact_ciphertext');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivB64, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function contactKey(uid) {
  return `verified-contact:${uid}`;
}

export async function getVerifiedContact(uid) {
  const contact = await kv.get(contactKey(uid));
  return contact?.channel === 'sms' ? contact : null;
}

export function publicContact(contact) {
  if (!contact) return null;
  return {
    channel: contact.channel,
    masked: contact.masked,
    verifiedAt: contact.verifiedAt,
    marketingConsent: Boolean(contact.marketingConsent),
  };
}

function emailBonusKey(subject, date) {
  return `email-bonus:${subject}:${date}`;
}

export async function getPlayerContext(uid, date) {
  const contact = await getVerifiedContact(uid);
  const subject = contact ? `identity:${contact.identityHash}` : uid;
  const emailBonus = contact && date
    ? await kv.get(emailBonusKey(subject, date))
    : null;
  return {
    contact,
    verified: Boolean(contact),
    phoneVerified: Boolean(contact),
    emailVerified: Boolean(emailBonus),
    emailContact: emailBonus,
    subject,
    attemptLimit: emailBonus ? VERIFIED_ATTEMPTS_PER_DAY : BASE_ATTEMPTS_PER_DAY,
  };
}

function betterResult(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.discountPercent !== b.discountPercent) {
    return a.discountPercent > b.discountPercent ? a : b;
  }
  return a.finalScore >= b.finalScore ? a : b;
}

async function migrateDailyProgress(uid, identitySubject, date) {
  const ttl = secondsUntilNextUTCMidnight();
  const [
    anonymousAttemptsRaw,
    identityAttemptsRaw,
    anonymousChoice,
    identityChoice,
    anonymousBest,
    identityBest,
  ] = await Promise.all([
    kv.get(`attempts:${uid}:${date}`),
    kv.get(`attempts:${identitySubject}:${date}`),
    kv.get(`game-choice:${uid}:${date}`),
    kv.get(`game-choice:${identitySubject}:${date}`),
    kv.get(`game-best:${uid}:${date}`),
    kv.get(`game-best:${identitySubject}:${date}`),
  ]);

  const attempts = Math.max(
    Number(anonymousAttemptsRaw) || 0,
    Number(identityAttemptsRaw) || 0,
  );
  const choice = identityChoice || anonymousChoice || null;
  const compatibleAnonymousBest = !choice || anonymousBest?.game === choice ? anonymousBest : null;
  const compatibleIdentityBest = !choice || identityBest?.game === choice ? identityBest : null;
  const best = betterResult(compatibleIdentityBest, compatibleAnonymousBest);

  if (attempts > 0) await kv.set(`attempts:${identitySubject}:${date}`, attempts, { ex: ttl });
  if (choice) await kv.set(`game-choice:${identitySubject}:${date}`, choice, { ex: ttl });
  if (best) await kv.set(`game-best:${identitySubject}:${date}`, best, { ex: ttl });
}

export async function linkVerifiedPhone(uid, date, {
  normalizedValue,
}) {
  const channel = 'sms';
  const identityHash = contactIdentityHash(channel, normalizedValue);
  const identitySubject = `identity:${identityHash}`;
  await migrateDailyProgress(uid, identitySubject, date);

  const contact = {
    channel,
    identityHash,
    masked: maskContact(channel, normalizedValue),
    sealedValue: encryptContact(normalizedValue),
    verifiedAt: Date.now(),
    marketingConsent: false,
    marketingConsentAt: null,
  };
  await kv.set(contactKey(uid), contact, { ex: CONTACT_SESSION_TTL_SECONDS });
  return contact;
}

export async function linkVerifiedEmailBonus(uid, date, { normalizedValue }) {
  const phone = await getVerifiedContact(uid);
  if (!phone) {
    const error = new Error('phone_verification_required');
    error.status = 403;
    throw error;
  }

  const subject = `identity:${phone.identityHash}`;
  const emailIdentityHash = contactIdentityHash('email', normalizedValue);
  const ownerKey = `email-bonus-owner:${emailIdentityHash}:${date}`;
  const ttl = secondsUntilNextUTCMidnight();
  const existingOwner = await kv.get(ownerKey);
  if (existingOwner && existingOwner !== subject) {
    const error = new Error('email_already_used_today');
    error.status = 409;
    throw error;
  }

  if (!existingOwner) {
    const reserved = await kv.set(ownerKey, subject, { nx: true, ex: ttl });
    if (!reserved) {
      const concurrentOwner = await kv.get(ownerKey);
      if (concurrentOwner !== subject) {
        const error = new Error('email_already_used_today');
        error.status = 409;
        throw error;
      }
    }
  }

  const emailContact = {
    channel: 'email',
    identityHash: emailIdentityHash,
    masked: maskContact('email', normalizedValue),
    verifiedAt: Date.now(),
  };
  await kv.set(emailBonusKey(subject, date), emailContact, { ex: ttl });
  return { phone, emailContact, subject };
}

export function revealContact(contact) {
  return decryptContact(contact.sealedValue);
}
