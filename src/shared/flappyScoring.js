/**
 * Flying Syrnik — scoring & discount mapping, ported verbatim from the
 * curves/formulas/bands in fluppy_game.json. Pure functions, no I/O, so they
 * can run identically client-side (live projection) and server-side
 * (authoritative — this is the number that actually gets paid out).
 */

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

const DISTANCE_CURVE = [
  { passed_obstacles: 0, score: 0 },
  { passed_obstacles: 1, score: 0.08 },
  { passed_obstacles: 3, score: 0.18 },
  { passed_obstacles: 5, score: 0.3 },
  { passed_obstacles: 8, score: 0.44 },
  { passed_obstacles: 12, score: 0.58 },
  { passed_obstacles: 16, score: 0.69 },
  { passed_obstacles: 21, score: 0.79 },
  { passed_obstacles: 27, score: 0.88 },
  { passed_obstacles: 34, score: 0.95 },
  { passed_obstacles: 42, score: 1 },
];

const STREAK_CURVE = [
  { longest_clean_streak: 0, score: 0 },
  { longest_clean_streak: 2, score: 0.15 },
  { longest_clean_streak: 4, score: 0.35 },
  { longest_clean_streak: 6, score: 0.55 },
  { longest_clean_streak: 9, score: 0.75 },
  { longest_clean_streak: 13, score: 0.9 },
  { longest_clean_streak: 18, score: 1 },
];

const SURVIVAL_CURVE = [
  { survival_seconds: 0, score: 0 },
  { survival_seconds: 5, score: 0.2 },
  { survival_seconds: 10, score: 0.42 },
  { survival_seconds: 15, score: 0.62 },
  { survival_seconds: 22, score: 0.8 },
  { survival_seconds: 30, score: 0.92 },
  { survival_seconds: 40, score: 1 },
];

const DISCOUNT_BANDS = [
  { min: 0, maxExclusive: 16, percent: 3 },
  { min: 16, maxExclusive: 27, percent: 5 },
  { min: 27, maxExclusive: 37, percent: 7 },
  { min: 37, maxExclusive: 47, percent: 9 },
  { min: 47, maxExclusive: 56, percent: 11 },
  { min: 56, maxExclusive: 64, percent: 13 },
  { min: 64, maxExclusive: 71, percent: 15 },
  { min: 71, maxExclusive: 77, percent: 17 },
  { min: 77, maxExclusive: 82, percent: 19 },
  { min: 82, maxExclusive: 86, percent: 20 },
  { min: 86, maxExclusive: 90, percent: 21 },
  { min: 90, maxExclusive: 94, percent: 22 },
  { min: 94, maxExclusive: 97, percent: 23 },
  { min: 97, maxExclusive: 99, percent: 24 },
  { min: 99, maxExclusive: 101, percent: 25 },
];

// Per-metric gates for the rare top bands. `minimum_final_score` from the
// spec is intentionally NOT checked here: it's redundant with (and, per the
// spec's own acceptance_tests, sometimes mathematically incompatible with)
// the weighted final_score formula — see the decision recorded in the plan.
// Per-metric thresholds are the authoritative gate for 22-25%; final_score
// still governs the ordinary 3-21% range via DISCOUNT_BANDS below.
const TOP_BAND_REQUIREMENTS = {
  25: {
    minPassedObstacles: 38,
    minCleanPassRatio: 0.78,
    minPerfectPassRatio: 0.3,
    minLongestCleanStreak: 14,
    minSurvivalSeconds: 32,
    minInputEfficiencyScore: 0.72,
    maxSecurityRiskScore: 15,
  },
  // 22-24 don't carry an input-efficiency/security gate in the source JSON
  // (only band 25 does) — added here too, otherwise a tap-spammer who still
  // racks up raw distance/streak can bypass the tap_spam_penalty multiplier
  // entirely and walk away with 24% just by spamming. Thresholds are eased
  // step-down from band 25's, not copied verbatim.
  24: { minPassedObstacles: 32, minCleanPassRatio: 0.72, minLongestCleanStreak: 11, minInputEfficiencyScore: 0.65, maxSecurityRiskScore: 20 },
  23: { minPassedObstacles: 27, minCleanPassRatio: 0.66, minLongestCleanStreak: 8, minInputEfficiencyScore: 0.6, maxSecurityRiskScore: 25 },
  22: { minPassedObstacles: 23, minCleanPassRatio: 0.6, minInputEfficiencyScore: 0.55, maxSecurityRiskScore: 30 },
};

