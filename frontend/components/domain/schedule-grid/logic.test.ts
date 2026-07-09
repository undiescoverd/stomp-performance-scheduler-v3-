import { describe, it, expect } from "vitest";
import { showConflicts, analyzeFatigue, gridAnalytics, rosterShowCounts } from "./logic";
import type { Show, Assignment, CastMember } from "~backend/scheduler/types";

const show = (id: string, date: string): Show => ({ id, date, time: "19:30", callTime: "18:00", status: "show" });
const cast: CastMember[] = [
  { name: "ALEX", eligibleRoles: ["Sarge"] },
  { name: "SAM", eligibleRoles: ["Potato"] },
];

describe("showConflicts", () => {
  it("flags a performer double-booked in the same show", () => {
    const assigns: Assignment[] = [
      { showId: "s1", role: "Sarge", performer: "ALEX" },
      { showId: "s1", role: "Potato", performer: "ALEX" },
    ];
    expect([...showConflicts(assigns, "s1")]).toEqual(["ALEX"]);
  });
  it("is empty with no duplicates", () => {
    const assigns: Assignment[] = [
      { showId: "s1", role: "Sarge", performer: "ALEX" },
      { showId: "s1", role: "Potato", performer: "SAM" },
    ];
    expect(showConflicts(assigns, "s1").size).toBe(0);
  });
});

describe("analyzeFatigue", () => {
  it("detects a back-to-back double (2 shows on each of two consecutive dates)", () => {
    const shows = [show("a1", "2025-08-09"), show("a2", "2025-08-09"), show("b1", "2025-08-10"), show("b2", "2025-08-10")];
    const assigns: Assignment[] = shows.map((s) => ({ showId: s.id, role: "Sarge", performer: "ALEX" }));
    const issues = analyzeFatigue(assigns, shows, cast);
    expect(issues.some((i) => i.performer === "ALEX" && i.kind === "back-to-back")).toBe(true);
  });

  it("does NOT flag a single double-day (only one date with 2 shows)", () => {
    const shows = [show("a1", "2025-08-09"), show("a2", "2025-08-09"), show("b1", "2025-08-10")];
    const assigns: Assignment[] = shows.map((s) => ({ showId: s.id, role: "Sarge", performer: "ALEX" }));
    expect(analyzeFatigue(assigns, shows, cast).some((i) => i.kind === "back-to-back")).toBe(false);
  });

  it("detects the weekly cap (>6 stage shows)", () => {
    const shows = Array.from({ length: 7 }, (_, i) => show(`s${i}`, `2025-08-0${i + 1}`));
    const assigns: Assignment[] = shows.map((s) => ({ showId: s.id, role: "Sarge", performer: "ALEX" }));
    const issues = analyzeFatigue(assigns, shows, cast);
    expect(issues.some((i) => i.performer === "ALEX" && i.kind === "weekly")).toBe(true);
  });

  it("marks an issue overridden when a stage assignment carries isOverride", () => {
    const shows = Array.from({ length: 7 }, (_, i) => show(`s${i}`, `2025-08-0${i + 1}`));
    const assigns: Assignment[] = shows.map((s, i) => ({ showId: s.id, role: "Sarge", performer: "ALEX", isOverride: i === 0 }));
    expect(analyzeFatigue(assigns, shows, cast).find((i) => i.kind === "weekly")?.overridden).toBe(true);
  });
});

describe("gridAnalytics", () => {
  it("counts filled slots, conflicts, and RED coverage", () => {
    const shows = [show("s1", "2025-08-05")];
    const assigns: Assignment[] = [
      { showId: "s1", role: "Sarge", performer: "ALEX" },
      { showId: "s1", role: "OFF", performer: "SAM", isRedDay: true },
    ];
    const a = gridAnalytics(assigns, shows, ["Sarge", "Potato"]);
    expect(a.filled).toBe(1);
    expect(a.totalSlots).toBe(2);
    expect(a.conflicts).toBe(0);
    expect(a.redCovered).toBe(1);
  });
});

describe("rosterShowCounts", () => {
  it("returns every cast member, alphabetically, with 0 shows on a clean-slate schedule", () => {
    const shows = [show("s1", "2025-08-05"), show("s2", "2025-08-06")];
    const roster = rosterShowCounts([], shows, cast);
    expect(roster).toEqual([
      { name: "ALEX", showCount: 0 },
      { name: "SAM", showCount: 0 },
    ]);
  });

  it("counts one show per unique stage assignment, ignoring OFF and duplicate roles", () => {
    const shows = [show("s1", "2025-08-05"), show("s2", "2025-08-06")];
    const assigns: Assignment[] = [
      { showId: "s1", role: "Sarge", performer: "ALEX" },
      { showId: "s2", role: "Sarge", performer: "ALEX" },
      { showId: "s2", role: "OFF", performer: "SAM", isRedDay: true },
    ];
    const roster = rosterShowCounts(assigns, shows, cast);
    expect(roster).toEqual([
      { name: "ALEX", showCount: 2 },
      { name: "SAM", showCount: 0 },
    ]);
  });

  it("does not count assignments on travel or company-day-off days", () => {
    const shows: Show[] = [
      show("s1", "2025-08-05"),
      { ...show("s2", "2025-08-06"), status: "travel" },
      { ...show("s3", "2025-08-07"), status: "dayoff" },
    ];
    const assigns: Assignment[] = [
      { showId: "s1", role: "Sarge", performer: "ALEX" },
      { showId: "s2", role: "Sarge", performer: "ALEX" },
      { showId: "s3", role: "Sarge", performer: "ALEX" },
      { showId: "s2", role: "Potato", performer: "SAM" },
    ];
    const roster = rosterShowCounts(assigns, shows, cast);
    expect(roster).toEqual([
      { name: "ALEX", showCount: 1 },
      { name: "SAM", showCount: 0 },
    ]);
  });
});
