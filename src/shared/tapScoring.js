/**
 * Tap Pressure — scoring & discount mapping, ported from game_tap.json.
 * Pure functions; the acceptance_tests in that file test exactly this
 * layer (they hand in already-derived metrics like average_tps /
 * rhythm_stability_score / continuity_score, not raw taps).
 */

import { HOLD_THRESHOLDS } from './tapPhysics.js';

function interpolate(curve, x, xKey, yKey) {
  if (x <= curve[0][xKey]) return curve[0][yKey];
  const last = curve[curve.length - 1];
  if (x >= last[xKey]) return last[yKey];
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (x >= a[xKey] && x <= b[xKey]) {
      const t = (x - a[xKey]) / (b[xKey] - a[xKey]);
      return a[yKey] + t * (b[yKey] - a[yKey]);
    }
  }
  return last[yKey];
}

const SPEED_CURVE = [
  { tps: 0, score: 0 },
  { tps: 3, score: 0.1 },
  { tps: 4, score: 0.2 },
  { tps: 5, score: 0.34 },
  { tps: 6, score: 0.49 },
  { tps: 7, score: 0.64 },
  { tps: 8, score: 0.76 },
  { tps: 9, score: 0.85 },
  { tps: 10, score: 0.92 },
  { tps: 11, score: 0.97 },
  { tps: 12, score: 1 },
];

const DISCOUNT_BANDS = [
  { min: 0, maxExclusive: 18, percent: 3 },
  { min: 18, maxExclusive: 30, percent: 5 },
  { min: 30, maxExclusive: 40, percent: 7 },
  { min: 40, maxExclusive: 50, percent: 9 },
  { min: 50, maxExclusive: 59, percent: 11 },
  { min: 59, maxExclusive: 67, percent: 13 },
  { min: 67, maxExclusive: 74, percent: 15 },
  { min: 74, maxExclusive: 80, percent: 17 },
  { min: 80, maxExclusive: 85, percent: 19 },
  { min: 85, maxExclusive: 89, percent: 20 },
  { min: 89, maxExclusive: 92, percent: 21 },
  { min: 92, maxExclusive: 95, percent: 22 },
  { min: 95, maxExclusive: 97, percent: 23 },
  { min: 97, maxExclusive: 99, percent: 24 },
  { min: 99, maxExclusive: 101, percent: 25 },
];

// Per-metric gates for the rare top bands. `minimum_final_score` from the
// spec is intentionally NOT checked here — see the equivalent note in
// flappyScoring.js and the decision recorded in the plan: per-metric
// thresholds are authoritative for 23-25%, final_score governs 3-22%.
const TOP_BAND_REQUIREMENTS = {
  25: {
    minAverageScoringTps: 8.7,
    minPeakSmoothedTps: 9.5,
    minRhythmStabilityScore: 0.9,
    minContinuityScore: 0.86,
    minHoldAbove8TpsMs: 1800,
    minHoldAbove9TpsMs: 900,
    maxSecurityRiskScore: 15,
  },
  // 23/24 don't carry a security gate in the source JSON (only 25 does) —
  // added here too, for the same reason as flappyScoring.js: a session
  // flagged as risky shouldn't unlock an elevated discount at any band.
  24: { minAverageScoringTps: 8.3, minRhythmStabilityScore: 0.84, minHoldAbove8TpsMs: 1300, maxSecurityRiskScore: 20 },
  23: { minAverageScoringTps: 7.9, minRhythmStabilityScore: 0.78, maxSecurityRiskScore: 25 },
};

