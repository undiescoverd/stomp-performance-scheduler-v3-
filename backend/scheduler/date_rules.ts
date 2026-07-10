// Shared date-based scheduling rules.
//
// The scheduler reasons about calendar days, never wall-clock times: a run of
// consecutive shows is broken by any calendar day on which the performer plays
// zero shows, and two shows on the same date (matinee + evening) are still the
// same day. Comparing full datetimes (as older code did) made results depend on
// show times and let a gap day silently chain a run together. Everything here
// compares DATES ONLY, anchored at noon UTC for DST safety.

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Parse a "YYYY-MM-DD" date string to a stable epoch-ms anchored at noon UTC.
// Noon-UTC anchoring keeps the calendar date correct in every timezone and
// across DST transitions.
export function parseDateOnly(date: string): number {
  return new Date(`${date}T12:00:00Z`).getTime();
}

// Whole-day difference between two "YYYY-MM-DD" strings (date2 - date1).
// Positive when date2 is later. Ignores time-of-day entirely.
export function dayDiff(date1: string, date2: string): number {
  return Math.round((parseDateOnly(date2) - parseDateOnly(date1)) / MS_PER_DAY);
}

// Two shows count toward the same consecutive run only when they fall on the
// same calendar date (a double: matinee + evening) or on directly adjacent
// dates. A gap of 2+ days — i.e. at least one intervening day with no show —
// resets the run.
export function areDatesConsecutive(date1: string, date2: string): boolean {
  const diff = Math.abs(dayDiff(date1, date2));
  return diff === 0 || diff === 1;
}
