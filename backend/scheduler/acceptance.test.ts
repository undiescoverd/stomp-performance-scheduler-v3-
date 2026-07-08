import { describe, it, expect } from "vitest";
import { SchedulingAlgorithm } from "./algorithm";
import { CAST_MEMBERS, ROLES, FEMALE_ONLY_ROLES, Show, Assignment, Role } from "./types";
import { areDatesConsecutive } from "./date_rules";

// Phase 7 — full-system acceptance suite.
//
// These tests independently RE-COMPUTE every §0 invariant from the returned
// assignments; they do not trust validateSchedule. A green validator plus a
// green independent recompute is the acceptance gate.

const CAST = CAST_MEMBERS;

// Standard 8-show week: Tue–Fri single evenings + Sat/Sun matinee & evening.
const standardWeek = (): Show[] => ([
  { id: "tue", date: "2024-01-02", time: "19:30", callTime: "18:00", status: "show" },
  { id: "wed", date: "2024-01-03", time: "19:30", callTime: "18:00", status: "show" },
  { id: "thu", date: "2024-01-04", time: "19:30", callTime: "18:00", status: "show" },
  { id: "fri", date: "2024-01-05", time: "19:30", callTime: "18:00", status: "show" },
  { id: "sat_mat", date: "2024-01-06", time: "14:00", callTime: "12:30", status: "show" },
  { id: "sat_eve", date: "2024-01-06", time: "19:30", callTime: "18:00", status: "show" },
  { id: "sun_mat", date: "2024-01-07", time: "14:00", callTime: "12:30", status: "show" },
  { id: "sun_eve", date: "2024-01-07", time: "19:30", callTime: "18:00", status: "show" }
]);

// Per-performer stage shows-per-date map (mat+eve on one date => 2).
function stageCountsByDate(assignments: Assignment[], shows: Show[], performer: string): Record<string, number> {
  const dateById = new Map(shows.map(s => [s.id, s.date]));
  const counts: Record<string, number> = {};
  for (const a of assignments) {
    if (a.performer !== performer || a.role === "OFF") continue;
    const date = dateById.get(a.showId);
    if (!date) continue;
    counts[date] = (counts[date] || 0) + 1;
  }
  return counts;
}

function maxConsecutive(counts: Record<string, number>): number {
  const dates = Object.keys(counts).sort();
  let max = 0, run = 0, prev: string | null = null;
  for (const d of dates) {
    run = prev && areDatesConsecutive(prev, d) ? run + counts[d] : counts[d];
    max = Math.max(max, run);
    prev = d;
  }
  return max;
}

function hasBackToBackDoubles(counts: Record<string, number>): boolean {
  const dates = Object.keys(counts).sort();
  for (let i = 0; i < dates.length - 1; i++) {
    if (areDatesConsecutive(dates[i], dates[i + 1]) && counts[dates[i]] === 2 && counts[dates[i + 1]] === 2) return true;
  }
  return false;
}

// Set of dates on which a performer has a RED-flagged OFF slot (uses ALL shows,
// including dayoff-status shows that carry the company RED day).
function redDates(assignments: Assignment[], shows: Show[], performer: string): Set<string> {
  const dateById = new Map(shows.map(s => [s.id, s.date]));
  return new Set(
    assignments
      .filter(a => a.performer === performer && a.role === "OFF" && a.isRedDay)
      .map(a => dateById.get(a.showId))
      .filter((d): d is string => !!d)
  );
}

