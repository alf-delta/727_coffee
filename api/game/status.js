import { parseCookies } from '../../src/server/request.js';
import {
  BASE_ATTEMPTS_PER_DAY,
  EMAIL_ONLY_CONTACT_MODE,
  UID_COOKIE,
} from '../../src/server/config.js';
import { todayUTC } from '../../src/server/date.js';
import { getDailyGameChoice } from '../../src/server/gameChoice.js';
import { getAttemptsUsed } from '../../src/server/gameSet.js';
import { hasCurrentConsent } from '../../src/server/consent.js';
import { kv } from '../../src/server/kv.js';
import {
  getPlayerContext,
  publicContact,
} from '../../src/server/contactIdentity.js';
import { LEGAL_VERSION } from '../../src/shared/legal.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const cookies = parseCookies(req);
  const uid = cookies[UID_COOKIE];
  if (!uid) {
    return res.status(400).json({
      error: 'missing_uid',
      message: 'Reload the page and try again.',
    });
  }

  if (!(await hasCurrentConsent(uid))) {
    return res.status(200).json({
      consentRequired: true,
      legalVersion: LEGAL_VERSION,
    });
  }

  const date = todayUTC();
  const context = await getPlayerContext(uid, date);
  const [selectedGame, attemptsUsed, reward, best] = await Promise.all([
    getDailyGameChoice(context.subject, date),
    getAttemptsUsed(context.subject, date),
    kv.get(`rewarded:${context.subject}:${date}`),
    kv.get(`game-best:${context.subject}:${date}`),
  ]);
  const attemptsRemainingToday = Math.max(0, context.attemptLimit - attemptsUsed);
  const contactVerificationRequired = EMAIL_ONLY_CONTACT_MODE
    && !context.verified
    && attemptsUsed >= BASE_ATTEMPTS_PER_DAY
    && Boolean(best);
  const phoneVerificationRequired = !EMAIL_ONLY_CONTACT_MODE
    && !context.phoneVerified
    && attemptsUsed >= BASE_ATTEMPTS_PER_DAY;
  const postPhoneActionRequired = !EMAIL_ONLY_CONTACT_MODE
    && context.phoneVerified
    && !context.emailVerified
    && !reward
    && Boolean(best);
  const couponClaimRequired = EMAIL_ONLY_CONTACT_MODE
    && context.verified
    && !reward
    && Boolean(best)
    && attemptsRemainingToday === 0;

  return res.status(200).json({
    selectedGame,
    attemptsUsed,
    attemptsRemainingToday,
    attemptLimit: context.attemptLimit,
    verified: context.verified,
    phoneVerified: context.phoneVerified,
    emailVerified: context.emailVerified,
    contact: publicContact(context.contact),
    emailContact: publicContact(context.emailContact),
    verificationChannel: EMAIL_ONLY_CONTACT_MODE ? 'email' : 'sms',
    contactVerificationRequired,
    emailVerificationRequired: contactVerificationRequired,
    phoneVerificationRequired,
    postPhoneActionRequired,
    couponClaimRequired,
    exhausted: Boolean(reward)
      || (!EMAIL_ONLY_CONTACT_MODE && context.emailVerified && attemptsRemainingToday === 0),
    canChoose: !selectedGame
      && attemptsRemainingToday > 0
      && !contactVerificationRequired
      && !phoneVerificationRequired,
  });
}
