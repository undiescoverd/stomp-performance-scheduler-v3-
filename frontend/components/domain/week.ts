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
