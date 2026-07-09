import { formatDistanceToNow } from "date-fns";
import type { Show } from "~backend/scheduler/types";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The generated Encore client's dateReviver parses any ISO-date-looking string
 * (e.g. a Show.date "2025-08-05") into a Date at runtime — even though the type
 * says `string`. Such a Date is UTC-midnight, so we recover the calendar date
 * with UTC getters. Normalize everything through this before string date ops.
 */
export function isoDate(d: string | Date): string {
  if (d instanceof Date) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return String(d ?? "");
}

/** Parse a date (string or revived Date) as a local calendar date. */
export function parseLocalDate(d: string | Date): Date {
  const [y, m, day] = isoDate(d).split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, day || 1);
}

/** Split "London — Ambassadors Theatre" into [city, venue]. */
export function splitLocation(loc: string): [string, string] {
  const parts = loc.split(/\s+[—–-]\s+/);
  return [parts[0]?.trim() ?? loc, parts.slice(1).join(" - ").trim()];
}

export function dowShort(d: string | Date): string {
  return DOW[parseLocalDate(d).getDay()];
}

export function dayNumber(d: string | Date): number {
  return parseLocalDate(d).getDate();
}

/** "22 Jul" — day + short month. */
export function shortDate(d: string | Date): string {
  const dt = parseLocalDate(d);
  return `${dt.getDate()} ${MON[dt.getMonth()]}`;
}

/** "Week 32" from a raw week value; passes values that already contain the word
 *  through unchanged (tour weeks are stored as "Week 10", normal weeks as "32"). */
export function weekLabel(week: string): string {
  const w = (week ?? "").trim();
  if (!w) return "Week —";
  return /week/i.test(w) ? w : `Week ${w}`;
}

/** Deterministic, in-palette avatar background for a performer name. White text
 *  sits on it legibly in both light and dark. */
export function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `oklch(56% 0.16 ${h})`;
}

/** 24h "HH:MM" -> "7:30 PM"; passes through "TBC"/empty. */
export function fmtTime(t: string): string {
  if (!t || t === "TBC") return "TBC";
  const [h, m] = t.split(":");
  const hh = parseInt(h, 10);
  if (Number.isNaN(hh)) return t;
  const ap = hh >= 12 ? "PM" : "AM";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${m || "00"} ${ap}`;
}

/** "Aug 5 – 10" or "Jul 29 – Aug 3" from a show list. */
export function dateRange(shows: Show[]): string {
  const dates = shows
    .map((s) => isoDate(s.date))
    .filter(Boolean)
    .sort();
  if (!dates.length) return "No dates";
  const a = parseLocalDate(dates[0]);
  const b = parseLocalDate(dates[dates.length - 1]);
  const left = `${MON[a.getMonth()]} ${a.getDate()}`;
  const right = a.getMonth() === b.getMonth() ? `${b.getDate()}` : `${MON[b.getMonth()]} ${b.getDate()}`;
  return `${left} – ${right}`;
}

export function relTime(d: Date | string): string {
  try {
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return "";
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return "";
  }
}
