import type { Show, DayStatus, TemplateSlot } from "~backend/scheduler/types";
import { isKnownTime, normalizeTime } from "~backend/scheduler/time";
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

/** Whole days from `b` to `a` (positive when `a` is later). */
export function dayDiffIso(a: string, b: string): number {
  return Math.round(
    (new Date(`${isoDate(a)}T00:00:00Z`).getTime() - new Date(`${isoDate(b)}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/** Today as YYYY-MM-DD on the user's local calendar (not UTC's). */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Shows falling on one calendar date, in the order they appear in `list`. */
export function showsOnDate(list: Show[], date: string): Show[] {
  return list.filter((s) => isoDate(s.date) === date);
}

// Travel columns carry a non-HH:MM time ("Travel"), and a show whose time isn't
// set yet carries "TBC". Park both at the end of their own date rather than
// letting a string compare scatter them.
const sortKey = (s: Show) => `${isoDate(s.date)} ${isKnownTime(s.time) ? s.time : "99:99"}`;

/** Chronological, matinee before evening. */
export function sortShows(list: Show[]): Show[] {
  return [...list].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/**
 * Default times for a show by weekday. `occurrence` disambiguates two-show
 * days: 0 is the matinee, 1 the evening. Without it a single date cannot tell
 * its matinee from its evening, which silently collapsed both Saturday columns
 * onto the matinee time. Sat/Sun are always treated as two-show days; any other
 * weekday only gets a matinee slot when `showsOnDay` says the day actually
 * holds more than one show (tour weeks put a matinee on Wednesday), otherwise
 * both shows on that date would land on the same time.
 */
export function getDefaultShowTimes(date: string, occurrence = 0, showsOnDay = 1): { time: string; callTime: string } {
  const weekdayMatinee = showsOnDay >= 2 && occurrence === 0;
  switch (new Date(`${isoDate(date)}T00:00:00Z`).getUTCDay()) {
    case 2: // Tuesday
      return weekdayMatinee ? { time: "15:00", callTime: "13:30" } : { time: "20:00", callTime: "17:00" };
    case 6: // Saturday — matinee then evening
      return occurrence === 0 ? { time: "15:00", callTime: "13:30" } : { time: "20:00", callTime: "18:00" };
    case 0: // Sunday — matinee then evening
      return occurrence === 0 ? { time: "15:00", callTime: "13:30" } : { time: "18:00", callTime: "16:30" };
    default: // Monday, Wednesday–Friday
      return weekdayMatinee ? { time: "15:00", callTime: "13:30" } : { time: "20:00", callTime: "18:00" };
  }
}

/** Re-time every show column, leaving travel and day-off columns untouched. */
export function resetShowTimes(shows: Show[]): Show[] {
  const showsPerDate = new Map<string, number>();
  for (const show of shows) {
    if (show.status !== "show") continue;
    const date = isoDate(show.date);
    showsPerDate.set(date, (showsPerDate.get(date) ?? 0) + 1);
  }

  const seenPerDate = new Map<string, number>();
  return shows.map((show) => {
    if (show.status !== "show") return show;
    const date = isoDate(show.date);
    const occurrence = seenPerDate.get(date) ?? 0;
    seenPerDate.set(date, occurrence + 1);
    return { ...show, ...getDefaultShowTimes(date, occurrence, showsPerDate.get(date)) };
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
  const isEvening = isKnownTime(existing.time) && existing.time >= "18:00";
  const slot = isEvening ? MATINEE : EVENING;

  return { date, status: "show", ...slot, location: existing.location };
}

/**
 * Two shows on one date must not share a time: `nextShow` restores a removed
 * slot by matching on time, and a duplicate makes it restore the wrong one.
 *
 * TBC never collides. Two shows on a day can both be waiting on a curtain time,
 * and refusing the second edit would leave the user no way to say so.
 */
export function timeIsFree(shows: Show[], showId: string, time: string): boolean {
  const target = shows.find((s) => s.id === showId);
  if (!target) return false;
  if (!isKnownTime(time)) return true;
  return !showsOnDate(shows, isoDate(target.date)).some((s) => s.id !== showId && s.time === time);
}

/**
 * One column of the grid. A date the week has emptied out still gets a column,
 * with no show in it, so the week always reads as a whole and the day can be
 * put back where it was.
 */
export interface Column {
  date: string;
  show: Show | null;
}

/** The Monday on or before a date. */
export function mondayOf(date: string): string {
  const d = new Date(`${isoDate(date)}T00:00:00Z`);
  const dow = d.getUTCDay(); // Sunday = 0
  return addDaysIso(isoDate(date), -(dow === 0 ? 6 : dow - 1));
}

/** The Monday on or after a date; a Monday returns itself. */
export function nextMondayFrom(date: string): string {
  const d = new Date(`${isoDate(date)}T00:00:00Z`);
  const dow = d.getUTCDay(); // Sunday = 0
  return addDaysIso(isoDate(date), (8 - dow) % 7);
}

/**
 * The week's Monday, taken from the *earliest* show.
 *
 * Not `shows[0]`: nothing keeps the array sorted once days are reshaped or
 * re-timed, and an unsorted first element would slide the whole frame by a day.
 */
export function weekStartOf(shows: Show[]): string | null {
  const dates = shows.map((s) => isoDate(s.date)).filter(Boolean).sort();
  return dates.length ? mondayOf(dates[0]) : null;
}

/**
 * Every date the grid shows: Monday through Sunday, extended if a show sits
 * past Sunday so `nextShow` growing the week can never hide a column.
 */
export function weekFrame(shows: Show[], weekStart: string): string[] {
  const last = shows.map((s) => isoDate(s.date)).filter(Boolean).sort().pop();
  const dates: string[] = [];
  for (let i = 0; i < 7 || (last && dates[dates.length - 1] < last); i++) {
    dates.push(addDaysIso(weekStart, i));
    if (i > 60) break; // a malformed date can't spin this forever
  }
  return dates;
}

/** Columns in grid order: a date's shows, or one empty column if it has none. */
export function columnsForWeek(shows: Show[], weekStart: string): Column[] {
  const ordered = sortShows(shows);
  return weekFrame(shows, weekStart).flatMap<Column>((date) => {
    const onDate = showsOnDate(ordered, date);
    return onDate.length ? onDate.map((show) => ({ date, show })) : [{ date, show: null }];
  });
}

/** A run of consecutive columns sharing one city. */
export interface CitySegment {
  city: string;
  span: number;
}

/** A show's city: its own, else the schedule's. */
export function cityOf(show: Show, fallback: string): string {
  return (show.location ?? "").trim() || fallback;
}

/**
 * The city of each column, in order.
 *
 * A column holding a show has that show's city, or the schedule's when it names
 * none. Only an *empty* column borrows, and it borrows from the day *after* it:
 * a removed day is never a travel day, and the travel day is what marks the
 * boundary, so filling backwards keeps an emptied day on the correct side of the
 * divider. Filling forwards drags it across. Trailing empty columns fall back to
 * the last city seen.
 */
export function resolveCities(columns: Column[], fallback: string): string[] {
  const filled: (string | null)[] = columns.map((c) =>
    c.show ? (c.show.location ?? "").trim() || fallback : null,
  );

  for (let i = filled.length - 2; i >= 0; i--) filled[i] ??= filled[i + 1];
  for (let i = 1; i < filled.length; i++) filled[i] ??= filled[i - 1];

  return filled.map((city) => city ?? fallback);
}

/**
 * Consecutive columns grouped by city. A single-city week yields one segment
 * spanning everything; the divider between segments is what marks a mid-week move.
 */
export function citySegments(columns: Column[], fallback: string): CitySegment[] {
  const segments: CitySegment[] = [];
  for (const city of resolveCities(columns, fallback)) {
    const last = segments[segments.length - 1];
    if (last && last.city === city) last.span += 1;
    else segments.push({ city, span: 1 });
  }
  return segments;
}

/**
 * Put an emptied date back. Prefers the slot the week had there when it opened,
 * so restoring a removed Saturday matinee brings back the matinee, and a removed
 * travel day comes back as a travel day.
 */
export function restoreDate(baseline: Show[], date: string): Omit<Show, "id"> {
  const wanted = showsOnDate(baseline, date)[0];
  if (wanted) {
    const { id: _id, ...rest } = wanted;
    return { ...rest, date };
  }
  return { date, status: "show", ...getDefaultShowTimes(date, 0) };
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

/**
 * Apply a status change to one show, keeping the company RED day invariant:
 * at most one day off carries it. The week's first day off auto-nominates —
 * a normal single-dark-day week behaves exactly as it always has — a second
 * one (a loading day, say) stays unmarked until the scheduler moves the tick
 * onto it. Leaving dayoff status always drops the flag: it must never
 * resurrect on a later change, and it is meaningless on a show or travel day.
 */
export function applyShowStatus(shows: Show[], showId: string, status: DayStatus): Show[] {
  const alreadyHasCompanyRedDay = shows.some((s) => s.isCompanyRedDay);
  return shows.map((show) => {
    if (show.id !== showId) return show;
    if (status === "dayoff") {
      return { ...show, status, isCompanyRedDay: alreadyHasCompanyRedDay ? show.isCompanyRedDay : true };
    }
    const { isCompanyRedDay: _drop, ...rest } = show;
    return { ...rest, status };
  });
}

/**
 * Nominate (or clear) a day off as the whole company's RED day. At most one
 * may be set at a time: nominating one clears any other, so the checkbox
 * behaves like a radio across the week. Unticking everything is valid — the
 * v3.1 fairness path then places each performer's own RED day.
 */
export function setCompanyRedDay(shows: Show[], showId: string, on: boolean): Show[] {
  const target = shows.find((s) => s.id === showId);
  if (!target || target.status !== "dayoff") return shows;
  return shows.map((show) => {
    if (show.id === showId) return { ...show, isCompanyRedDay: on };
    return show.status === "dayoff" && show.isCompanyRedDay ? { ...show, isCompanyRedDay: false } : show;
  });
}

// --- Week templates: capture and apply ---------------------------------------
//
// A template is a Monday-relative day pattern (TemplateSlot[]). Both entry
// points — the standalone New Schedule modal and the tour wizard — resolve a
// template + a week-start into Show[] through applyTemplate; the editor's
// "Save as template" captures the current week through showsToSlots. The
// backend stores slots verbatim, so ALL offset↔date math lives here.

let slotIdSeq = 0;
/** A fresh, collision-free id for a show minted from a template slot. */
function freshShowId(index: number): string {
  slotIdSeq = (slotIdSeq + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${index}-${slotIdSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Capture a week as a reusable template: each show becomes a Monday-relative
 * slot. Cast, venue (`location`) and per-show `id` are dropped — a template is
 * a shape, not an assignment. Ordered by offset then time so the stored pattern
 * reads chronologically.
 */
export function showsToSlots(shows: Show[], weekStartIso: string): TemplateSlot[] {
  const start = isoDate(weekStartIso);
  // At most one company RED day per schedule (the same invariant the editor's
  // setCompanyRedDay upholds). Keep only the first valid flag so malformed input
  // can't capture a template with two.
  let companyRedCaptured = false;
  return sortShows(shows).map((s) => {
    const slot: TemplateSlot = {
      dayOffset: dayDiffIso(isoDate(s.date), start),
      time: s.time,
      callTime: s.callTime,
      status: s.status,
    };
    // isCompanyRedDay is only meaningful on a day off (see applyShowStatus).
    if (!companyRedCaptured && s.isCompanyRedDay && s.status === "dayoff") {
      slot.isCompanyRedDay = true;
      companyRedCaptured = true;
    }
    return slot;
  });
}

/**
 * Replay a template onto a chosen week-start, producing fresh Show[] with no
 * cast and no venue. `dayOffset` is added to the Monday, so offsets never
 * drift. Show times route through `normalizeTime` (an empty/unknown show time
 * becomes TBC); travel and day-off rows keep their raw label ("Travel"), which
 * `normalizeTime` would otherwise flatten to TBC.
 */
export function applyTemplate(slots: TemplateSlot[], weekStartIso: string): Show[] {
  const start = isoDate(weekStartIso);
  // Reproduce at most one company RED day, mirroring showsToSlots' capture rule.
  let companyRedApplied = false;
  return slots.map((slot, i) => {
    const show: Show = {
      id: freshShowId(i),
      date: addDaysIso(start, slot.dayOffset),
      time: slot.status === "show" ? normalizeTime(slot.time) : slot.time,
      callTime: slot.status === "show" ? normalizeTime(slot.callTime) : slot.callTime,
      status: slot.status,
    };
    if (!companyRedApplied && slot.isCompanyRedDay && slot.status === "dayoff") {
      show.isCompanyRedDay = true;
      companyRedApplied = true;
    }
    return show;
  });
}

/**
 * The built-in "Standard" week offered before any template is authored: a
 * Monday travel day, single evening shows Tue–Fri, and matinee+evening doubles
 * on Saturday and Sunday — eight shows in all. Times match the app's canonical
 * per-weekday defaults (getDefaultShowTimes). A Monday travel day does NOT drop
 * a show; that was the tour-generator bug this replaces.
 */
export const STANDARD_TEMPLATE_SLOTS: TemplateSlot[] = [
  { dayOffset: 0, time: "Travel", callTime: "Travel", status: "travel" }, // Monday
  { dayOffset: 1, time: "20:00", callTime: "17:00", status: "show" }, // Tuesday
  { dayOffset: 2, time: "20:00", callTime: "18:00", status: "show" }, // Wednesday
  { dayOffset: 3, time: "20:00", callTime: "18:00", status: "show" }, // Thursday
  { dayOffset: 4, time: "20:00", callTime: "18:00", status: "show" }, // Friday
  { dayOffset: 5, time: "15:00", callTime: "13:30", status: "show" }, // Saturday matinee
  { dayOffset: 5, time: "20:00", callTime: "18:00", status: "show" }, // Saturday evening
  { dayOffset: 6, time: "15:00", callTime: "13:30", status: "show" }, // Sunday matinee
  { dayOffset: 6, time: "18:00", callTime: "16:30", status: "show" }, // Sunday evening
];

/**
 * The template dropdown's built-in options, shared by the modal and the tour
 * wizard. `null` slots mean "Blank week" (an empty schedule). User-authored
 * templates from listTemplates() are appended after these.
 */
export interface TemplateChoice {
  id: string;
  name: string;
  slots: TemplateSlot[];
}

export const BLANK_TEMPLATE_ID = "__blank__";
export const STANDARD_TEMPLATE_ID = "__standard__";

export const BUILTIN_TEMPLATE_CHOICES: TemplateChoice[] = [
  { id: STANDARD_TEMPLATE_ID, name: "Standard", slots: STANDARD_TEMPLATE_SLOTS },
  { id: BLANK_TEMPLATE_ID, name: "Blank week", slots: [] },
];
