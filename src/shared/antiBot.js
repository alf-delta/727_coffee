/**
 * Shared anti-bot risk scoring, ported from the `anti_bot` sections of both
 * fluppy_game.json and game_tap.json. Deliberately excludes
 * `identical_session_replay` (cross-session similarity) — both specs list
 * that under phase_2_should_have; everything else here is phase 1.
 *
 * `evidence` shape (both games):
 * {
 *   tapTimestampsMs: number[],       raw event.timeStamp-based, ms since session start
 *   isTrustedFlags: boolean[],       same length/order as tapTimestampsMs
 *   pointerIds: (number|string)[],   same length/order as tapTimestampsMs
 *   visibilityEvents: {tMs:number, state:'visible'|'hidden'}[],
 *   clientElapsedMs: number, serverElapsedMs: number,
 *   resultMismatch: boolean,   client's claimed outcome disagreed with the server replay
 *   seedMismatch: boolean,     client used a different seed/sequence than issued
 *   collisionBypassDetected: boolean,
 * }
 */

function stdev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function intervalsOf(timestamps) {
  const sorted = [...timestamps].sort((a, b) => a - b);
  const out = [];
  for (let i = 1; i < sorted.length; i++) out.push(sorted[i] - sorted[i - 1]);
  return out;
}

function maxCountInRollingWindow(timestamps, windowMs) {
  const sorted = [...timestamps].sort((a, b) => a - b);
  let max = 0;
  for (let i = 0; i < sorted.length; i++) {
    let count = 1;
    for (let j = i + 1; j < sorted.length && sorted[j] - sorted[i] < windowMs; j++) count += 1;
    max = Math.max(max, count);
  }
  return max;
}

function hasRepeatingPattern(intervals, patternLength, repeats, toleranceMs) {
  if (intervals.length < patternLength * repeats) return false;
  for (let start = 0; start + patternLength * repeats <= intervals.length; start++) {
    const pattern = intervals.slice(start, start + patternLength);
    let matches = 1;
    for (let r = 1; r < repeats; r++) {
      const candidate = intervals.slice(start + r * patternLength, start + (r + 1) * patternLength);
      const same = pattern.every((v, i) => Math.abs(v - candidate[i]) <= toleranceMs);
      if (same) matches += 1;
    }
    if (matches >= repeats) return true;
  }
  return false;
}

function hasBackgroundActivity(tapTimestampsMs, visibilityEvents) {
  const hidden = visibilityEvents.filter((e) => e.state === 'hidden');
  return hidden.some((h) => {
    const nextVisible = visibilityEvents.find((e) => e.state === 'visible' && e.tMs > h.tMs);
    const hiddenEnd = nextVisible ? nextVisible.tMs : Infinity;
    return tapTimestampsMs.some((t) => t > h.tMs && t < hiddenEnd);
  });
}

function hasSyntheticEvent(isTrustedFlags) {
  return isTrustedFlags.some((trusted) => trusted === false);
}

function countDistinctPointers(pointerIds) {
  return new Set(pointerIds).size;
}

function timeScaleMismatch(clientElapsedMs, serverElapsedMs, toleranceMs = 2000) {
  return Math.abs((clientElapsedMs ?? 0) - (serverElapsedMs ?? 0)) > toleranceMs;
}

function finalize(riskPoints, triggered, forceReject) {
  const riskScore = Math.min(100, riskPoints);
  return { riskScore, triggeredRules: triggered, immediateRejection: forceReject || riskScore >= 100 };
}

