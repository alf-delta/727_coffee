import { UID_COOKIE } from '../src/server/config.js';
import { hasCurrentConsent, recordConsent } from '../src/server/consent.js';
import { parseCookies, readJsonBody } from '../src/server/request.js';
import { LEGAL_VERSION } from '../src/shared/legal.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const cookies = parseCookies(req);
  const uid = cookies[UID_COOKIE];
  if (!uid) {
    return res.status(400).json({
      error: 'missing_uid',
      message: 'Reload the page and try again.',
    });
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      accepted: await hasCurrentConsent(uid),
      version: LEGAL_VERSION,
    });
  }

  const body = await readJsonBody(req);
  if (
    body.version !== LEGAL_VERSION
    || body.accepted !== true
    || body.ageConfirmed !== true
  ) {
    return res.status(400).json({
      error: 'consent_required',
      message: 'Please confirm your age and accept the current terms.',
      version: LEGAL_VERSION,
    });
  }

  const consent = await recordConsent(uid);
  return res.status(200).json({
    accepted: true,
    version: consent.version,
    acceptedAt: consent.acceptedAt,
  });
}
