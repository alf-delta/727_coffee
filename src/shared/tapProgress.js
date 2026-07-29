import { analyzeTapSession } from './tapPhysics.js';
import { computeTapResult } from './tapScoring.js';

/**
 * Shared live/final reward pipeline for Tap Pressure.
 */
export function computeTapProgress({
  tapTimestampsMs,
  durationMs,
}) {
  const metrics = analyzeTapSession(tapTimestampsMs, durationMs);
  const scoring = computeTapResult({
    ...metrics,
    peakReachedWithMsRemaining: metrics.peakReachedWithMsRemaining,
    securityRiskScore: 0,
  });

  return { metrics, scoring };
}
