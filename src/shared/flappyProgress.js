import { filterValidFlaps, simulateRun } from './flappyPhysics.js';
import { computeFlappyResult } from './flappyScoring.js';

/**
 * The single gameplay-to-reward pipeline used by both the live HUD and the
 * finish endpoint. Security checks may reject a run, but they never silently
 * change the percentage shown to a valid player.
 */
export function computeFlappyProgress({
  seed,
  tapTimestampsMs,
  pointerIds = [],
  durationMs,
}) {
  const validFlaps = filterValidFlaps(tapTimestampsMs, pointerIds);
  const metrics = simulateRun(seed, validFlaps, durationMs);
  const scoring = computeFlappyResult(metrics);

  return { validFlaps, metrics, scoring };
}