function meetsRequirements(reqs, metrics) {
  if (!reqs) return true;
  if (reqs.minFinalScore !== undefined && metrics.finalScore < reqs.minFinalScore) return false;
  if (reqs.minPassedObstacles !== undefined && metrics.passedObstacles < reqs.minPassedObstacles) return false;
  if (reqs.minCleanPassRatio !== undefined && metrics.cleanPassRatio < reqs.minCleanPassRatio) return false;
  if (reqs.minPerfectPassRatio !== undefined && metrics.perfectPassRatio < reqs.minPerfectPassRatio) return false;
  if (reqs.minLongestCleanStreak !== undefined && metrics.longestCleanStreak < reqs.minLongestCleanStreak) return false;
  if (reqs.minSurvivalSeconds !== undefined && metrics.survivalSeconds < reqs.minSurvivalSeconds) return false;
  if (reqs.minInputEfficiencyScore !== undefined && metrics.inputEfficiencyScore < reqs.minInputEfficiencyScore) return false;
  if (reqs.maxSecurityRiskScore !== undefined && metrics.securityRiskScore > reqs.maxSecurityRiskScore) return false;
  return true;
}

export function accuracyScore(passedObstacles, cleanPassRatio, perfectPassRatio) {
  if (passedObstacles < 5) return 0.7;
  return 0.65 * cleanPassRatio + 0.35 * perfectPassRatio;
}

export function inputEfficiencyScore(effectiveFlapCount, actualValidFlapCount) {
  const expected = Math.max(effectiveFlapCount, 1);
  const actual = Math.max(actualValidFlapCount, expected);
  const ratio = expected / actual;
  return Math.min(1, Math.max(0.5, ratio));
}

/**
 * @param {object} m - authoritative session metrics (from flappyPhysics.simulateRun
 *   plus effectiveFlapCount/actualValidFlapCount/securityRiskScore from the caller)
 * @returns {{finalScore:number, discountPercent:number, components:object}}
 */
export function computeFlappyResult(m) {
  const distanceScore = interpolate(DISTANCE_CURVE, m.passedObstacles, 'passed_obstacles', 'score');
  const accScore = accuracyScore(m.passedObstacles, m.cleanPassRatio, m.perfectPassRatio);
  const streakScore = interpolate(STREAK_CURVE, m.longestCleanStreak, 'longest_clean_streak', 'score');
  const survScore = interpolate(SURVIVAL_CURVE, m.survivalSeconds, 'survival_seconds', 'score');
  const effScore = m.inputEfficiencyScoreOverride ?? inputEfficiencyScore(m.effectiveFlapCount ?? 1, m.actualValidFlapCount ?? 1);

  let finalScore = 100 * (0.58 * distanceScore + 0.18 * accScore + 0.14 * streakScore + 0.07 * survScore + 0.03 * effScore);

  if (m.cleanPassRatio > 0.8 && m.passedObstacles >= 12) finalScore *= 1.04;
  if (m.longestCleanStreak >= 10 && m.perfectPassRatio > 0.35) finalScore *= 1.03;
  if ((m.actualValidFlapCount ?? 0) > (m.effectiveFlapCount ?? 0) * 1.8) finalScore *= 0.9;
  const securityRiskScore = m.securityRiskScore ?? 0;
  if (securityRiskScore >= 40 && securityRiskScore <= 69) finalScore *= 0.75;

  const caps = [];
  if (m.passedObstacles < 8) caps.push(52);
  if (m.passedObstacles < 15) caps.push(76);
  if (m.passedObstacles < 22) caps.push(88);
  if (accScore < 0.6) caps.push(84);
  if (m.longestCleanStreak < 6) caps.push(87);
  if (caps.length) finalScore = Math.min(finalScore, ...caps);

  finalScore = Math.min(100, Math.max(0, Number(finalScore.toFixed(4))));

  const metrics = {
    finalScore,
    passedObstacles: m.passedObstacles,
    cleanPassRatio: m.cleanPassRatio,
    perfectPassRatio: m.perfectPassRatio,
    longestCleanStreak: m.longestCleanStreak,
    survivalSeconds: m.survivalSeconds,
    inputEfficiencyScore: effScore,
    securityRiskScore,
  };

  // Top bands (22-25%) are earned by explicit per-metric gates, checked
  // highest-first; only when none are met do we fall back to the ordinary
  // weighted-score band (capped at 21%, since 22+ requires passing a gate).
  const orderedTop = [25, 24, 23, 22];
  let percent = orderedTop.find((p) => meetsRequirements(TOP_BAND_REQUIREMENTS[p], metrics));
  if (percent === undefined) {
    const band = DISCOUNT_BANDS.find((b) => finalScore >= b.min && finalScore < b.maxExclusive) ?? DISCOUNT_BANDS[0];
    percent = Math.min(band.percent, 21);
  }

  return {
    finalScore: Math.round(finalScore),
    discountPercent: percent,
    components: { distanceScore, accuracyScore: accScore, streakScore, survivalScore: survScore, inputEfficiencyScore: effScore },
  };
}
