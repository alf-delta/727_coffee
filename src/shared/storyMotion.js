export function easeStoryEntry(progress) {
  const clamped = Math.max(0, Math.min(1, Number(progress) || 0));
  const smoothStart = clamped * clamped * (3 - (2 * clamped));
  return 1 - ((1 - smoothStart) ** 4);
}
