import { createHmac, randomInt, randomUUID } from 'node:crypto';
import {
  EMAIL_ONLY_CONTACT_MODE,
  UID_COOKIE,
  VERIFICATION_TTL_SECONDS,
} from '../../src/server/config.js';
import {
  contactIdentityHash,
  encryptContact,
  getPlayerContext,
  maskContact,
  normalizeContact,
} from '../../src/server/contactIdentity.js';
import { sendVerification } from '../../src/server/contactProviders.js';
import { hasCurrentConsent } from '../../src/server/consent.js';
import { todayUTC } from '../../src/server/date.js';
import { kv } from '../../src/server/kv.js';
import { parseCookies, readJsonBody } from '../../src/server/request.js';
import { MARKETING_CONSENT_VERSION } from '../../src/shared/legal.js';

function codeHash(challengeId, code) {
  const secret = process.env.IDENTITY_HMAC_SECRET || process.env.REWARD_TOKEN_SECRET;
  if (!secret) throw new Error('identity_secret_missing');
  return createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const uid = parseCookies(req)[UID_COOKIE];
  if (!uid) return res.status(400).json({ error: 'missing_uid', message: 'Reload the page and try again.' });
  if (!(await hasCurrentConsent(uid))) {
    return res.status(403).json({ error: 'consent_required', message: 'Accept the game terms before verifying a contact.' });
  }

  const body = await readJsonBody(req);
  const channel = body.channel;
  const date = todayUTC();
  const player = await getPlayerContext(uid, date);
  const best = await kv.get(`game-best:${player.subject}:${date}`);
  const reward = await kv.get(`rewarded:${player.subject}:${date}`);

  if (EMAIL_ONLY_CONTACT_MODE) {
    if (channel !== 'email') {
      return res.status(400).json({
        error: 'verification_channel_unavailable',
        message: 'Email verification is currently available for coupon delivery.',
      });
    }
    if (player.verified) {
      return res.status(409).json({
        error: 'email_already_verified',
        message: 'Your email is already verified.',
      });
    }
    if (!best) {
      return res.status(403).json({
        error: 'verified_result_required',
        message: 'Complete a verified run before requesting a coupon.',
      });
    }
    if (reward) {
      return res.status(409).json({
        error: 'coupon_already_claimed',
        message: 'Your coupon has already been issued for today.',
      });
    }
  } else if (channel === 'email') {
    if (!player.phoneVerified) {
      return res.status(403).json({
        error: 'phone_verification_required',
        message: 'Verify your mobile number before unlocking an extra run with email.',
      });
    }
    if (player.emailVerified) {
      return res.status(409).json({
        error: 'email_already_verified',
        message: 'Your extra run is already unlocked.',
      });
    }
    if (reward) {
      return res.status(409).json({
        error: 'coupon_already_claimed',
        message: 'Your coupon has already been issued for today.',
      });
    }
  } else if (channel === 'sms' && player.phoneVerified) {
    return res.status(409).json({
      error: 'phone_already_verified',
      message: 'Your mobile number is already verified.',
    });
  } else if (channel === 'sms' && !best) {
    return res.status(403).json({
      error: 'verified_result_required',
      message: 'Complete a verified run before requesting a coupon.',
    });
  } else if (channel !== 'sms') {
    return res.status(400).json({
      error: 'invalid_channel',
      message: 'Choose a valid verification method.',
    });
  }

  let destination;
  try {
    destination = normalizeContact(channel, body.value);
  } catch (error) {
    const isPhone = error.message === 'invalid_phone';
    return res.status(400).json({
      error: error.message,
      message: isPhone
        ? 'Enter a valid mobile number, including country code.'
        : 'Enter a valid email address.',
    });
  }

  let identityHash;
  try {
    identityHash = contactIdentityHash(channel, destination);
  } catch {
    return res.status(503).json({ error: 'verification_not_configured', message: 'Verification is not configured yet.' });
  }

  const cooldownKey = `verify-cooldown:${identityHash}`;
  const cooldown = await kv.set(cooldownKey, 1, { nx: true, ex: 45 });
  if (!cooldown) {
    return res.status(429).json({
      error: 'code_recently_sent',
      message: 'A code was just sent. Please wait before requesting another.',
      retryAfterSeconds: 45,
    });
  }

  const hourlyKey = `verify-hour:${identityHash}`;
  const sentThisHour = await kv.incr(hourlyKey);
  if (sentThisHour === 1) await kv.expire(hourlyKey, 60 * 60);
  if (sentThisHour > 5) {
    return res.status(429).json({
      error: 'verification_rate_limited',
      message: 'Too many verification requests. Please try again later.',
    });
  }

  const challengeId = randomUUID();
  const code = String(randomInt(100000, 1000000));
  try {
    const delivery = await sendVerification({
      channel,
      destination,
      code,
      challengeId,
    });
    await kv.set(
      `verification:${challengeId}`,
      {
        uid,
        channel,
        identityHash,
        masked: maskContact(channel, destination),
        sealedDestination: encryptContact(destination),
        codeHash: codeHash(challengeId, code),
        providerMode: delivery.mode,
        createdAt: Date.now(),
        marketingConsent: channel === 'email' && body.marketingConsent === true,
        marketingConsentVersion: MARKETING_CONSENT_VERSION,
      },
      { ex: VERIFICATION_TTL_SECONDS },
    );
    return res.status(200).json({
      sent: true,
      challengeId,
      channel,
      masked: maskContact(channel, destination),
      expiresInSeconds: VERIFICATION_TTL_SECONDS,
      ...(delivery.devCode ? { devCode: delivery.devCode } : {}),
    });
  } catch (error) {
    await kv.del(cooldownKey);
    console.error('[verification-send]', error);
    return res.status(503).json({
      error: 'verification_delivery_failed',
      message: channel === 'sms'
        ? 'We could not send the text message. Please try again later.'
        : 'We could not send the email. Please try again.',
    });
  }
}
