import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFlappyResult } from '../src/shared/flappyScoring.js';
import { computeTapResult } from '../src/shared/tapScoring.js';
import { analyzeTapSession } from '../src/shared/tapPhysics.js';

function inRange(actual, [min, max], label) {
  assert.ok(actual >= min && actual <= max, `${label}: expected ${actual} in [${min}, ${max}]`);
}

// --- Flappy: transparent gate-only tiers ---

test('flappy: starts at 3%', () => {
  assert.equal(computeFlappyResult({ passedObstacles: 0 }).discountPercent, 3);
});

test('flappy: adds 1% per gate until 10%', () => {
  assert.equal(computeFlappyResult({ passedObstacles: 1 }).discountPercent, 4);
  assert.equal(computeFlappyResult({ passedObstacles: 6 }).discountPercent, 9);
  assert.equal(computeFlappyResult({ passedObstacles: 7 }).discountPercent, 10);
});

test('flappy: adds 1% per two gates from 10% to 20%', () => {
  assert.equal(computeFlappyResult({ passedObstacles: 8 }).discountPercent, 10);
  assert.equal(computeFlappyResult({ passedObstacles: 9 }).discountPercent, 11);
  assert.equal(computeFlappyResult({ passedObstacles: 25 }).discountPercent, 19);
  assert.equal(computeFlappyResult({ passedObstacles: 27 }).discountPercent, 20);
});

test('flappy: adds 1% per three gates after 20%', () => {
  assert.equal(computeFlappyResult({ passedObstacles: 28 }).discountPercent, 20);
  assert.equal(computeFlappyResult({ passedObstacles: 29 }).discountPercent, 20);
  assert.equal(computeFlappyResult({ passedObstacles: 30 }).discountPercent, 21);
  assert.equal(computeFlappyResult({ passedObstacles: 39 }).discountPercent, 24);
});

test('flappy: discount is capped at 25%', () => {
  assert.equal(computeFlappyResult({ passedObstacles: 42 }).discountPercent, 25);
  assert.equal(computeFlappyResult({ passedObstacles: 100 }).discountPercent, 25);
});

test('flappy: unrelated metrics cannot change the gate reward', () => {
  const plain = computeFlappyResult({ passedObstacles: 10 });
  const noisy = computeFlappyResult({
    passedObstacles: 10,
    cleanPassRatio: 0,
    perfectPassRatio: 0,
    longestCleanStreak: 0,
    survivalSeconds: 1,
    actualValidFlapCount: 500,
    securityRiskScore: 100,
  });
  assert.deepEqual(noisy, plain);
  assert.equal(plain.discountPercent, 11);
});

// --- game_tap.json acceptance_tests ---

test('tap: normal_average_player', () => {
  const r = computeTapResult({
    averageScoringTps: 5.5,
    rhythmStabilityScore: 0.75,
    continuityScore: 0.75,
    holdMsByTps: {},
  });
  inRange(r.discountPercent, [9, 15], 'normal_average_player');
});

test('tap: fast_but_unstable_player (max cap)', () => {
  const r = computeTapResult({
    averageScoringTps: 8.5,
    rhythmStabilityScore: 0.5,
    continuityScore: 0.7,
    holdMsByTps: { 8: 400 },
  });
  assert.ok(r.discountPercent <= 20, `expected <=20, got ${r.discountPercent}`);
});

test('tap: stable but sub-10-TPS play stays below the top bands', () => {
  const r = computeTapResult({
    averageScoringTps: 8.2,
    rhythmStabilityScore: 0.87,
    continuityScore: 0.88,
    holdMsByTps: { 8: 1500 },
  });
  inRange(r.discountPercent, [17, 20], 'stable_sub_10_tps_player');
});

test('tap: maximum_legitimate_result (exact 25)', () => {
  const r = computeTapResult({
    averageScoringTps: 11.5,
    peakSmoothedTps: 12,
    rhythmStabilityScore: 0.95,
    continuityScore: 0.94,
    holdMsByTps: { 7: 3800, 8: 3800, 9: 3800, 10: 3500, 11: 2400 },
    securityRiskScore: 0,
  });
  assert.equal(r.discountPercent, 25, `expected exactly 25, got ${r.discountPercent}`);
});

