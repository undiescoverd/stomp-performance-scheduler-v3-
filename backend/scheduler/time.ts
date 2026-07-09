/**
 * Show times that may not be known yet.
 *
 * A `status: "show"` row can carry `time: "TBC"` (or `callTime: "TBC"`) when the
 * slot is booked but the clock isn't set. Nothing else is allowed: TBC is the
 * only non-`HH:MM` value a show may hold.
 *
 * Every date+time parse in the scheduler has to route through here. A raw
 * `new Date(\`${date}T${time}\`)` on a TBC show yields an Invalid Date, whose
 * `getTime()` is NaN, and a NaN comparator makes `Array.sort` return an
 * arbitrary order *without throwing* — the consecutive-show and fatigue checks
 * would then read a week that never existed.
 *
 * This module imports nothing so the frontend can import it at runtime through
 * the `~backend` alias.
 */

export const TBC = "TBC";

/** A real clock time the scheduler can order and reason about. */
export function isKnownTime(t: string): boolean {
  return /^\d{2}:\d{2}$/.test(t);
}

/** Coerce anything that isn't a clock time — including "" — to TBC. */
export function normalizeTime(t: string): string {
  return isKnownTime(t) ? t : TBC;
}

/**
 * A lexically chronological key for a show. ISO date + `HH:MM` compares the same
 * as the instants do, so this is a drop-in for the old `Date`-difference sort.
 *
 * An unknown time parks at `99:99`: **TBC sorts to the end of its own day**, the
 * same convention `sortShows` already uses for travel columns.
 */
export function showSortKey(date: string, time: string): string {
  return `${date}T${isKnownTime(time) ? time : "99:99"}`;
}

/** The show's instant, or null when its time isn't known. Never an Invalid Date. */
export function parseShowDateTime(date: string, time: string): Date | null {
  if (!isKnownTime(time)) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d;
}
