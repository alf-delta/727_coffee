import { parseCookies, readJsonBody } from '../../src/server/request.js';
import { UID_COOKIE } from '../../src/server/config.js';
import { todayUTC } from '../../src/server/date.js';
import { claimBestReward, getBestResult, getAttemptsUsed } from '../../src/server/gameSet.js';
import {
  getPlayerContext,
  publicContact,
} from '../../src/server/contactIdentity.js';
import { deliverRewardToContact } from '../../src/server/couponDelivery.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const cookies = parseCookies(req);
  const uid = cookies[UID_COOKIE];
  if (!uid) return res.status(400).json({ error: 'missing_uid', message: 'Reload the page and try again.' });

  const body = await readJsonBody(req);
  if (body.game !== 'flappy' && body.game !== 'tap') {
    return res.status(400).json({ error: 'invalid_game' });
  }

  const date = todayUTC();
  const context = await getPlayerContext(uid, date);
  if (!context.phoneVerified) {
    return res.status(403).json({
      valid: false,
      error: 'phone_verification_required',
      message: 'Verify your mobile number to receive your coupon.',
    });
  }

  const best = await getBestResult(context.subject, date);
  if (best && best.game !== body.game) {
    return res.status(403).json({ error: 'wrong_game', message: 'This result belongs to another game.' });
  }

  const claimed = await claimBestReward(context.subject, date, uid);
  if (!claimed.ok) {
    return res.status(claimed.status).json({
      valid: false,
      error: claimed.error,
      message: claimed.message,
    });
  }

  const delivery = await deliverRewardToContact(context.contact, claimed.reward);
  const attemptsUsed = await getAttemptsUsed(context.subject, date);
  return res.status(200).json({
    valid: true,
    ...claimed.reward,
    attemptsUsed,
    attemptsRemainingToday: Math.max(0, context.attemptLimit - attemptsUsed),
    contact: publicContact(context.contact),
    delivery,
    bestResult: true,
  });
}