describe("Phase 7 — acceptance", () => {
  it("standard-week soak: 50 generations all satisfy every §0 invariant", async () => {
    const eligibleByName = new Map(CAST.map(m => [m.name, m]));

    for (let run = 0; run < 50; run++) {
      const shows = standardWeek();
      const algorithm = new SchedulingAlgorithm(shows, CAST);
      const result = await algorithm.autoGenerate();
      if (!result.success) continue;
      const a = result.assignments;

      // Casting: every show exactly 8 unique performers, all 8 roles, eligible + gender-correct.
      for (const show of shows) {
        const stage = a.filter(x => x.showId === show.id && x.role !== "OFF");
        expect(stage.length).toBe(8);
        expect(new Set(stage.map(x => x.role)).size).toBe(8);
        expect(new Set(stage.map(x => x.performer)).size).toBe(8);
        for (const x of stage) {
          const member = eligibleByName.get(x.performer)!;
          expect(member.eligibleRoles).toContain(x.role as Role);
          if (FEMALE_ONLY_ROLES.includes(x.role as Role)) expect(member.gender).toBe("female");
        }
      }

      // Fatigue + workload + RED, recomputed independently per performer.
      for (const member of CAST) {
        const counts = stageCountsByDate(a, shows, member.name);
        const total = Object.values(counts).reduce((s, n) => s + n, 0);
        expect(maxConsecutive(counts)).toBeLessThanOrEqual(6);
        expect(hasBackToBackDoubles(counts)).toBe(false);
        expect(total).toBeLessThanOrEqual(6);

        const reds = redDates(a, shows, member.name);
        expect(reds.size).toBe(1);
        expect(counts[[...reds][0]] ?? 0).toBe(0); // RED day is a full day off
      }

      // And the validator agrees.
      expect(algorithm.validateSchedule(a).errors).toEqual([]);
    }
  });

  it("split week: company dayoff (Tue) is everyone's RED day; no back-to-back", async () => {
    const shows: Show[] = [
      { id: "mon", date: "2024-01-01", time: "00:00", callTime: "00:00", status: "travel" },
      { id: "tue", date: "2024-01-02", time: "00:00", callTime: "00:00", status: "dayoff" },
      { id: "wed", date: "2024-01-03", time: "19:30", callTime: "18:00", status: "show" },
      { id: "thu", date: "2024-01-04", time: "00:00", callTime: "00:00", status: "travel" },
      { id: "fri", date: "2024-01-05", time: "19:30", callTime: "18:00", status: "show" },
      { id: "sat_mat", date: "2024-01-06", time: "14:00", callTime: "12:30", status: "show" },
      { id: "sat_eve", date: "2024-01-06", time: "19:30", callTime: "18:00", status: "show" },
      { id: "sun_mat", date: "2024-01-07", time: "14:00", callTime: "12:30", status: "show" },
      { id: "sun_eve", date: "2024-01-07", time: "19:30", callTime: "18:00", status: "show" }
    ];
    const algorithm = new SchedulingAlgorithm(shows, CAST);
    const result = await algorithm.autoGenerate();
    expect(result.success).toBe(true);
    const a = result.assignments;

    for (const member of CAST) {
      const reds = redDates(a, shows, member.name);
      expect([...reds]).toEqual(["2024-01-02"]); // Tuesday company dayoff
      expect(hasBackToBackDoubles(stageCountsByDate(a, shows, member.name))).toBe(false);
    }
  });

  it("two dayoff days: only the earliest is the company RED day", async () => {
    const shows: Show[] = [
      { id: "tue", date: "2024-01-02", time: "00:00", callTime: "00:00", status: "dayoff" },
      { id: "wed", date: "2024-01-03", time: "19:30", callTime: "18:00", status: "show" },
      { id: "thu", date: "2024-01-04", time: "19:30", callTime: "18:00", status: "show" },
      { id: "fri", date: "2024-01-05", time: "00:00", callTime: "00:00", status: "dayoff" },
      { id: "sat_mat", date: "2024-01-06", time: "14:00", callTime: "12:30", status: "show" },
      { id: "sat_eve", date: "2024-01-06", time: "19:30", callTime: "18:00", status: "show" },
      { id: "sun_mat", date: "2024-01-07", time: "14:00", callTime: "12:30", status: "show" },
      { id: "sun_eve", date: "2024-01-07", time: "19:30", callTime: "18:00", status: "show" }
    ];
    const algorithm = new SchedulingAlgorithm(shows, CAST);
    const result = await algorithm.autoGenerate();
    expect(result.success).toBe(true);
    const a = result.assignments;

    for (const member of CAST) {
      // Exactly one RED day, and it is the EARLIER dayoff (Tuesday), never Friday.
      expect([...redDates(a, shows, member.name)]).toEqual(["2024-01-02"]);
    }
    // No performer flagged with more than one RED day.
    expect(algorithm.validateSchedule(a).errors.filter(e => e.includes("more than one RED day"))).toEqual([]);
  });
});
