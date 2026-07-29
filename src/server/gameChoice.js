import { kv } from './kv.js';
import { secondsUntilNextUTCMidnight } from './date.js';

const VALID_GAMES = new Set(['flappy', 'tap']);

function choiceKey(uid, date) {
  return `game-choice:${uid}:${date}`;
}

export async function getDailyGameChoice(uid, date) {
  const game = await kv.get(choiceKey(uid, date));
  return VALID_GAMES.has(game) ? game : null;
}

export async function lockDailyGameChoice(uid, date, requestedGame) {
  if (!VALID_GAMES.has(requestedGame)) return null;

  const existing = await getDailyGameChoice(uid, date);
  if (existing) return existing;

  const selected = await kv.set(
    choiceKey(uid, date),
    requestedGame,
    { nx: true, ex: secondsUntilNextUTCMidnight() },
  );
  if (selected) return requestedGame;

  return getDailyGameChoice(uid, date);
}
