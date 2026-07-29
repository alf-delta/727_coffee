/**
 * Tap Pressure — shared deterministic signal-processing module, ported from
 * game_tap.json. Same function runs client-side (live speedometer) and
 * server-side (authoritative recompute from raw tap timestamps) — one
 * source of truth, "recalculate_score_on_server" holds by construction.
 */

export const PHYSICS_VERSION = 'tap-pressure-1.0.0';

export const SESSION = {
  countdownSeconds: 3,
  activeDurationMs: 6000,
  scoringDurationMs: 5000,
  warmupDurationMs: 1000,
  resultAnimationDurationMs: 2500,
  scoreWindowStartMs: 1000,
  scoreWindowEndMs: 6000,
};

export const RATE_LIMITS = {
  hardMaxTapsPerSecond: 12,
  minIntervalMs: 83.333,
  intervalToleranceMs: 3,
  windows: [
    { windowMs: 1000, maxTaps: 12 },
    { windowMs: 500, maxTaps: 6 },
    { windowMs: 250, maxTaps: 3 },
  ],
};

export const ROLLING_SPEED = {
  primaryWindowMs: 750,
  secondaryWindowMs: 1500,
  primaryWeight: 0.7,
  secondaryWeight: 0.3,
  maxTps: 12,
};

export const SMOOTHING = {
  alphaAcceleration: 0.38,
  alphaDeceleration: 0.24,
};

export const INACTIVITY_DECAY = {
  startsAfterMs: 180,
  decayPerSecondTps: 7.5,
  resetToZeroAfterMs: 900,
};

export const RHYTHM = {
  evaluationWindowMs: 2000,
  maxIntervals: 20,
  scoreCurve: [
    { cvMax: 0.08, score: 1 },
    { cvMax: 0.12, score: 0.97 },
    { cvMax: 0.18, score: 0.9 },
    { cvMax: 0.25, score: 0.78 },
    { cvMax: 0.35, score: 0.6 },
    { cvMax: 0.5, score: 0.35 },
    { cvMax: 1, score: 0.1 },
  ],
  minScoreBeforeEnoughSamples: 0.75,
  minIntervalsForFullScore: 6,
};

export const CONTINUITY = {
  targetFloorRatio: 0.72,
  minimumPeakTpsForEvaluation: 5,
  scoreFloor: 0.35,
  scoreCeiling: 1,
};

export const HOLD_THRESHOLDS = [
  { tps: 7, requiredHoldMs: 700 },
  { tps: 8, requiredHoldMs: 850 },
  { tps: 9, requiredHoldMs: 1000 },
  { tps: 10, requiredHoldMs: 1200 },
  { tps: 11, requiredHoldMs: 1400 },
];
export const HOLD_ALLOWED_GAP_MS = 180;

const SAMPLE_INTERVAL_MS = 50;

/**
 * Filters raw pointerdown timestamps (ms, monotonic, relative to session
 * start) against the rolling-window rate limiter + minimum interval.
 * Rejected taps never affect the speedometer, but the caller can inspect
 * `rejectedCount` to raise the `tap_rate_limit_exceeded` security event.
 */
export function filterValidTaps(rawTimestampsMs) {
  const sorted = [...rawTimestampsMs].sort((a, b) => a - b);
  const valid = [];
  let rejectedCount = 0;

  for (const t of sorted) {
    const last = valid[valid.length - 1];
    if (last !== undefined && t - last < RATE_LIMITS.minIntervalMs - RATE_LIMITS.intervalToleranceMs) {
      rejectedCount += 1;
      continue;
    }
    const withinWindow = (windowMs) => valid.filter((v) => t - v < windowMs).length;
    const exceedsWindow = RATE_LIMITS.windows.some((w) => withinWindow(w.windowMs) >= w.maxTaps);
    if (exceedsWindow) {
      rejectedCount += 1;
      continue;
    }
    valid.push(t);
  }

  return { validTaps: valid, rejectedCount };
}

function tapsInWindow(taps, atMs, windowMs) {
  return taps.filter((t) => t <= atMs && atMs - t < windowMs).length;
}

/**
 * Runs the fixed-cadence smoothed-TPS simulation over the whole active
 * duration and returns the sample series plus derived scoring-window
 * aggregates (average/peak/hold/continuity). This is the single function
 * both the client speedometer and the server validator call.
 */