function meetsRequirements(reqs, m) {
  if (!reqs) return true;
  if (reqs.minFinalScore !== undefined && m.finalScore < reqs.minFinalScore) return false;
  if (reqs.minAverageScoringTps !== undefined && m.averageScoringTps < reqs.minAverageScoringTps) return false;
  if (reqs.minPeakSmoothedTps !== undefined && m.peakSmoothedTps < reqs.minPeakSmoothedTps) return false;
  if (reqs.minRhythmStabilityScore !== undefined && m.rhythmStabilityScore < reqs.minRhythmStabilityScore) return false;
  if (reqs.minContinuityScore !== undefined && m.continuityScore < reqs.minContinuityScore) return false;
  if (reqs.minHoldAbove8TpsMs !== undefined && (m.holdMsByTps?.[8] ?? 0) < reqs.minHoldAbove8TpsMs) return false;
  if (reqs.minHoldAbove9TpsMs !== undefined && (m.holdMsByTps?.[9] ?? 0) < reqs.minHoldAbove9TpsMs) return false;
  if (reqs.maxSecurityRiskScore !== undefined && m.securityRiskScore > reqs.maxSecurityRiskScore) return false;
  return true;
}

/** 0..1 score rewarding how long + how high above the tiered thresholds the player held. */
export function highSpeedHoldScore(holdMsByTps = {}) {
  let score = 0;
  HOLD_THRESHOLDS.forEach(({ tps, requiredHoldMs }, i) => {
    const heldMs = holdMsByTps[tps] ?? 0;
    const ratio = Math.min(1, heldMs / requiredHoldMs);
    const tierWeight = (i + 1) / HOLD_THRESHOLDS.length;
    score = Math.max(score, ratio * tierWeight);
  });
  return score;
}

/**
 * @param {object} m - averageScoringTps, peakSmoothedTps, rhythmStabilityScore,
 *   continuityScore, holdMsByTps, peakReachedWithMsRemaining, securityRiskScore
 */
export function computeTapResult(m) {
  const speedScore = interpolate(SPEED_CURVE, m.averageScoringTps, 'tps', 'score');
  const holdScore = highSpeedHoldScore(m.holdMsByTps);
  const rhythmStabilityScore = m.rhythmStabilityScore ?? 0;
  const continuityScore = m.continuityScore ?? 0;

  let finalScore = 100 * (0.5 * speedScore + 0.22 * rhythmStabilityScore + 0.13 * continuityScore + 0.15 * holdScore);

  const peakRemaining = m.peakReachedWithMsRemaining ?? Infinity;
  if (peakRemaining < 700) finalScore *= 0.92;
  if (m.averageScoringTps > 8 && rhythmStabilityScore < 0.65) finalScore *= 0.88;
  const hold9 = m.holdMsByTps?.[9] ?? 0;
  if (m.peakSmoothedTps > 9 && hold9 < 500) finalScore *= 0.9;
  const securityRiskScore = m.securityRiskScore ?? 0;
  if (securityRiskScore >= 40 && securityRiskScore <= 69) finalScore *= 0.75;

  const hold8 = m.holdMsByTps?.[8] ?? 0;
  const caps = [];
  if (rhythmStabilityScore < 0.75) caps.push(82);
  if (hold8 < 700) caps.push(84);
  if (m.averageScoringTps < 7) caps.push(76);
  if (continuityScore < 0.7) caps.push(80);
  if (caps.length) finalScore = Math.min(finalScore, ...caps);

  finalScore = Math.min(100, Math.max(0, Number(finalScore.toFixed(4))));

  const metrics = {
    finalScore,
    averageScoringTps: m.averageScoringTps,
    peakSmoothedTps: m.peakSmoothedTps ?? 0,
    rhythmStabilityScore,
    continuityScore,
    holdMsByTps: m.holdMsByTps ?? {},
    securityRiskScore,
  };

  // Top bands (23-25%) are earned by explicit per-metric gates, checked
  // highest-first; only when none are met do we fall back to the ordinary
  // weighted-score band (capped at 22%, since 23+ requires passing a gate).
  const orderedTop = [25, 24, 23];
  let percent = orderedTop.find((p) => meetsRequirements(TOP_BAND_REQUIREMENTS[p], metrics));
  if (percent === undefined) {
    const band = DISCOUNT_BANDS.find((b) => finalScore >= b.min && finalScore < b.maxExclusive) ?? DISCOUNT_BANDS[0];
    percent = Math.min(band.percent, 22);
  }

  return {
    finalScore: Math.round(finalScore),
    discountPercent: percent,
    components: { speedScore, rhythmStabilityScore, continuityScore, highSpeedHoldScore: holdScore },
  };
}
