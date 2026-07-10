import { describe, it, expect, vi } from 'vitest';

// `api(options, fn)` is a passthrough (`return fn`), but importing "encore.dev/api" pulls
// in `currentRequest` from encore.dev/mod, which loads the native runtime and throws
// without ENCORE_RUNTIME_LIB. The functions under test are pure and never call api(), so
// stub the module rather than boot Encore to test a sort.
vi.mock('encore.dev/api', () => ({ api: (_options: unknown, fn: unknown) => fn }));

import { analyzeConsecutiveShows, getConsecutiveShowSuggestions, toPublicAnalysis } from './validate_comprehensive';
import type { Assignment, Show } from './types';

// The two helpers under test take `formatDateForDisplay` and `getAlternativePerformers`
// as parameters — inside the API handler they are closures over the request. These are
// faithful copies, so a test exercises the same strings production builds.
function formatDateForDisplay(date: string, time: string): string {
  const dateObj = new Date(date + "T12:00:00Z");
  const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  if (!/^\d{2}:\d{2}$/.test(time)) return `${dayName} ${monthDay} TBC`;
  const [hours, minutes] = time.split(':');
  const timeObj = new Date();
  timeObj.setHours(parseInt(hours), parseInt(minutes));
  const timeStr = timeObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dayName} ${monthDay} ${timeStr}`;
}

const castMembers = [
  { name: "ALICE", eligibleRoles: ["Sarge"] },
  { name: "BOB", eligibleRoles: ["Sarge", "Potato"] },
  { name: "CARA", eligibleRoles: ["Sarge", "Potato"] },
];

const makeGetAlternativePerformers = (assignments: Assignment[]) =>
  (role: string, excludePerformer?: string, showId?: string): string[] => {
    const showAssignments = showId ? assignments.filter(a => a.showId === showId) : [];
    const assignedPerformers = new Set(showAssignments.map(a => a.performer));
    return castMembers
      .filter(m =>
        m.eligibleRoles.includes(role) &&
        m.name !== excludePerformer &&
        (!showId || !assignedPerformers.has(m.name)))
      .map(m => m.name);
  };

const show = (id: string, date: string, time = "19:30"): Show =>
  ({ id, date, time, callTime: "18:00", status: "show" });

const cast = (showId: string, performer: string, role: string): Assignment =>
  ({ showId, performer, role: role as any, isRedDay: false });

// ALICE plays seven consecutive dates — a critical burnout run (count > 6).
// "decoy" sits INSIDE that date window but belongs to BOB, so it is in `activeShows`
// and absent from ALICE's showIds. Without it, this suite could not tell the showIds
// fix apart from a merely date-corrected window filter.
const DATES = ["2025-08-04", "2025-08-05", "2025-08-06", "2025-08-07", "2025-08-08", "2025-08-09", "2025-08-10"];
const aliceShows = DATES.map((d, i) => show(`d${i}`, d));
const decoy = show("decoy", "2025-08-07", "14:00");

const activeShows: Show[] = [...aliceShows, decoy];
const assignments: Assignment[] = [
  ...aliceShows.map(s => cast(s.id, "ALICE", "Sarge")),
  cast("decoy", "BOB", "Potato"),
];

const analyseAlice = (shows = activeShows, asgn = assignments) => {
  const analysis = analyzeConsecutiveShows(
    asgn, shows, castMembers, formatDateForDisplay, makeGetAlternativePerformers(asgn),
  );
  return analysis.find(a => a.performer === "ALICE")!;
};

const suggestFor = (sequence: any, asgn = assignments, shows = activeShows) =>
  getConsecutiveShowSuggestions(
    "ALICE", sequence, asgn, shows, formatDateForDisplay, makeGetAlternativePerformers(asgn),
  );

describe('analyzeConsecutiveShows', () => {
  it('finds ALICE\'s seven-show run and marks it critical', () => {
    const alice = analyseAlice();
    expect(alice.maxConsecutive).toBe(7);
    expect(alice.sequences).toHaveLength(1);
    expect(alice.sequences[0].count).toBe(7);
    expect(alice.sequences[0].severity).toBe("critical");
  });

  it('carries the run\'s showIds through, one per counted show', () => {
    const seq = analyseAlice().sequences[0] as any;
    expect(seq.showIds).toEqual(["d0", "d1", "d2", "d3", "d4", "d5", "d6"]);
    expect(seq.showIds).toHaveLength(seq.count);
  });

  it('excludes the decoy show — it belongs to BOB, not ALICE', () => {
    const seq = analyseAlice().sequences[0] as any;
    expect(seq.showIds).not.toContain("decoy");
  });
});

// A performer marked OFF is not performing. Counting an OFF show toward a burnout run
// inflates `count`, and `count > 6` is the only gate that marks a run critical — so an
// OFF show could manufacture a false critical. algorithm.ts:1748 and the frontend's
// analyzeFatigue (logic.ts:82) both exclude OFF; this module used not to.
describe('analyzeConsecutiveShows and OFF days', () => {
  // ALICE plays 6 of the 7 dates and sits out the middle one.
  const offAssignments: Assignment[] = [
    ...aliceShows.filter(s => s.id !== "d3").map(s => cast(s.id, "ALICE", "Sarge")),
    cast("d3", "ALICE", "OFF"),
    cast("decoy", "BOB", "Potato"),
  ];

  it('breaks the run in two — an OFF day is a day performing zero shows', () => {
    const alice = analyseAlice(activeShows, offAssignments);
    // Aug 4-6, then nothing on Aug 7, then Aug 8-10. Per date_rules, a day with no
    // performance resets the run; it does not merely go uncounted. Previously the run
    // was chained straight through the day off, giving maxConsecutive 7.
    expect(alice.maxConsecutive).toBe(3);
    expect(alice.sequences.map(s => s.count)).toEqual([3, 3]);
  });

  it('does not manufacture a critical run out of an OFF day', () => {
    const alice = analyseAlice(activeShows, offAssignments);
    // 6 consecutive shows is legal; only 7+ is a burnout violation.
    expect(alice.sequences.every(s => s.severity !== "critical")).toBe(true);
  });

  it('never suggests replacing a performer in a role they are OFF for', () => {
    const alice = analyseAlice(activeShows, offAssignments);
    const seq = alice.sequences[0] as any;
    expect(seq.showIds).not.toContain("d3");
    expect(suggestFor(seq, offAssignments)).not.toContain("for OFF");
  });
});

describe('toPublicAnalysis', () => {
  // TypeScript cannot catch a missing strip here: the internal type is structurally
  // assignable to the public one. Only this test stands between showIds and the wire.
  it('keeps showIds out of the API response', () => {
    const published = toPublicAnalysis(analyzeConsecutiveShows(
      assignments, activeShows, castMembers, formatDateForDisplay, makeGetAlternativePerformers(assignments),
    ));
    const sequences = published.flatMap(a => a.sequences);
    expect(sequences.length).toBeGreaterThan(0);
    for (const seq of sequences) {
      expect(Object.keys(seq).sort()).toEqual(["count", "endDate", "severity", "startDate"]);
    }
  });

  it('leaves every other field untouched', () => {
    const internal = analyzeConsecutiveShows(
      assignments, activeShows, castMembers, formatDateForDisplay, makeGetAlternativePerformers(assignments),
    );
    const alice = toPublicAnalysis(internal).find(a => a.performer === "ALICE")!;
    expect(alice.maxConsecutive).toBe(7);
    expect(alice.sequences[0]).toEqual({
      startDate: "Mon Aug 4 7:30 PM",
      endDate: "Sun Aug 10 7:30 PM",
      count: 7,
      severity: "critical",
    });
  });
});

describe('getConsecutiveShowSuggestions', () => {
  it('names a replacement performer, role and date — not the generic fallback', () => {
    const suggestion = suggestFor(analyseAlice().sequences[0]);
    expect(suggestion).toMatch(/^Replace ALICE with (BOB|CARA) for Sarge on .+/);
    expect(suggestion).not.toContain("Give ALICE a break");
  });

  it('suggests a show ALICE is actually in — the middle of her own run', () => {
    const suggestion = suggestFor(analyseAlice().sequences[0]);
    // Middle of d0..d6 is d3 = Thu 7 Aug. The decoy (also 7 Aug, 2:00 PM) is BOB's.
    expect(suggestion).toContain("Thu Aug 7 7:30 PM");
    expect(suggestion).not.toContain("2:00 PM");
  });

  it('does not parse the sequence\'s display dates — V8 reads them as the year 2001', () => {
    const seq = analyseAlice().sequences[0];
    // This is the trap the old implementation fell into. Not an Invalid Date: a
    // silently wrong one, 24 years early, so its window matched zero shows.
    expect(seq.startDate).toBe("Mon Aug 4 7:30 PM");
    expect(new Date(seq.startDate).getFullYear()).toBe(2001);
    // The suggestion is nonetheless correct, because it never touches these strings.
    expect(suggestFor(seq)).toMatch(/^Replace ALICE with/);
  });

  it('counts a TBC show in the run and can name it', () => {
    const shows = activeShows.map(s => (s.id === "d3" ? { ...s, time: "TBC" } : s));
    const alice = analyseAlice(shows);
    expect(alice.sequences[0].count).toBe(7);
    expect(suggestFor(alice.sequences[0], assignments, shows)).toContain("Thu Aug 7 TBC");
  });
});
