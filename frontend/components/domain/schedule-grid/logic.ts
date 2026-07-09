import type { Show, Assignment, CastMember, Role } from "~backend/scheduler/types";
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

/** Is `performer` flagged RED on the given calendar date (normalized key)? */
export function isRedDayFor(
  assignments: Assignment[],
  shows: Show[],
  performer: string,
  date: string,
): boolean {
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
): GridAnalytics {
  const showShows = shows.filter((s) => s.status === "show");
  const showIds = new Set(showShows.map((s) => s.id));
  const totalSlots = showShows.length * roles.length;
  const filled = assignments.filter((a) => a.role !== "OFF" && a.performer && showIds.has(a.showId)).length;
  const conflicts = showShows.reduce((n, s) => n + showConflicts(assignments, s.id).size, 0);
  const redCovered = new Set(assignments.filter((a) => a.isRedDay).map((a) => a.performer)).size;
  return {
    showCount: showShows.length,
    filled,
    totalSlots,
    coveragePct: totalSlots ? Math.round((filled / totalSlots) * 100) : 0,
    conflicts,
    redCovered,
  };
}