export function evaluateFlappyRisk(evidence) {
  const triggered = [];
  let points = 0;
  let reject = false;
  const intervals = intervalsOf(evidence.tapTimestampsMs ?? []);

  if (maxCountInRollingWindow(evidence.tapTimestampsMs ?? [], 1000) > 10) {
    points += 25;
    triggered.push('flap_rate_over_limit');
  }
  if (intervals.filter((i) => i < 90).length >= 3) {
    points += 20;
    triggered.push('sub_90ms_intervals');
  }
  if (hasSyntheticEvent(evidence.isTrustedFlags ?? [])) {
    points += 100;
    triggered.push('synthetic_event');
    reject = true;
  }
  if (countDistinctPointers(evidence.pointerIds ?? []) > 1) {
    points += 15;
    triggered.push('multi_pointer_input');
  }
  if (intervals.length >= 15 && stdev(intervals) < 2.5) {
    points += 35;
    triggered.push('machine_regular_input');
  }
  if (hasRepeatingPattern(intervals, 4, 4, 2)) {
    points += 30;
    triggered.push('repeating_input_sequence');
  }
  if (evidence.resultMismatch) {
    // The server already uses its own authoritative replay for payout.
    // A client-render mismatch is useful telemetry, not proof of cheating:
    // dropped frames and browser throttling can make the live view drift.
    points += 20;
    triggered.push('client_result_mismatch');
  }
  if (evidence.seedMismatch) {
    points += 100;
    triggered.push('obstacle_sequence_mismatch');
    reject = true;
  }
  if (evidence.collisionBypassDetected) {
    points += 100;
    triggered.push('collision_bypass');
    reject = true;
  }
  if (hasBackgroundActivity(evidence.tapTimestampsMs ?? [], evidence.visibilityEvents ?? [])) {
    points += 100;
    triggered.push('background_play');
    reject = true;
  }
  if (timeScaleMismatch(evidence.clientElapsedMs, evidence.serverElapsedMs)) {
    // Wall clocks can drift on slow networks and throttled mobile browsers.
    // Keep this as a soft signal; signed attempts and the server replay still
    // constrain the actual reward.
    points += 30;
    triggered.push('client_clock_drift');
  }

  return finalize(points, triggered, reject);
}

export function evaluateTapRisk(evidence) {
  const triggered = [];
  let points = 0;
  let reject = false;
  const intervals = intervalsOf(evidence.tapTimestampsMs ?? []);

  if (maxCountInRollingWindow(evidence.tapTimestampsMs ?? [], 1000) > 12) {
    // The game explicitly invites fast tapping. A brief human burst above
    // the scoring cap is a soft signal; excess taps are already discarded by
    // the authoritative rate limiter.
    points += 15;
    triggered.push('rate_over_12_tps');
  }
  if (intervals.filter((i) => i < 83.333).length >= 3) {
    points += 10;
    triggered.push('sub_83ms_intervals');
  }
  if (intervals.length >= 12 && stdev(intervals) < 2.5) {
    points += 35;
    triggered.push('machine_like_regular_intervals');
  }
  if (hasRepeatingPattern(intervals, 3, 4, 2)) {
    points += 25;
    triggered.push('repeating_interval_pattern');
  }
  if (countDistinctPointers(evidence.pointerIds ?? []) > 1) {
    // Alternating two thumbs/fingers is normal for a mobile tapping game.
    // Keep the signal for diagnostics without lowering a legitimate score.
    triggered.push('multi_pointer_input');
  }
  if (hasSyntheticEvent(evidence.isTrustedFlags ?? [])) {
    points += 100;
    triggered.push('synthetic_event');
    reject = true;
  }
  // Mobile browsers frequently report legitimate quick taps in the 4–12ms
  // range. Only a sustained run of near-zero durations is suspicious.
  if ((evidence.pressDurationsMs ?? []).filter((d) => d < 4).length >= 12) {
    points += 10;
    triggered.push('ultra_short_press_duration');
  }
  if (hasBackgroundActivity(evidence.tapTimestampsMs ?? [], evidence.visibilityEvents ?? [])) {
    points += 100;
    triggered.push('background_input');
    reject = true;
  }
  if (intervals.some((i) => i < 0)) {
    points += 40;
    triggered.push('timestamp_discontinuity');
  }

  return finalize(points, triggered, reject);
}

/** Shared response table from both specs' anti_bot.response. */
export function riskResponse(riskScore) {
  if (riskScore <= 39) return { sessionValid: true, rewardAllowed: true, scoreMultiplier: 1 };
  if (riskScore <= 69) return { sessionValid: true, rewardAllowed: true, scoreMultiplier: 1, logForAnalysis: true };
  if (riskScore <= 99) return { sessionValid: false, rewardAllowed: false, userMessage: "We couldn't verify this attempt. Please try again." };
  return { sessionValid: false, rewardAllowed: false, temporarySessionBlockMinutes: 30 };
}
