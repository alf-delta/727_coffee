import { mulberry32, range } from './prng.js';

/**
 * Flying Syrnik — shared deterministic physics/obstacle-generation module.
 * Imported by BOTH the client renderer and the server replay validator so
 * "physics_version_must_match" holds by construction (one source of truth).
 *
 * Constants below are taken verbatim from fluppy_game.json where the spec
 * gives an explicit number. A few values (BASE_WORLD_SPEED_VW_PER_SEC,
 * OBSTACLE_WIDTH_VW) are not specified numerically in the JSON (it only
 * gives spacing/gap in "viewport-width" units and relative multipliers,
 * never an absolute scroll speed or obstacle thickness) — these are
 * implementation choices tuned for a normal flappy-bird feel, called out
 * explicitly so they're easy to retune later.
 */

export const PHYSICS_VERSION = 'flappy-1.1.0';

export const SESSION = {
  countdownSeconds: 3,
  maximumActiveDurationSeconds: 45,
  minimumRewardableDurationSeconds: 3,
  maximumSessionAgeSeconds: 90,
};

export const INPUT_RATE_LIMITS = {
  minimumIntervalBetweenFlapsMs: 90,
  maximumValidFlapsPerSecond: 10,
};

export const FIXED_STEP_HZ = 120;
export const FIXED_STEP_MS = 1000 / FIXED_STEP_HZ;
export const MAX_CATCHUP_STEPS = 8;

export const GRAVITY = {
  initial: 2.35,
  maximum: 2.75,
};

export const FLAP_VELOCITY = -0.72; // canonical impulse applied on every valid flap (stacking not allowed)

export const VELOCITY_CAPS = {
  maxFall: 1.15,
  maxRise: -0.8,
};

export const ROTATION = {
  maxUpDeg: -24,
  maxDownDeg: 78,
  responseSeconds: 0.18,
};

export const CHARACTER = {
  collisionRadiusPctOfSpriteWidth: 0.34,
  spriteWidthPctOfViewport: 0.14,
  horizontalPositionPercent: 0.3,
};
export const CHARACTER_RADIUS_VW = CHARACTER.spriteWidthPctOfViewport * CHARACTER.collisionRadiusPctOfSpriteWidth;

// --- Implementation-chosen constants (not given numerically by the spec) ---
export const BASE_WORLD_SPEED_VW_PER_SEC = 0.5;
export const OBSTACLE_WIDTH_VW = 0.06;

export const SPAWN = {
  initialDelayMs: 1200,
  initialSpacingVw: 0.82,
  minSpacingVw: 0.62,
  spacingVariationPct: 0.08,
};

export const GAP = {
  // A tighter but still forgiving flight corridor: 10% narrower on takeoff
  // and up to 10% narrower at the hardest stages.
  initialPct: 0.27,
  minPct: 0.18,
  maxPct: 0.29,
  reductionPerStagePct: 0.014,
  minClearancePct: 0.12,
  maxCenterShiftPct: 0.22,
  hitboxPaddingPct: 0.08, // forgiving collision: widen effective gap by 8%
};

export const SPECIAL_OBSTACLES = {
  enabledAfterScore: 8,
  maxSharePct: 0.2,
  movingFork: { amplitudePctOfGap: 0.16, speedHz: 0.35 },
  doubleGate: { minScore: 16 },
};

export const ANTI_FRUSTRATION = {
  firstNeverSpecial: 3,
  firstCenterBiasedGaps: 2,
  noExtremeReversalBeforeScore: 5,
  minReactionTimeMs: 620,
};

export const DIFFICULTY_STAGES = [
  { stage: 1, startsAt: 0, speedMultiplier: 1, gapMultiplier: 1, label: 'TAKEOFF' },
  { stage: 2, startsAt: 5, speedMultiplier: 1.08, gapMultiplier: 0.95, label: 'BREWING' },
  { stage: 3, startsAt: 10, speedMultiplier: 1.16, gapMultiplier: 0.9, label: 'DIALED IN' },
  { stage: 4, startsAt: 16, speedMultiplier: 1.25, gapMultiplier: 0.84, label: 'FULL PRESSURE' },
  { stage: 5, startsAt: 23, speedMultiplier: 1.34, gapMultiplier: 0.78, label: 'REDLINE' },
  { stage: 6, startsAt: 31, speedMultiplier: 1.42, gapMultiplier: 0.72, label: 'PERFECT FLIGHT' },
];
export const MAX_EXTRA_SPEED_MULTIPLIER = 1.08;