export function computeTapSeries(validTaps, activeDurationMs = SESSION.activeDurationMs) {
  const samples = [];
  let smoothed = 0;
  let lastTapMs = -Infinity;

  for (let t = 0; t <= activeDurationMs; t += SAMPLE_INTERVAL_MS) {
    const moreRecentTap = [...validTaps].reverse().find((tap) => tap <= t);
    if (moreRecentTap !== undefined) lastTapMs = moreRecentTap;
    const sinceLastTap = t - lastTapMs;

    const primaryCount = tapsInWindow(validTaps, t, ROLLING_SPEED.primaryWindowMs);
    const secondaryCount = tapsInWindow(validTaps, t, ROLLING_SPEED.secondaryWindowMs);
    let rawTps = ROLLING_SPEED.primaryWeight * (primaryCount / (ROLLING_SPEED.primaryWindowMs / 1000))
      + ROLLING_SPEED.secondaryWeight * (secondaryCount / (ROLLING_SPEED.secondaryWindowMs / 1000));
    rawTps = Math.min(ROLLING_SPEED.maxTps, Math.max(0, rawTps));

    const alpha = rawTps >= smoothed ? SMOOTHING.alphaAcceleration : SMOOTHING.alphaDeceleration;
    smoothed = alpha * rawTps + (1 - alpha) * smoothed;

    if (sinceLastTap >= INACTIVITY_DECAY.resetToZeroAfterMs) {
      smoothed = 0;
    } else if (sinceLastTap >= INACTIVITY_DECAY.startsAfterMs) {
      const decaySeconds = (sinceLastTap - INACTIVITY_DECAY.startsAfterMs) / 1000;
      smoothed = Math.max(0, smoothed - INACTIVITY_DECAY.decayPerSecondTps * decaySeconds);
    }

    samples.push({ t, smoothedTps: smoothed });
  }

  return samples;
}

function coefficientOfVariation(values) {
  if (values.length < 2) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const lo = Math.floor(sorted.length * 0.05);
  const hi = Math.ceil(sorted.length * 0.95) - 1;
  const winsorized = sorted.slice(lo, Math.max(lo + 1, hi + 1));
  const mean = winsorized.reduce((a, b) => a + b, 0) / winsorized.length;
  if (mean === 0) return 1;
  const variance = winsorized.reduce((a, b) => a + (b - mean) ** 2, 0) / winsorized.length;
  return Math.sqrt(variance) / mean;
}

function rhythmScoreFromCv(cv) {
  for (const entry of RHYTHM.scoreCurve) {
    if (cv <= entry.cvMax) return entry.score;
  }
  return RHYTHM.scoreCurve[RHYTHM.scoreCurve.length - 1].score;
}

/**
 * Derives the full set of authoritative scoring-window metrics from a raw
 * tap timestamp array. Used identically by the client (live projection)
 * and the server (authoritative finish.js recompute).
 */
export function analyzeTapSession(rawTimestampsMs, activeDurationMs = SESSION.activeDurationMs) {
  const { validTaps, rejectedCount } = filterValidTaps(rawTimestampsMs);
  const series = computeTapSeries(validTaps, activeDurationMs);
  const scoringSeries = series.filter((s) => s.t >= SESSION.scoreWindowStartMs && s.t <= SESSION.scoreWindowEndMs);

  const averageScoringTps = scoringSeries.length
    ? scoringSeries.reduce((a, s) => a + s.smoothedTps, 0) / scoringSeries.length
    : 0;

  let peakSmoothedTps = 0;
  let peakReachedAtMs = SESSION.scoreWindowStartMs;
  for (const s of scoringSeries) {
    if (s.smoothedTps > peakSmoothedTps) {
      peakSmoothedTps = s.smoothedTps;
      peakReachedAtMs = s.t;
    }
  }
  const peakReachedWithMsRemaining = SESSION.scoreWindowEndMs - peakReachedAtMs;

  const scoringTapIntervals = [];
  const scoringTaps = validTaps.filter((t) => t >= SESSION.scoreWindowStartMs && t <= SESSION.scoreWindowEndMs);
  for (let i = 1; i < scoringTaps.length; i++) scoringTapIntervals.push(scoringTaps[i] - scoringTaps[i - 1]);
  const recentIntervals = scoringTapIntervals.slice(-RHYTHM.maxIntervals);
  const rhythmStabilityScore = recentIntervals.length >= RHYTHM.minIntervalsForFullScore
    ? rhythmScoreFromCv(coefficientOfVariation(recentIntervals))
    : RHYTHM.minScoreBeforeEnoughSamples;

  let continuityScore = CONTINUITY.scoreFloor;
  if (peakSmoothedTps >= CONTINUITY.minimumPeakTpsForEvaluation && scoringSeries.length) {
    const floor = peakSmoothedTps * CONTINUITY.targetFloorRatio;
    const aboveFloor = scoringSeries.filter((s) => s.smoothedTps >= floor).length;
    continuityScore = Math.min(CONTINUITY.scoreCeiling, Math.max(CONTINUITY.scoreFloor, aboveFloor / scoringSeries.length));
  }

  const holdMsByTps = {};
  for (const { tps, requiredHoldMs } of HOLD_THRESHOLDS) {
    let best = 0;
    let current = 0;
    let gapMs = 0;
    for (let i = 1; i < scoringSeries.length; i++) {
      const dt = scoringSeries[i].t - scoringSeries[i - 1].t;
      if (scoringSeries[i].smoothedTps >= tps) {
        current += dt;
        gapMs = 0;
      } else {
        gapMs += dt;
        if (gapMs > HOLD_ALLOWED_GAP_MS) {
          best = Math.max(best, current);
          current = 0;
        }
      }
    }
    best = Math.max(best, current);
    holdMsByTps[tps] = best;
    void requiredHoldMs;
  }

  return {
    averageScoringTps,
    peakSmoothedTps,
    peakReachedWithMsRemaining,
    rhythmStabilityScore,
    continuityScore,
    holdMsByTps,
    validTapCount: validTaps.length,
    rejectedTapCount: rejectedCount,
    intervals: scoringTapIntervals,
  };
}
