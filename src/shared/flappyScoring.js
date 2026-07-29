export const MIN_FLAPPY_DISCOUNT_PERCENT = 3;
export const MAX_FLAPPY_DISCOUNT_PERCENT = 25;

/**
 * Transparent gate-only tiers:
 *   3-10%: +1% per gate
 *   10-20%: +1% per 2 gates
 *   20-25%: +1% per 3 gates
 */
export function computeFlappyResult({ passedObstacles = 0 }) {
  const gates = Math.max(0, Math.floor(Number(passedObstacles) || 0));
  let discountPercent;

  if (gates <= 7) {
    discountPercent = MIN_FLAPPY_DISCOUNT_PERCENT + gates;
  } else if (gates <= 27) {
    discountPercent = 10 + Math.floor((gates - 7) / 2);
  } else {
    discountPercent = 20 + Math.floor((gates - 27) / 3);
  }

  discountPercent = Math.min(MAX_FLAPPY_DISCOUNT_PERCENT, discountPercent);

  return {
    finalScore: gates,
    discountPercent,
    components: { passedObstacles: gates },
  };
}