export function getDifficultyStage(passedObstacles) {
  let stage = DIFFICULTY_STAGES[0];
  for (const s of DIFFICULTY_STAGES) {
    if (passedObstacles >= s.startsAt) stage = s;
  }
  return stage;
}

export function getWorldSpeedMultiplier(stage, cleanStreak) {
  const streakBoost = Math.min(cleanStreak / 20, 1) * (MAX_EXTRA_SPEED_MULTIPLIER - 1);
  return stage.speedMultiplier * (1 + streakBoost);
}

export function getGapPct(stage) {
  const raw = GAP.initialPct * stage.gapMultiplier;
  return clamp(raw, GAP.minPct, GAP.maxPct);
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * A gate contributes to the score exactly once, after the character has
 * cleared its full collision width. Keep this shared between the live game
 * and the authoritative replay so special obstacle types cannot drift apart.
 */
export function hasClearedObstacle(obstacle, characterX) {
  return !obstacle.scored
    && characterX > obstacle.x + OBSTACLE_WIDTH_VW / 2 + CHARACTER_RADIUS_VW;
}

/**
 * Deterministically generate enough obstacles to cover maxDurationSeconds of
 * play at the fastest possible stage speed. Pure function of the seed.
 */
export function generateObstacleSequence(seed, maxDurationSeconds) {
  const rng = mulberry32(seed);
  const obstacles = [];
  let x = SPAWN.initialDelayMs / 1000 * BASE_WORLD_SPEED_VW_PER_SEC;
  let prevCenter = 0.5;
  let passedSoFar = 0; // used only to decide gap sizing/special-obstacle eligibility during generation
  const fastestSpeed = DIFFICULTY_STAGES[DIFFICULTY_STAGES.length - 1].speedMultiplier * MAX_EXTRA_SPEED_MULTIPLIER * BASE_WORLD_SPEED_VW_PER_SEC;
  const totalVwNeeded = maxDurationSeconds * fastestSpeed + 2;

  let index = 0;
  while (x < totalVwNeeded) {
    const stage = getDifficultyStage(passedSoFar);
    const gapPct = getGapPct(stage);
    const clearance = GAP.minClearancePct;
    const minCenter = clearance + gapPct / 2;
    const maxCenter = 1 - clearance - gapPct / 2;

    let center;
    if (index < ANTI_FRUSTRATION.firstCenterBiasedGaps) {
      center = 0.5 + range(rng, -0.05, 0.05);
    } else {
      const maxShift = index < ANTI_FRUSTRATION.noExtremeReversalBeforeScore ? GAP.maxCenterShiftPct * 0.5 : GAP.maxCenterShiftPct;
      const low = clamp(prevCenter - maxShift, minCenter, maxCenter);
      const high = clamp(prevCenter + maxShift, minCenter, maxCenter);
      center = low >= high ? prevCenter : range(rng, low, high);
    }
    center = clamp(center, minCenter, maxCenter);

    const canBeSpecial = index >= ANTI_FRUSTRATION.firstNeverSpecial && passedSoFar >= SPECIAL_OBSTACLES.enabledAfterScore;
    let type = 'standard';
    if (canBeSpecial && rng() < SPECIAL_OBSTACLES.maxSharePct) {
      const roll = rng();
      if (passedSoFar >= SPECIAL_OBSTACLES.doubleGate.minScore && roll < 0.34) type = 'double_gate';
      else if (roll < 0.67) type = 'moving_fork';
      else type = 'steam_pulse';
    }

    obstacles.push({
      index,
      x,
      gapCenter: center,
      gapPct,
      type,
      movingAmplitude: type === 'moving_fork' ? SPECIAL_OBSTACLES.movingFork.amplitudePctOfGap * gapPct : 0,
      movingSpeedHz: type === 'moving_fork' ? SPECIAL_OBSTACLES.movingFork.speedHz : 0,
      scored: false,
    });

    prevCenter = center;
    passedSoFar += 1;

    const variation = 1 + range(rng, -SPAWN.spacingVariationPct, SPAWN.spacingVariationPct);
    let spacing = SPAWN.initialSpacingVw * variation;
    if (type === 'double_gate') spacing = SPAWN.minSpacingVw;
    spacing = Math.max(spacing, SPAWN.minSpacingVw);
    x += spacing;
    index += 1;
  }

  return obstacles;
}

function movingGapCenter(obstacle, elapsedSeconds) {
  if (obstacle.type !== 'moving_fork') return obstacle.gapCenter;
  const offset = Math.sin(2 * Math.PI * obstacle.movingSpeedHz * elapsedSeconds) * obstacle.movingAmplitude;
  return clamp(obstacle.gapCenter + offset, obstacle.gapPct / 2, 1 - obstacle.gapPct / 2);
}

/**
 * Filters raw pointerdown timestamps down to valid flaps: primary pointer
 * only, minimum 90ms between flaps, max 10/sec rolling window. Mirrors
 * tapPhysics.filterValidTaps for the flappy input model. Both client and
 * server call this before feeding timestamps into simulateRun.
 */
export function filterValidFlaps(rawTimestampsMs, pointerIds = []) {
  const primaryPointerId = pointerIds[0];
  const events = rawTimestampsMs
    .map((t, i) => ({ t, pointerId: pointerIds[i] }))
    .filter((e) => pointerIds.length === 0 || e.pointerId === primaryPointerId)
    .sort((a, b) => a.t - b.t);

  const valid = [];
  for (const { t } of events) {
    const last = valid[valid.length - 1];
    if (last !== undefined && t - last < INPUT_RATE_LIMITS.minimumIntervalBetweenFlapsMs) continue;
    const withinLastSecond = valid.filter((v) => t - v < 1000).length;
    if (withinLastSecond >= INPUT_RATE_LIMITS.maximumValidFlapsPerSecond) continue;
    valid.push(t);
  }
  return valid;
}

/**
 * Replay a full attempt deterministically at a fixed 120Hz timestep, applying
 * flaps at the supplied (already rate/validity-filtered) timestamps. Returns
 * the authoritative session metrics — this is what both client preview and
 * server validation call, so results are identical given identical seed+taps.
 *
 * @param {number} seed
 * @param {number[]} flapTimesMs - valid flap timestamps, ms since session start
 * @param {number} maxDurationMs
 */
export function simulateRun(seed, flapTimesMs, maxDurationMs) {
  const obstacles = generateObstacleSequence(seed, maxDurationMs / 1000);
  const sortedFlaps = [...flapTimesMs].sort((a, b) => a - b);
  let flapCursor = 0;

  let simTimeMs = 0;
  let y = 0.5;
  let velocity = 0;
  let renderRotation = 0;
  let worldDistance = 0; // character's world-space position; starts at 0, integrated each step

  let passedObstacles = 0;
  let cleanPasses = 0;
  let perfectPasses = 0;
  let cleanStreak = 0;
  let longestCleanStreak = 0;
  let collided = false;
  let collisionTimeMs = null;
  let collisionType = null;
  let exitedBounds = false;
  let effectiveFlapCount = 0;

  const dt = FIXED_STEP_MS / 1000;
  const REDUNDANT_FLAP_VELOCITY_THRESHOLD = FLAP_VELOCITY * 0.9; // more negative than this = already near-max ascending

  while (simTimeMs < maxDurationMs && !collided && !exitedBounds) {
    while (flapCursor < sortedFlaps.length && sortedFlaps[flapCursor] <= simTimeMs) {
      if (velocity > REDUNDANT_FLAP_VELOCITY_THRESHOLD) effectiveFlapCount += 1;
      velocity = FLAP_VELOCITY;
      flapCursor += 1;
    }

    const stage = getDifficultyStage(passedObstacles);
    const gravity = Math.min(GRAVITY.initial * stage.speedMultiplier, GRAVITY.maximum);
    velocity += gravity * dt;
    velocity = clamp(velocity, VELOCITY_CAPS.maxRise, VELOCITY_CAPS.maxFall);
    y += velocity * dt;

    const targetRotationDeg = velocity < 0
      ? clamp((velocity / VELOCITY_CAPS.maxRise) * ROTATION.maxUpDeg, ROTATION.maxUpDeg, 0)
      : clamp((velocity / VELOCITY_CAPS.maxFall) * ROTATION.maxDownDeg, 0, ROTATION.maxDownDeg);
    const rotationAlpha = 1 - Math.exp(-dt / ROTATION.responseSeconds);
    renderRotation += (targetRotationDeg - renderRotation) * rotationAlpha;

    if (y < 0 || y > 1) {
      exitedBounds = true;
      collisionType = y < 0 ? 'exits_top_boundary' : 'falls_below_play_area';
      break;
    }

    const speedMultiplier = getWorldSpeedMultiplier(stage, cleanStreak);
    const worldSpeed = BASE_WORLD_SPEED_VW_PER_SEC * speedMultiplier;
    worldDistance += worldSpeed * dt;
    const characterX = worldDistance;

    for (const obstacle of obstacles) {
      if (obstacle.scored && obstacle.type !== 'double_gate') continue;
      const obstacleLeft = obstacle.x - OBSTACLE_WIDTH_VW / 2 - CHARACTER_RADIUS_VW;
      const obstacleRight = obstacle.x + OBSTACLE_WIDTH_VW / 2 + CHARACTER_RADIUS_VW;
      const overlapping = characterX >= obstacleLeft && characterX <= obstacleRight;

      if (overlapping) {
        const center = movingGapCenter(obstacle, simTimeMs / 1000);
        const effectiveHalfGap = (obstacle.gapPct / 2) * (1 + GAP.hitboxPaddingPct);
        const top = center - effectiveHalfGap;
        const bottom = center + effectiveHalfGap;
        if (obstacle.type === 'steam_pulse') {
          // visual distraction only, never affects collision
        } else if (y - CHARACTER_RADIUS_VW < top || y + CHARACTER_RADIUS_VW > bottom) {
          collided = true;
          collisionType = 'character_collision';
          collisionTimeMs = simTimeMs;
          break;
        }
      }

      if (hasClearedObstacle(obstacle, characterX)) {
        obstacle.scored = true;
        passedObstacles += 1;
        const center = obstacle.gapCenter;
        const cleanTolerance = 0.22;
        const perfectTolerance = 0.1;
        const normalizedOffset = Math.abs(y - center) / obstacle.gapPct;
        if (normalizedOffset <= perfectTolerance) {
          perfectPasses += 1;
          cleanPasses += 1;
          cleanStreak += 1;
        } else if (normalizedOffset <= cleanTolerance) {
          cleanPasses += 1;
          cleanStreak += 1;
        } else {
          cleanStreak = 0;
        }
        longestCleanStreak = Math.max(longestCleanStreak, cleanStreak);
      }
    }

    simTimeMs += FIXED_STEP_MS;

  }

  const finalMetrics = {
    passedObstacles,
    cleanPasses,
    perfectPasses,
    longestCleanStreak,
    survivalSeconds: (collisionTimeMs ?? simTimeMs) / 1000,
    collision: collided || exitedBounds,
    collisionType: collisionType ?? (simTimeMs >= maxDurationMs ? 'maximum_duration_reached' : null),
    cleanPassRatio: passedObstacles > 0 ? cleanPasses / passedObstacles : 0,
    perfectPassRatio: passedObstacles > 0 ? perfectPasses / passedObstacles : 0,
    effectiveFlapCount,
    actualValidFlapCount: flapCursor,
  };

  return finalMetrics;
}
