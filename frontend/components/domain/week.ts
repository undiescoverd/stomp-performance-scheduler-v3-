import type { Show } from "~backend/scheduler/types";
import { isoDate } from "./format";

/**
 * Shaping a week: adding, ordering and re-timing the show columns in the
 * schedule editor. Pure and free of React so the awkward cases — two-show
 * days, restoring a removed matinee, tour weeks that don't follow the
 * standard shape — can be tested directly.
 */

/** Shift a YYYY-MM-DD date by whole days. Dates are UTC-midnight throughout. */
export function addDaysIso(date: string, n: number): string {
  return new Date(new Date(`${isoDate(date)}T00:00:00Z`).getTime() + n * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** Shows falling on one calendar date, in the order they appear in `list`. */
export function showsOnDate(list: Show[], date: string): Show[] {
  return list.filter((s) => isoDate(s.date) === date);
}

// Travel columns carry a non-HH:MM time ("Travel"), so park them at the end of
// their own date rather than letting a string compare scatter them.
const sortKey = (s: Show) => `${isoDate(s.date)} ${/^\d{2}:\d{2}$/.test(s.time) ? s.time : "99:99"}`;

/** Chronological, matinee before evening. */
export function sortShows(list: Show[]): Show[] {
  return [...list].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/**
 * Default times for a show by weekday. `occurrence` disambiguates the two-show
 * days (Sat/Sun): 0 is the matinee, 1 the evening. Without it a single date
 * cannot tell its matinee from its evening, which silently collapsed both
 * Saturday columns onto the matinee time.
 */
export function getDefaultShowTimes(date: string, occurrence = 0): { time: string; callTime: string } {
  switch (new Date(`${isoDate(date)}T00:00:00Z`).getUTCDay()) {
    case 2: // Tuesday
      return { time: "20:00", callTime: "17:00" };
    case 3: // Wednesday
    case 4: // Thursday
    case 5: // Friday
      return { time: "20:00", callTime: "18:00" };
    case 6: // Saturday — matinee then evening
      return occurrence === 0 ? { time: "15:00", callTime: "13:30" } : { time: "20:00", callTime: "18:00" };
    case 0: // Sunday — matinee then evening
      return occurrence === 0 ? { time: "15:00", callTime: "13:30" } : { time: "18:00", callTime: "16:30" };
    default:
      return { time: "20:00", callTime: "18:00" };
  }
}

/** Re-time every show column, leaving travel and day-off columns untouched. */
export function resetShowTimes(shows: Show[]): Show[] {
  const seenPerDate = new Map<string, number>();
  return shows.map((show) => {
    const date = isoDate(show.date);
    const occurrence = seenPerDate.get(date) ?? 0;
    seenPerDate.set(date, occurrence + 1);
    if (show.status !== "show") return show;
    return { ...show, ...getDefaultShowTimes(date, occurrence) };
  });
}

const MATINEE = { time: "15:00", callTime: "13:30" };
const EVENING = { time: "20:00", callTime: "18:00" };

/**
 * A second show for a date that currently holds exactly one, without an id.
 * Returns null when the day can't take one — it's travel, a day off, or already
 * a double. An evening gains a matinee and a matinee gains an evening, so the
 * two never collide on a time (see `timeIsFree`).
 */
export function addShowToDate(shows: Show[], date: string): Omit<Show, "id"> | null {
  const day = showsOnDate(shows, date).filter((s) => s.status === "show");
  if (day.length !== 1) return null;

  const existing = day[0];
  const isEvening = /^\d{2}:\d{2}$/.test(existing.time) && existing.time >= "18:00";
  const slot = isEvening ? MATINEE : EVENING;

  return { date, status: "show", ...slot, location: existing.location };
}

/**
 * Two shows on one date must not share a time: `nextShow` restores a removed
 * slot by matching on time, and a duplicate makes it restore the wrong one.
 */
export function timeIsFree(shows: Show[], showId: string, time: string): boolean {
  const target = shows.find((s) => s.id === showId);
  if (!target) return false;
  return !showsOnDate(shows, isoDate(target.date)).some((s) => s.id !== showId && s.time === time);
}

/** A run of consecutive columns sharing one city. */
export interface CitySegment {
  city: string;
  span: number;
}

/** A column's city: its own, else the schedule's. */
export function cityOf(show: Show, fallback: string): string {
  return (show.location ?? "").trim() || fallback;
}

/**
 * Consecutive columns grouped by city, in column order. A single-city week
 * yields one segment spanning everything; the divider between segments is what
 * marks a mid-week move.
 */
export function citySegments(shows: Show[], fallback: string): CitySegment[] {
  const segments: CitySegment[] = [];
  for (const show of shows) {
    const city = cityOf(show, fallback);
    const last = segments[segments.length - 1];
    if (last && last.city === city) last.span += 1;
    else segments.push({ city, span: 1 });
  }
  return segments;
}

/**
 * Point a travel day at the city it's heading for.
 *
 * The travel day belongs to the city being *left*, so the destination is written
 * onto every column after it — up to and including the next travel day, which in
 * turn belongs to the city it leaves. That keeps each divider immediately after
 * its own travel column.
 */
export function setDestination(shows: Show[], travelShowId: string, city: string): Show[] {
  const ordered = sortShows(shows);
  const start = ordered.findIndex((s) => s.id === travelShowId);
  if (start < 0 || ordered[start].status !== "travel") return shows;

  return ordered.map((show, i) => {
    if (i <= start) return show;
    const previousWasTravel = ordered.slice(start + 1, i).some((s) => s.status === "travel");
    return previousWasTravel ? show : { ...show, location: city };
  });
}

/**
 * The show "Add Show" should add next, without an id.
 *
 * The grid has no editable date or time field, so a new column has to land on a
 * useful date by itself. Restoring from `baseline` — the week as it was opened,
 * not an assumed standard week — is what makes Remove Day undoable: a tour week
 * that arrives Mon–Sat with a Wednesday matinee restores exactly that.
 *
 * A date is short when it holds fewer shows than the baseline gave it. Within
 * that date we take the slot whose time is missing, so removing a Saturday
 * matinee brings back the matinee rather than a second evening. Once the
 * baseline is whole, grow the week past its last day instead.
 */
export function nextShow(baseline: Show[], current: Show[], today: Date = new Date()): Omit<Show, "id"> {
  const baselineDates = [...new Set(baseline.map((s) => isoDate(s.date)))].sort();

  for (const date of baselineDates) {
    const want = showsOnDate(baseline, date);
    const have = showsOnDate(current, date);
    if (have.length >= want.length) continue;
    const haveTimes = new Set(have.map((s) => s.time));
    const slot = want.find((s) => !haveTimes.has(s.time)) ?? want[have.length];
    const { id: _id, ...rest } = slot;
    return { ...rest, date: isoDate(slot.date) };
  }

  const last = current
    .map((s) => isoDate(s.date))
    .sort()
    .pop();
  const date = last ? addDaysIso(last, 1) : today.toISOString().slice(0, 10);
  return { date, status: "show", ...getDefaultShowTimes(date, showsOnDate(current, date).length) };
}
