import { describe, it, expect } from "vitest";
import {
  showConflicts,
  analyzeFatigue,
  gridAnalytics,
  rosterShowCounts,
  splitByCurtain,
  companyRedDate,
  isRedDayFor,
} from "./logic";
import type { Show, Assignment, CastMember } from "~backend/scheduler/types";

const show = (id: string, date: string): Show => ({ id, date, time: "19:30", callTime: "18:00", status: "show" });
const dayOff = (id: string, date: string, nominated: boolean): Show => ({
  id,
  date,
  time: "00:00",
  callTime: "00:00",
  status: "dayoff",
  isCompanyRedDay: nominated,
});
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
    const a = gridAnalytics(assigns, shows, ["Sarge", "Potato"], cast);
    expect(a.filled).toBe(1);
    expect(a.totalSlots).toBe(2);
    expect(a.conflicts).toBe(0);
    expect(a.redCovered).toBe(1);
  });

  it("counts the WHOLE company as RED-covered under a company RED day", () => {
    // ALEX has no stored flag, and would be undercounted by a stored-flag read.
    // The company RED day covers him anyway.
    const shows = [show("s1", "2025-08-05"), dayOff("d1", "2025-08-07", true)];
    const assigns: Assignment[] = [
      { showId: "s1", role: "OFF", performer: "SAM", isRedDay: true },
    ];
    const a = gridAnalytics(assigns, shows, ["Sarge", "Potato"], cast);
    expect(a.redCovered).toBe(cast.length);
  });
});

// The derived rule: a performer's effective RED date is the company RED date if
// the week has one, else the date of their own stored isRedDay OFF row.
describe("companyRedDate", () => {
  it("is null when a day off is not nominated", () => {
    expect(companyRedDate([show("s1", "2025-08-05"), dayOff("d1", "2025-08-07", false)])).toBeNull();
  });

  it("ignores the flag on a day that is not a day off", () => {
    const stray = { ...show("s1", "2025-08-05"), isCompanyRedDay: true };
    expect(companyRedDate([stray])).toBeNull();
  });

  it("picks the EARLIEST flagged day off when more than one is somehow marked", () => {
    const shows = [dayOff("d2", "2025-08-08", true), dayOff("d1", "2025-08-06", true)];
    expect(companyRedDate(shows)).toBe("2025-08-06");
  });
});

describe("isRedDayFor", () => {
  const shows = [show("s1", "2025-08-05"), show("s2", "2025-08-06")];
  const assigns: Assignment[] = [{ showId: "s2", role: "OFF", performer: "SAM", isRedDay: true }];

  it("falls back to the stored flag when there is no company RED day", () => {
    expect(isRedDayFor(assigns, shows, "SAM", "2025-08-06")).toBe(true);
    expect(isRedDayFor(assigns, shows, "SAM", "2025-08-05")).toBe(false);
    expect(isRedDayFor(assigns, shows, "ALEX", "2025-08-06")).toBe(false);
  });

  it("returns true only on the company RED date, for everyone, once one exists", () => {
    const withCompanyRed = [...shows, dayOff("d1", "2025-08-07", true)];

    // Covers the whole company, including ALEX who holds no stored flag.
    expect(isRedDayFor(assigns, withCompanyRed, "ALEX", "2025-08-07")).toBe(true);
    expect(isRedDayFor(assigns, withCompanyRed, "SAM", "2025-08-07")).toBe(true);

    // ...and SAM's stored Wednesday flag goes DORMANT — same assignments as the
    // test above, where it read true. Only the company RED day differs.
    expect(isRedDayFor(assigns, withCompanyRed, "SAM", "2025-08-06")).toBe(false);
    expect(isRedDayFor(assigns, withCompanyRed, "SAM", "2025-08-05")).toBe(false);
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

describe("splitByCurtain", () => {
  const at = (id: string, time: string, status: Show["status"] = "show"): Show => ({
    id,
    date: "2025-07-19",
    time,
    callTime: "13:30",
    status,
  });

  it("splits timed shows at 17:00", () => {
    expect(splitByCurtain([at("a", "15:00"), at("b", "20:00"), at("c", "18:00")])).toEqual({
      matinees: 1,
      evenings: 2,
    });
  });

  it("counts a TBC show as neither matinee nor evening", () => {
    const { matinees, evenings } = splitByCurtain([at("a", "15:00"), at("b", "20:00"), at("c", "TBC")]);
    expect(matinees).toBe(1);
    expect(evenings).toBe(1);
    // The buckets deliberately do not sum to the show count.
    expect(matinees + evenings).toBe(2);
  });

  it("counts a cleared time as neither, rather than sweeping it into evenings", () => {
    expect(splitByCurtain([at("a", "")])).toEqual({ matinees: 0, evenings: 0 });
  });

  it("ignores travel and day-off columns", () => {
    expect(splitByCurtain([at("a", "Travel", "travel"), at("b", "20:00")])).toEqual({
      matinees: 0,
      evenings: 1,
    });
  });
});
