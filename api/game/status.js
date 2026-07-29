import { parseCookies } from '../../src/server/request.js';
import { UID_COOKIE, MAX_ATTEMPTS_PER_DAY } from '../../src/server/config.js';
import { todayUTC } from '../../src/server/date.js';
import { getDailyGameChoice } from '../../src/server/gameChoice.js';
import { getAttemptsUsed } from '../../src/server/gameSet.js';

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

  const date = todayUTC();
  const [selectedGame, attemptsUsed] = await Promise.all([
    getDailyGameChoice(uid, date),
    getAttemptsUsed(uid, date),
  ]);
  const attemptsRemainingToday = Math.max(0, MAX_ATTEMPTS_PER_DAY - attemptsUsed);

  return res.status(200).json({
    selectedGame,
    attemptsUsed,
    attemptsRemainingToday,
    exhausted: attemptsRemainingToday === 0,
    canChoose: !selectedGame && attemptsRemainingToday > 0,
  });
}
