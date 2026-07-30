export const UID_COOKIE = 'mb_uid';

export const BASE_ATTEMPTS_PER_DAY = 3;
export const VERIFIED_ATTEMPTS_PER_DAY = 4;
export const MAX_ATTEMPTS_PER_DAY = BASE_ATTEMPTS_PER_DAY;
export const REWARDED_ATTEMPTS_PER_DAY = 1;
export const CONTACT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 60;
export const VERIFICATION_TTL_SECONDS = 10 * 60;
export const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || 'America/New_York';
export const CONTACT_VERIFICATION_MODE = process.env.CONTACT_VERIFICATION_MODE === 'phone-email-bonus'
  ? 'phone-email-bonus'
  : 'email-only';
export const EMAIL_ONLY_CONTACT_MODE = CONTACT_VERIFICATION_MODE === 'email-only';

export const GAMES = {
  flappy: { label: 'Flying Syrnik' },
  tap: { label: 'Tap Pressure' },
};
