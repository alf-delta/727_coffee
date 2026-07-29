import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateRun, GRAVITY, FLAP_VELOCITY, VELOCITY_CAPS, clamp } from '../src/shared/flappyPhysics.js';

/**
 * A deliberately simple, non-clairvoyant autopilot: it only knows the
 * character's own y position (not the actual gap centers) and flaps
 * whenever it drifts below center. Standing in for "a player with basic
 * reflexes," not blind fixed-interval tapping — real players react to
 * their own altitude, they don't tap a metronome.
 */
function reactiveTaps(durationMs) {
  const dt = 1000 / 120;
  let y = 0.5;
  let v = 0;
  let lastTap = -Infinity;
  const taps = [];
  for (let t = 0; t < durationMs; t += dt) {
    if (y > 0.5 && t - lastTap > 150) {
      taps.push(Math.round(t));
      v = FLAP_VELOCITY;
      lastTap = t;
    }
    v += (GRAVITY.initial * dt) / 1000;
    v = clamp(v, VELOCITY_CAPS.maxRise, VELOCITY_CAPS.maxFall);
    y += (v * dt) / 1000;
  }
  return taps;
}

test('flappy physics: a basic reactive autopilot clears at least one obstacle on every seed', () => {
  // Regression test for a bug where the character's collision-space X was
  // erroneously offset by its on-screen draw position (30% of viewport),
  // eating almost the entire buffer before the first obstacle and causing
  // a near-instant (<0.5s, 0 obstacles) collision regardless of input.
  for (const seed of [1, 42, 123456789, 999999, 7]) {
    const taps = reactiveTaps(10000);
    const result = simulateRun(seed, taps, 10000);
    assert.ok(result.survivalSeconds > 2, `seed ${seed}: expected survival > 2s, got ${result.survivalSeconds}`);
    assert.ok(result.passedObstacles >= 1, `seed ${seed}: expected >=1 obstacle passed, got ${result.passedObstacles}`);
  }
});

test('flappy physics: world position starts at zero, not offset by the on-screen draw position', () => {
  // With no taps at all, gravity pulls the character down at a known rate;
  // it should fall for a while before hitting the floor, not die instantly
  // from a bogus head-start toward the first obstacle.
  const result = simulateRun(1, [], 6000);
  assert.equal(result.collisionType, 'falls_below_play_area');
  assert.ok(result.survivalSeconds > 0.5, `expected to fall for a bit before hitting the floor, got ${result.survivalSeconds}`);
});
