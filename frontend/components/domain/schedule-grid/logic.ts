import type { Show, Assignment, CastMember, Role } from "~backend/scheduler/types";
import { isKnownTime } from "~backend/scheduler/time";
import { isoDate, parseLocalDate } from "@/components/domain/format";

/** Performer currently filling a role in a show ("" if empty). */
export function assignedPerformer(assignments: Assignment[], showId: string, role: Role): string {
  const a = assignments.find((x) => x.showId === showId && x.role === role);
  return a ? a.performer : "";
}

/** Performers double-booked (assigned >1 role) within a single show. */
export function showConflicts(assignments: Assignment[], showId: string): Set<string> {
  const perf = assignments
    .filter((a) => a.showId === showId && a.role !== "OFF")
    .map((a) => a.performer)
    .filter(Boolean);
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const p of perf) {
    if (seen.has(p)) dup.add(p);
    seen.add(p);
  }
  return dup;
}

/** Cast not holding any role in the given show (candidates for OFF/RED). */
export function offPerformers(
  assignments: Assignment[],
  castMembers: CastMember[],
  showId: string,
): string[] {
  const used = new Set(
    assignments
      .filter((a) => a.showId === showId && a.role !== "OFF")
      .map((a) => a.performer)
      .filter(Boolean),
  );
  return castMembers.map((m) => m.name).filter((n) => !used.has(n));
}

/**
 * The date nominated to carry the whole company's RED day, or null when none is.
 *
 * Filters on the isCompanyRedDay flag, not merely status === "dayoff": a week can
 * hold several days off and only one may be marked. Takes the earliest if two
 * somehow are, matching the backend's detectCompanyRedDate().
 */
export function companyRedDate(shows: Show[]): string | null {
  const flagged = shows
    .filter((s) => s.status === "dayoff" && s.isCompanyRedDay === true)
    .map((s) => isoDate(s.date))
    .sort();
  return flagged[0] ?? null;
}

/**
 * Is `performer` on a RED day on the given calendar date (normalized key)?
 *
 * DERIVED, never read straight off the stored flags: a performer's effective RED
 * date is the company RED date if the week has one, and only otherwise the date
 * of their own isRedDay OFF row. So while a company RED day is set the stored
 * flags are dormant — still in the data, so removing the day off restores them,
 * but ignored here.
 *
 * This mirrors validateSchedule in backend/scheduler/algorithm.ts. The two don't
 * share a module; if the grid and the validator ever disagree about RED days,
 * this pair is the first place to look.
 */
export function isRedDayFor(
  assignments: Assignment[],
  shows: Show[],
  performer: string,
  date: string,
): boolean {
  const company = companyRedDate(shows);
  if (company) return date === company;

  return assignments.some(
    (a) =>
      a.performer === performer &&
      a.isRedDay &&
      isoDate(shows.find((s) => s.id === a.showId)?.date ?? "") === date,
  );
}

function datesConsecutive(a: string, b: string): boolean {
  return Math.round((parseLocalDate(b).getTime() - parseLocalDate(a).getTime()) / 86_400_000) === 1;
}

export type FatigueKind = "weekly" | "back-to-back";
export interface FatigueIssue {
  performer: string;
  kind: FatigueKind;
  detail: string;
  overridden: boolean;
}

/**
 * The two OVERRIDABLE fatigue rules, computed client-side to place/gate the ⚑:
 * weekly cap (>6 stage shows) and back-to-back double days (two consecutive
 * dates each with exactly 2 stage shows). Mirrors algorithm.validateSchedule;
 * the backend `validate` call remains the authoritative verdict.
 */
