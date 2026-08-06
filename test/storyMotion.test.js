import assert from 'node:assert/strict';
import test from 'node:test';
import { easeStoryEntry } from '../src/shared/storyMotion.js';

test('story entry easing starts and finishes without a velocity jump', () => {
  assert.equal(easeStoryEntry(0), 0);
  assert.equal(easeStoryEntry(1), 1);

  const firstFrameProgress = (1000 / 60) / 780;
  assert.ok(easeStoryEntry(firstFrameProgress) < 0.01);
  assert.ok(1 - easeStoryEntry(1 - firstFrameProgress) < 0.000001);
});

test('story entry easing remains monotonic and bounded', () => {
  let previous = 0;
  for (let step = 0; step <= 120; step += 1) {
    const value = easeStoryEntry(step / 120);
    assert.ok(value >= previous);
    assert.ok(value >= 0 && value <= 1);
    previous = value;
  }
});
