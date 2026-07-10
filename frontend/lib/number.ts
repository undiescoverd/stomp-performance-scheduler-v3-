/**
 * Clamp a raw input string to an integer in [min, max].
 *
 * Takes the raw string rather than a number so a half-typed field never has to
 * be a valid number: an empty box, or "1" on its way to "12", parses to the
 * fallback instead of crashing or snapping. Callers commit on blur/Enter, not
 * on every keystroke.
 */
export function clampToRange(raw: string, min: number, max: number, fallback: number): number {
  const n = parseInt(raw.trim(), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
