import { kv } from './kv.js';
import { LEGAL_VERSION } from '../shared/legal.js';

function consentKey(uid) {
  return `legal-consent:${uid}`;
}

export async function getConsent(uid) {
  return kv.get(consentKey(uid));
}

export async function hasCurrentConsent(uid) {
  const consent = await getConsent(uid);
  return Boolean(
    consent
    && consent.version === LEGAL_VERSION
    && consent.ageConfirmed === true
    && consent.acceptedAt,
  );
}

export async function recordConsent(uid) {
  const consent = {
    version: LEGAL_VERSION,
    ageConfirmed: true,
    acceptedAt: Date.now(),
  };
  await kv.set(consentKey(uid), consent);
  return consent;
}