test('tap: the original 25% speed profile no longer reaches a top reward', () => {
  const r = computeTapResult({
    averageScoringTps: 9,
    peakSmoothedTps: 10,
    rhythmStabilityScore: 0.93,
    continuityScore: 0.9,
    holdMsByTps: { 8: 2000, 9: 1000, 10: 400 },
    securityRiskScore: 0,
  });
  assert.ok(r.discountPercent <= 22, `expected <=22, got ${r.discountPercent}`);
});

test('tap: the previous tightened profile no longer reaches 25%', () => {
  const r = computeTapResult({
    averageScoringTps: 10.9,
    peakSmoothedTps: 11.9,
    rhythmStabilityScore: 0.93,
    continuityScore: 0.9,
    holdMsByTps: { 10: 2000, 11: 1000 },
    securityRiskScore: 0,
  });
  assert.ok(r.discountPercent < 25, `expected <25, got ${r.discountPercent}`);
});

test('tap: a near-max burst still needs endurance for 25%', () => {
  const r = computeTapResult({
    averageScoringTps: 11.7,
    peakSmoothedTps: 12,
    rhythmStabilityScore: 0.97,
    continuityScore: 0.97,
    holdMsByTps: { 7: 2600, 8: 2600, 9: 2600, 10: 2100, 11: 900 },
    securityRiskScore: 0,
  });
  assert.ok(r.discountPercent < 25, `expected <25, got ${r.discountPercent}`);
});

test('tap: short_late_burst (max cap)', () => {
  const r = computeTapResult({
    averageScoringTps: 6.5,
    peakSmoothedTps: 10,
    rhythmStabilityScore: 0.6,
    continuityScore: 0.6,
    holdMsByTps: { 9: 250 },
    peakReachedWithMsRemaining: 300,
  });
  assert.ok(r.discountPercent <= 19, `expected <=19, got ${r.discountPercent}`);
});

test('tap: realistic fast two-finger play reaches an engaging reward', () => {
  const intervals = [62, 78, 55, 86, 69, 74, 58, 91, 66, 80];
  const taps = [0];
  while (taps.at(-1) < 6000) {
    taps.push(taps.at(-1) + intervals[(taps.length - 1) % intervals.length]);
  }
  const metrics = analyzeTapSession(taps, 6000);
  const result = computeTapResult({ ...metrics, securityRiskScore: 25 });
  inRange(result.discountPercent, [19, 22], 'fast_two_finger_player');
});

test('tap: fast irregular play cannot collapse back to 13%', () => {
  const r = computeTapResult({
    averageScoringTps: 8.5,
    peakSmoothedTps: 10,
    rhythmStabilityScore: 0.2,
    continuityScore: 0.5,
    holdMsByTps: {},
  });
  assert.equal(r.discountPercent, 17);
});

test('tap: near-maximum speed earns at least 22% without top-tier endurance', () => {
  const r = computeTapResult({
    averageScoringTps: 11.1,
    peakSmoothedTps: 12,
    rhythmStabilityScore: 0.55,
    continuityScore: 0.75,
    holdMsByTps: { 10: 900, 11: 300 },
  });
  assert.equal(r.discountPercent, 22);
});

test('tap: security telemetry never changes the gameplay score', () => {
  const metrics = {
    averageScoringTps: 9,
    peakSmoothedTps: 10,
    rhythmStabilityScore: 0.93,
    continuityScore: 0.9,
    holdMsByTps: { 8: 2000, 9: 1000 },
  };
  const clean = computeTapResult({ ...metrics, securityRiskScore: 0 });
  const softRisk = computeTapResult({ ...metrics, securityRiskScore: 55 });
  assert.equal(softRisk.finalScore, clean.finalScore);
  assert.equal(softRisk.discountPercent, clean.discountPercent);
});
