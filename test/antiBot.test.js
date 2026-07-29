import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFlappyRisk, evaluateTapRisk, riskResponse } from '../src/shared/antiBot.js';
import { filterValidTaps } from '../src/shared/tapPhysics.js';

test('flappy anti-bot: synthetic_events reject', () => {
  const r = evaluateFlappyRisk({
    tapTimestampsMs: [100, 300, 500],
    isTrustedFlags: [true, false, true],
    pointerIds: [1, 1, 1],
    visibilityEvents: [],
    clientElapsedMs: 5000,
    serverElapsedMs: 5000,
  });
  assert.equal(r.immediateRejection, true);
  assert.ok(r.triggeredRules.includes('synthetic_event'));
});

test('flappy anti-bot: client result mismatch is telemetry, not a hard rejection', () => {
  const r = evaluateFlappyRisk({
    tapTimestampsMs: [100, 300],
    isTrustedFlags: [true, true],
    pointerIds: [1, 1],
    visibilityEvents: [],
    clientElapsedMs: 5000,
    serverElapsedMs: 5000,
    resultMismatch: true,
  });
  assert.equal(r.immediateRejection, false);
  assert.equal(r.riskScore, 20);
  assert.ok(r.triggeredRules.includes('client_result_mismatch'));
});

test('flappy anti-bot: two_finger_input raises risk but is not itself immediate rejection', () => {
  const r = evaluateFlappyRisk({
    tapTimestampsMs: [100, 300, 900, 1500],
    isTrustedFlags: [true, true, true, true],
    pointerIds: [1, 1, 2, 1],
    visibilityEvents: [],
    clientElapsedMs: 5000,
    serverElapsedMs: 5000,
  });
  assert.ok(r.triggeredRules.includes('multi_pointer_input'));
  assert.ok(r.riskScore >= 15);
});

test('flappy anti-bot: ordinary clock drift under two seconds is tolerated', () => {
  const r = evaluateFlappyRisk({
    tapTimestampsMs: [100, 300, 700],
    isTrustedFlags: [true, true, true],
    pointerIds: [1, 1, 1],
    visibilityEvents: [],
    clientElapsedMs: 6500,
    serverElapsedMs: 5000,
  });
  assert.equal(r.triggeredRules.includes('client_clock_drift'), false);
  assert.equal(r.riskScore, 0);
});

test('flappy anti-bot: larger clock drift is a soft signal', () => {
  const r = evaluateFlappyRisk({
    tapTimestampsMs: [100, 300, 700],
    isTrustedFlags: [true, true, true],
    pointerIds: [1, 1, 1],
    visibilityEvents: [],
    clientElapsedMs: 7600,
    serverElapsedMs: 5000,
  });
  assert.equal(r.triggeredRules.includes('client_clock_drift'), true);
  assert.equal(r.riskScore, 30);
  assert.equal(r.immediateRejection, false);
});

test('flappy anti-bot: fast two-finger human input stays below rejection threshold', () => {
  const taps = [0, 85, 170, 255, 340, 425, 510, 595, 680, 765, 850];
  const r = evaluateFlappyRisk({
    tapTimestampsMs: taps,
    isTrustedFlags: taps.map(() => true),
    pointerIds: taps.map((_, index) => (index === 5 ? 2 : 1)),
    visibilityEvents: [],
    clientElapsedMs: 5000,
    serverElapsedMs: 5000,
  });
  assert.ok(r.riskScore < 70, `expected human input below rejection threshold, got ${r.riskScore}`);
  assert.equal(r.immediateRejection, false);
});

test('tap anti-bot: synthetic_events reject', () => {
  const r = evaluateTapRisk({
    tapTimestampsMs: [100, 200, 300],
    isTrustedFlags: [true, true, false],
    pointerIds: [1, 1, 1],
    visibilityEvents: [],
  });
  assert.equal(r.immediateRejection, true);
});

test('tap anti-bot: a fast irregular human burst remains valid', () => {
  const intervals = [55, 76, 61, 88, 69, 73, 92, 58, 81, 66, 97, 62, 78, 70, 85];
  const taps = [0];
  for (const interval of intervals) taps.push(taps.at(-1) + interval);
  const r = evaluateTapRisk({
    tapTimestampsMs: taps,
    isTrustedFlags: taps.map(() => true),
    pointerIds: taps.map(() => 1),
    pressDurationsMs: taps.map((_, index) => 5 + (index % 6)),
    visibilityEvents: [],
  });
  assert.ok(r.riskScore < 70, `expected fast human input to remain valid, got ${r.riskScore}`);
  assert.equal(r.immediateRejection, false);
  assert.equal(riskResponse(r.riskScore).sessionValid, true);
});

test('tap anti-bot: fast two-finger mobile play is not score-penalized', () => {
  const intervals = [62, 78, 55, 86, 69, 74, 58, 91, 66, 80];
  const taps = [0];
  while (taps.at(-1) < 6000) {
    taps.push(taps.at(-1) + intervals[(taps.length - 1) % intervals.length]);
  }
  const r = evaluateTapRisk({
    tapTimestampsMs: taps,
    isTrustedFlags: taps.map(() => true),
    pointerIds: taps.map((_, index) => index % 2),
    pressDurationsMs: taps.map((_, index) => 5 + (index % 6)),
    visibilityEvents: [],
  });
  assert.ok(r.riskScore < 40, `expected ordinary two-finger play below score penalty, got ${r.riskScore}`);
  assert.equal(riskResponse(r.riskScore).sessionValid, true);
});

test('tap anti-bot: perfectly regular high-speed automation remains invalid', () => {
  const taps = Array.from({ length: 25 }, (_, index) => index * 50);
  const r = evaluateTapRisk({
    tapTimestampsMs: taps,
    isTrustedFlags: taps.map(() => true),
    pointerIds: taps.map(() => 1),
    pressDurationsMs: taps.map(() => 1),
    visibilityEvents: [],
  });
  assert.ok(r.riskScore >= 70, `expected automated input to be rejected, got ${r.riskScore}`);
  assert.equal(riskResponse(r.riskScore).sessionValid, false);
});

test('tap rate limiter: 18 attempted taps/sec counted down to <=14', () => {
  const attempted = [];
  for (let i = 0; i < 18; i++) attempted.push((1000 / 18) * i);
  const { validTaps, rejectedCount } = filterValidTaps(attempted);
  assert.ok(validTaps.length <= 14, `expected <=14 counted, got ${validTaps.length}`);
  assert.ok(rejectedCount > 0);
});
