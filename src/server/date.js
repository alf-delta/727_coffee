import { BUSINESS_TIME_ZONE } from './config.js';

/** Business-calendar helpers used to key and expire daily game state. */
export function todayUTC() {
  const parts = zonedParts(Date.now());
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function secondsUntilNextUTCMidnight() {
  const now = Date.now();
  const local = zonedParts(now);
  const nextDate = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  const wallClockMidnight = Date.UTC(
    nextDate.getUTCFullYear(),
    nextDate.getUTCMonth(),
    nextDate.getUTCDate(),
  );

  let target = wallClockMidnight - timeZoneOffsetMs(wallClockMidnight);
  target = wallClockMidnight - timeZoneOffsetMs(target);
  return Math.max(1, Math.ceil((target - now) / 1000));
}

function zonedParts(epochMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(epochMs));
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

function timeZoneOffsetMs(epochMs) {
  const roundedEpoch = Math.floor(epochMs / 1000) * 1000;
  const parts = zonedParts(roundedEpoch);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - roundedEpoch;
}