export function analyzeFatigue(
  assignments: Assignment[],
  shows: Show[],
  castMembers: CastMember[],
): FatigueIssue[] {
  const activeById = new Map(shows.filter((s) => s.status === "show").map((s) => [s.id, s]));
  const stageByPerf = new Map<string, Assignment[]>();
  for (const a of assignments) {
    if (a.role === "OFF" || !activeById.has(a.showId)) continue;
    const list = stageByPerf.get(a.performer) ?? [];
    list.push(a);
    stageByPerf.set(a.performer, list);
  }

  const issues: FatigueIssue[] = [];
  for (const m of castMembers) {
    const stage = stageByPerf.get(m.name) ?? [];
    if (stage.length === 0) continue;
    const overridden = stage.some((a) => a.isOverride);

    if (stage.length > 6) {
      issues.push({ performer: m.name, kind: "weekly", detail: `${stage.length} shows this week`, overridden });
    }

    const byDate: Record<string, number> = {};
    for (const a of stage) {
      const d = isoDate(activeById.get(a.showId)!.date);
      byDate[d] = (byDate[d] || 0) + 1;
    }
    const dates = Object.keys(byDate).sort();
    for (let i = 0; i < dates.length - 1; i++) {
      if (byDate[dates[i]] === 2 && byDate[dates[i + 1]] === 2 && datesConsecutive(dates[i], dates[i + 1])) {
        issues.push({
          performer: m.name,
          kind: "back-to-back",
          detail: `4 shows across ${dates[i]} / ${dates[i + 1]}`,
          overridden,
        });
      }
    }
  }
  return issues;
}

const MATINEE_BEFORE = "17:00";

/**
 * Split the week's stage shows by curtain time.
 *
 * Both buckets are gated on a known time: a TBC show is neither a matinee nor an
 * evening, because nobody has decided yet. So `matinees + evenings` is the count
 * of *timed* shows, not `showCount` — deriving one from the other would sweep
 * every TBC show into whichever side wasn't gated.
 */
export function splitByCurtain(shows: Show[]): { matinees: number; evenings: number } {
  const timed = shows.filter((s) => s.status === "show" && isKnownTime(s.time));
  const matinees = timed.filter((s) => s.time < MATINEE_BEFORE).length;
  return { matinees, evenings: timed.length - matinees };
}

export interface RosterEntry {
  name: string;
  showCount: number;
}

/** Company roster with each performer's stage-show count for this week, sorted by name. */
export function rosterShowCounts(
  assignments: Assignment[],
  shows: Show[],
  castMembers: CastMember[],
): RosterEntry[] {
  const activeIds = new Set(shows.filter((s) => s.status === "show").map((s) => s.id));
  const showsByPerf = new Map<string, Set<string>>();
  for (const a of assignments) {
    if (a.role === "OFF" || !activeIds.has(a.showId)) continue;
    const set = showsByPerf.get(a.performer) ?? new Set<string>();
    set.add(a.showId);
    showsByPerf.set(a.performer, set);
  }
  return castMembers
    .map((m) => ({ name: m.name, showCount: showsByPerf.get(m.name)?.size ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface GridAnalytics {
  showCount: number;
  filled: number;
  totalSlots: number;
  coveragePct: number;
  conflicts: number;
  redCovered: number;
}

export function gridAnalytics(
  assignments: Assignment[],
  shows: Show[],
  roles: Role[],
  castMembers: CastMember[],
): GridAnalytics {
  const showShows = shows.filter((s) => s.status === "show");
  const showIds = new Set(showShows.map((s) => s.id));
  const totalSlots = showShows.length * roles.length;
  const filled = assignments.filter((a) => a.role !== "OFF" && a.performer && showIds.has(a.showId)).length;
  const conflicts = showShows.reduce((n, s) => n + showConflicts(assignments, s.id).size, 0);
  // A company RED day covers the whole company by derivation, so everyone is
  // RED-covered — the stored flags are dormant and would undercount.
  const redCovered = companyRedDate(shows)
    ? castMembers.length
    : new Set(assignments.filter((a) => a.isRedDay).map((a) => a.performer)).size;
  return {
    showCount: showShows.length,
    filled,
    totalSlots,
    coveragePct: totalSlots ? Math.round((filled / totalSlots) * 100) : 0,
    conflicts,
    redCovered,
  };
}
