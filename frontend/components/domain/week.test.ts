import { describe, it, expect } from "vitest";
import {
  addDaysIso,
  addShowToDate,
  applyShowStatus,
  citySegments,
  columnsForWeek,
  getDefaultShowTimes,
  mondayOf,
  nextMondayFrom,
  nextShow,
  resetShowTimes,
  restoreDate,
  setCompanyRedDay,
  setDestination,
  showsOnDate,
  sortShows,
  timeIsFree,
  weekFrame,
  weekStartOf,
} from "./week";
import type { Show } from "~backend/scheduler/types";

const show = (date: string, time: string, callTime = "18:00", status: Show["status"] = "show"): Show => ({
  id: `${date}-${time}`,
  date,
  time,
  callTime,
  status,
});

// The editor's standard week: Tue–Sun, matinee + evening on Sat and Sun.
// Mon 2025-07-14 is a Monday, so Tue is the 15th.
const standardWeek = (): Show[] => [
  show("2025-07-15", "20:00", "17:00"), // Tue
  show("2025-07-16", "20:00"), // Wed
  show("2025-07-17", "20:00"), // Thu
  show("2025-07-18", "20:00"), // Fri
  show("2025-07-19", "15:00", "13:30"), // Sat matinee
  show("2025-07-19", "20:00"), // Sat evening
  show("2025-07-20", "15:00", "13:30"), // Sun matinee
  show("2025-07-20", "18:00", "16:30"), // Sun evening
];

// A tour-generated week: Mon–Sat at 19:30, matinee on Wed and Sat. Deliberately
// unlike the editor's standard week.
const tourWeek = (): Show[] => [
  show("2025-03-03", "19:30", "18:30"), // Mon
  show("2025-03-04", "19:30", "18:30"), // Tue
  show("2025-03-05", "14:30", "13:30"), // Wed matinee
  show("2025-03-05", "19:30", "18:30"), // Wed evening
  show("2025-03-06", "19:30", "18:30"), // Thu
  show("2025-03-07", "19:30", "18:30"), // Fri
  show("2025-03-08", "14:30", "13:30"), // Sat matinee
  show("2025-03-08", "19:30", "18:30"), // Sat evening
];

const without = (shows: Show[], date: string, time?: string) =>
  shows.filter((s) => !(s.date === date && (time === undefined || s.time === time)));

describe("addDaysIso", () => {
  it("crosses a month boundary", () => {
    expect(addDaysIso("2025-07-31", 1)).toBe("2025-08-01");
  });
  it("does not drift across a DST transition", () => {
    // 30 Mar 2025 is the UK spring-forward; a naive local-time add loses an hour.
    expect(addDaysIso("2025-03-29", 1)).toBe("2025-03-30");
    expect(addDaysIso("2025-03-30", 1)).toBe("2025-03-31");
  });
});

describe("getDefaultShowTimes", () => {
  it("gives Tuesday a 5pm call", () => {
    expect(getDefaultShowTimes("2025-07-15")).toEqual({ time: "20:00", callTime: "17:00" });
  });
  it("distinguishes the Saturday matinee from the evening by occurrence", () => {
    expect(getDefaultShowTimes("2025-07-19", 0)).toEqual({ time: "15:00", callTime: "13:30" });
    expect(getDefaultShowTimes("2025-07-19", 1)).toEqual({ time: "20:00", callTime: "18:00" });
  });
  it("gives Sunday a 6pm evening, not 8pm", () => {
    expect(getDefaultShowTimes("2025-07-20", 1)).toEqual({ time: "18:00", callTime: "16:30" });
  });
});

describe("resetShowTimes", () => {
  it("keeps a two-show day's matinee and evening distinct", () => {
    // Regression: keying only on the date returned the matinee for both Saturday
    // columns, silently turning the 8pm into a second 3pm.
    const reset = resetShowTimes(standardWeek());
    const sat = showsOnDate(reset, "2025-07-19").map((s) => s.time);
    expect(sat).toEqual(["15:00", "20:00"]);
    const sun = showsOnDate(reset, "2025-07-20").map((s) => s.time);
    expect(sun).toEqual(["15:00", "18:00"]);
  });

  it("keeps a two-show Wednesday's matinee and evening distinct", () => {
    // Regression: backend-generated tour weeks put a matinee + evening on
    // Wednesday, but the Wednesday branch ignored `occurrence`, collapsing
    // both onto the same 20:00 — the exact collision timeIsFree exists to stop.
    const week = standardWeek();
    // 2025-07-16 is the Wednesday of the standard test week.
    week.push({ id: "wm", date: "2025-07-16", time: "14:30", callTime: "13:30", status: "show" });
    const reset = resetShowTimes(sortShows(week));
    const wed = showsOnDate(reset, "2025-07-16").map((s) => s.time);
    expect(wed).toEqual(["15:00", "20:00"]);
  });

  it("still resets a single-show Wednesday to its evening slot", () => {
    const reset = resetShowTimes(standardWeek());
    const wed = showsOnDate(reset, "2025-07-16").map((s) => s.time);
    expect(wed).toEqual(["20:00"]);
  });

  it("leaves travel and day-off columns alone", () => {
    // Regression: it used to force every column back to status "show", wiping a
    // travel day on a button labelled "Reset Times".
    const week = standardWeek();
    week[1] = { ...week[1], status: "travel", time: "Travel", callTime: "Travel" };
    week[2] = { ...week[2], status: "dayoff" };
    const reset = resetShowTimes(week);
    expect(reset[1]).toEqual(week[1]);
    expect(reset[2]).toEqual(week[2]);
    expect(reset[0].time).toBe("20:00");
  });
});

describe("sortShows", () => {
  it("orders chronologically, matinee before evening", () => {
    const scrambled = [standardWeek()[5], standardWeek()[0], standardWeek()[4]];
    expect(sortShows(scrambled).map((s) => `${s.date} ${s.time}`)).toEqual([
      "2025-07-15 20:00",
      "2025-07-19 15:00",
      "2025-07-19 20:00",
    ]);
  });

  it("parks a travel column at the end of its own date", () => {
    const travel = show("2025-07-19", "Travel", "Travel", "travel");
    const sorted = sortShows([travel, standardWeek()[4]]);
    expect(sorted.map((s) => s.time)).toEqual(["15:00", "Travel"]);
  });

  it("parks a TBC show at the end of its own date, not the end of the week", () => {
    const tbc = show("2025-07-17", "TBC", "TBC");
    const sorted = sortShows([tbc, ...standardWeek()]);
    expect(sorted.map((s) => `${s.date} ${s.time}`)).toEqual([
      "2025-07-15 20:00",
      "2025-07-16 20:00",
      "2025-07-17 20:00",
      "2025-07-17 TBC",
      "2025-07-18 20:00",
      "2025-07-19 15:00",
      "2025-07-19 20:00",
      "2025-07-20 15:00",
      "2025-07-20 18:00",
    ]);
  });
});

describe("nextShow", () => {
  const baseline = standardWeek();

  it("restores a removed middle day", () => {
    const current = without(baseline, "2025-07-17"); // Thu
    expect(nextShow(baseline, current)).toMatchObject({
      date: "2025-07-17",
      time: "20:00",
      callTime: "18:00",
      status: "show",
    });
  });

  it("restores the first day of the week rather than appending past the end", () => {
    // Regression: gap-scanning only inside [firstShow, lastShow] skipped a
    // removed Tuesday and appended the following Monday, on a date the grid
    // gives no way to edit.
    const current = without(baseline, "2025-07-15"); // Tue
    expect(nextShow(baseline, current)).toMatchObject({ date: "2025-07-15", time: "20:00", callTime: "17:00" });
  });

  it("restores a removed matinee, not a second evening", () => {
    // Regression: choosing the slot by count handed back occurrence 1 (evening)
    // because one Saturday show remained, producing two 8pm Saturdays.
    const current = without(baseline, "2025-07-19", "15:00");
    expect(nextShow(baseline, current)).toMatchObject({ date: "2025-07-19", time: "15:00", callTime: "13:30" });
  });

  it("restores a removed evening when the matinee remains", () => {
    const current = without(baseline, "2025-07-19", "20:00");
    expect(nextShow(baseline, current)).toMatchObject({ date: "2025-07-19", time: "20:00" });
  });

  it("takes the earliest missing slot when several are gone", () => {
    const current = without(without(baseline, "2025-07-18"), "2025-07-16"); // Fri and Wed
    expect(nextShow(baseline, current)).toMatchObject({ date: "2025-07-16" });
  });

  it("extends the week past its last day once the baseline is whole", () => {
    const next = nextShow(baseline, baseline);
    expect(next).toMatchObject({ date: "2025-07-21", status: "show" }); // the Monday after
  });

  it("restores a tour week's own times, not the editor's standard ones", () => {
    // A Mon–Sat tour week has its Wednesday matinee at 14:30. Reasoning from an
    // assumed Tue–Sun standard week would append a Sunday show instead.
    const tour = tourWeek();
    const current = without(tour, "2025-03-05", "14:30");
    expect(nextShow(tour, current)).toMatchObject({ date: "2025-03-05", time: "14:30", callTime: "13:30" });
  });

  it("restores a tour week's Monday, which the standard week has no slot for", () => {
    const tour = tourWeek();
    const current = without(tour, "2025-03-03");
    expect(nextShow(tour, current)).toMatchObject({ date: "2025-03-03", time: "19:30" });
  });

  it("does not hand back the removed show's id", () => {
    const current = without(baseline, "2025-07-17");
    expect(nextShow(baseline, current)).not.toHaveProperty("id");
  });

  it("seeds from today when there is no baseline and no shows", () => {
    expect(nextShow([], [], new Date("2025-07-17T00:00:00Z"))).toMatchObject({
      date: "2025-07-17",
      status: "show",
    });
  });

  it("restores a removed travel day as a travel day", () => {
    const week = standardWeek();
    week[1] = { ...week[1], status: "travel", time: "Travel", callTime: "Travel" };
    const current = without(week, "2025-07-16");
    expect(nextShow(week, current)).toMatchObject({ date: "2025-07-16", status: "travel" });
  });
});

const located = (s: Show, location?: string): Show => ({ ...s, location });

/** Mon travel, double Tue, Wed travel to a new city, Thu, double Fri, double Sat. */
const splitWeek = (): Show[] => [
  located(show("2025-07-14", "Travel", "Travel", "travel"), "Toulouse"),
  located(show("2025-07-15", "15:00", "13:30"), "Toulouse"),
  located(show("2025-07-15", "20:00"), "Toulouse"),
  located(show("2025-07-16", "Travel", "Travel", "travel"), "Toulouse"),
  located(show("2025-07-17", "20:00"), "Merignac"),
  located(show("2025-07-18", "15:00", "13:30"), "Merignac"),
  located(show("2025-07-18", "20:00"), "Merignac"),
];

describe("addShowToDate", () => {
  it("gives an evening-only day its matinee", () => {
    const week = [show("2025-07-17", "20:00")];
    expect(addShowToDate(week, "2025-07-17")).toMatchObject({ time: "15:00", callTime: "13:30" });
  });

  it("gives a matinee-only day its evening", () => {
    const week = [show("2025-07-19", "15:00", "13:30")];
    expect(addShowToDate(week, "2025-07-19")).toMatchObject({ time: "20:00", callTime: "18:00" });
  });

  it("never collides with the time already on the day", () => {
    const week = [show("2025-07-17", "20:00")];
    const added = addShowToDate(week, "2025-07-17")!;
    expect(added.time).not.toBe(week[0].time);
  });

  it("refuses a day that is already a double", () => {
    const week = [show("2025-07-19", "15:00", "13:30"), show("2025-07-19", "20:00")];
    expect(addShowToDate(week, "2025-07-19")).toBeNull();
  });

  it("refuses a travel day and a day off", () => {
    const travel = [show("2025-07-14", "Travel", "Travel", "travel")];
    const off = [show("2025-07-20", "", "", "dayoff")];
    expect(addShowToDate(travel, "2025-07-14")).toBeNull();
    expect(addShowToDate(off, "2025-07-20")).toBeNull();
  });

  it("inherits the city of the show already on that day", () => {
    const week = [located(show("2025-07-17", "20:00"), "Merignac")];
    expect(addShowToDate(week, "2025-07-17")).toMatchObject({ location: "Merignac" });
  });

  it("returns no id — the caller mints one", () => {
    const week = [show("2025-07-17", "20:00")];
    expect(addShowToDate(week, "2025-07-17")).not.toHaveProperty("id");
  });
});

describe("timeIsFree", () => {
  it("rejects a time already taken by the other show that day", () => {
    const week = [show("2025-07-19", "15:00", "13:30"), show("2025-07-19", "20:00")];
    expect(timeIsFree(week, week[0].id, "20:00")).toBe(false);
  });

  it("allows a time used on a different date", () => {
    const week = [show("2025-07-18", "20:00"), show("2025-07-19", "15:00", "13:30")];
    expect(timeIsFree(week, week[1].id, "20:00")).toBe(true);
  });

  it("allows a show to keep its own time", () => {
    const week = [show("2025-07-19", "15:00", "13:30"), show("2025-07-19", "20:00")];
    expect(timeIsFree(week, week[0].id, "15:00")).toBe(true);
  });

  it("never collides on TBC — a day can hold two shows whose times are both unset", () => {
    const week = [show("2025-07-19", "TBC", "TBC"), show("2025-07-19", "20:00")];
    expect(timeIsFree(week, week[1].id, "TBC")).toBe(true);
  });

  it("treats a cleared time as TBC rather than a collision", () => {
    const week = [show("2025-07-19", "TBC", "TBC"), show("2025-07-19", "20:00")];
    expect(timeIsFree(week, week[1].id, "")).toBe(true);
  });
});

/** The columns the grid would render for a week, frame and all. */
const cols = (shows: Show[]) => columnsForWeek(shows, weekStartOf(shows)!);

describe("weekStartOf", () => {
  it("snaps the earliest show back to its Monday", () => {
    expect(weekStartOf(standardWeek())).toBe("2025-07-14");
  });

  it("uses the earliest date, not the first element", () => {
    const jumbled = [show("2025-07-19", "20:00"), show("2025-07-15", "20:00")];
    expect(weekStartOf(jumbled)).toBe("2025-07-14");
  });

  it("treats a Sunday as the end of its week, not the start", () => {
    expect(weekStartOf([show("2025-07-20", "20:00")])).toBe("2025-07-14");
  });

  it("has no week without shows", () => {
    expect(weekStartOf([])).toBeNull();
  });
});

describe("weekFrame / columnsForWeek", () => {
  it("always shows seven days", () => {
    expect(weekFrame(standardWeek(), "2025-07-14")).toHaveLength(7);
  });

  it("keeps an empty column for a day with no shows", () => {
    const week = standardWeek(); // Tue-Sun, so Monday is empty
    const columns = cols(week);
    expect(columns).toHaveLength(9); // 8 shows + the empty Monday
    expect(columns[0]).toEqual({ date: "2025-07-14", show: null });
  });

  it("gives a double-show day two columns", () => {
    const sat = cols(standardWeek()).filter((c) => c.date === "2025-07-19");
    expect(sat).toHaveLength(2);
  });

  it("extends past Sunday rather than hiding a show", () => {
    const week = [...standardWeek(), show("2025-07-21", "20:00")]; // the next Monday
    expect(weekFrame(week, "2025-07-14")).toContain("2025-07-21");
  });
});

describe("citySegments", () => {
  it("spans the whole week when no column names a city", () => {
    expect(citySegments(cols(standardWeek()), "London")).toEqual([{ city: "London", span: 9 }]);
  });

  it("falls back to the schedule's city for columns without one", () => {
    const week = [show("2025-07-17", "20:00"), located(show("2025-07-18", "20:00"), "Leeds")];
    const segments = citySegments(cols(week), "London");
    // Mon-Wed are empty and fill backwards from Thursday, which has no city.
    expect(segments.map((s) => s.city)).toEqual(["London", "Leeds"]);
    expect(segments.at(-1)).toEqual({ city: "Leeds", span: 3 }); // Fri + empty Sat + empty Sun
  });

  it("puts the divider immediately after the travel day being left", () => {
    // Toulouse covers Mon travel + both Tue shows + Wed travel = 4 columns.
    expect(citySegments(cols(splitWeek()), "-")).toEqual([
      { city: "Toulouse", span: 4 },
      { city: "Merignac", span: 5 },
    ]);
  });

  it("treats a blank location as absent rather than as its own segment", () => {
    const week = [located(show("2025-07-17", "20:00"), "   "), show("2025-07-18", "20:00")];
    expect(citySegments(cols(week), "London")).toEqual([{ city: "London", span: 7 }]);
  });
});

describe("resolveCities: an emptied day keeps its side of the divider", () => {
  const withoutDate = (week: Show[], date: string) => week.filter((s) => s.date !== date);

  it("keeps a removed day in the city that follows it", () => {
    // Thursday belongs to Merignac. Removing it must not drag it into Toulouse.
    const week = withoutDate(splitWeek(), "2025-07-17");
    expect(citySegments(cols(week), "-")).toEqual([
      { city: "Toulouse", span: 4 },
      { city: "Merignac", span: 5 },
    ]);
  });

  it("keeps a removed day in the city that precedes it when nothing follows", () => {
    const week = withoutDate(splitWeek(), "2025-07-18");
    expect(citySegments(cols(week), "-")).toEqual([
      { city: "Toulouse", span: 4 },
      { city: "Merignac", span: 4 },
    ]);
  });

  it("moves the divider onto the travel column when the travel day is removed", () => {
    const week = withoutDate(splitWeek(), "2025-07-16");
    expect(citySegments(cols(week), "-")).toEqual([
      { city: "Toulouse", span: 3 },
      { city: "Merignac", span: 6 },
    ]);
  });
});

describe("restoreDate", () => {
  it("brings back the slot the week opened with", () => {
    const baseline = standardWeek();
    expect(restoreDate(baseline, "2025-07-19")).toMatchObject({ time: "15:00", callTime: "13:30" });
  });

  it("brings back a travel day as a travel day", () => {
    const baseline = splitWeek();
    expect(restoreDate(baseline, "2025-07-16")).toMatchObject({ status: "travel" });
  });

  it("defaults a date the baseline never had", () => {
    expect(restoreDate(standardWeek(), "2025-07-14")).toMatchObject({ status: "show", time: "20:00" });
  });

  it("returns no id — the caller mints one", () => {
    expect(restoreDate(standardWeek(), "2025-07-19")).not.toHaveProperty("id");
  });
});

describe("setDestination", () => {
  it("writes the city onto every column after the travel day", () => {
    const week = splitWeek();
    const travelWed = week[3];
    const out = setDestination(week, travelWed.id, "Bordeaux");
    expect(citySegments(cols(out), "-")).toEqual([
      { city: "Toulouse", span: 4 },
      { city: "Bordeaux", span: 5 },
    ]);
  });

  it("leaves the travel day itself with the city it is leaving", () => {
    const week = splitWeek();
    const out = setDestination(week, week[3].id, "Bordeaux");
    expect(out.find((s) => s.id === week[3].id)!.location).toBe("Toulouse");
  });

  it("stops at the next travel day, which belongs to the city it leaves", () => {
    const week = [
      located(show("2025-07-14", "Travel", "Travel", "travel"), "A"),
      located(show("2025-07-15", "20:00"), "B"),
      located(show("2025-07-16", "Travel", "Travel", "travel"), "B"),
      located(show("2025-07-17", "20:00"), "C"),
    ];
    const out = setDestination(week, week[0].id, "NEW");
    expect(out.map((s) => s.location)).toEqual(["A", "NEW", "NEW", "C"]);
  });

  it("ignores a show id that is not a travel day", () => {
    const week = splitWeek();
    expect(setDestination(week, week[1].id, "Nowhere")).toBe(week);
  });
});

describe("applyShowStatus", () => {
  it("auto-nominates the week's first day off as the company RED day", () => {
    const week = standardWeek();
    const out = applyShowStatus(week, week[1].id, "dayoff"); // Wed -> dayoff
    expect(out.find((s) => s.id === week[1].id)!.isCompanyRedDay).toBe(true);
  });

  it("leaves a second day off unmarked once one is already nominated", () => {
    let week = applyShowStatus(standardWeek(), standardWeek()[1].id, "dayoff"); // Wed
    week = applyShowStatus(week, week[2].id, "dayoff"); // Thu, second dayoff
    expect(week.find((s) => s.id === week[1].id)!.isCompanyRedDay).toBe(true);
    expect(week.find((s) => s.id === week[2].id)!.isCompanyRedDay).toBeFalsy();
  });

  it("drops the flag when a nominated day off leaves dayoff status, and it never resurrects", () => {
    let week = applyShowStatus(standardWeek(), standardWeek()[1].id, "dayoff"); // Wed, auto-nominated
    week = applyShowStatus(week, week[1].id, "show"); // Wed becomes a show again
    expect(week.find((s) => s.id === week[1].id)!.isCompanyRedDay).toBeFalsy();

    // Sending it back to dayoff does not resurrect the old nomination — it
    // re-evaluates as a fresh dayoff (auto-marks again only because nothing
    // else in the week currently holds the flag).
    week = applyShowStatus(week, week[1].id, "dayoff");
    expect(week.find((s) => s.id === week[1].id)!.isCompanyRedDay).toBe(true);
  });

  it("does not touch isCompanyRedDay when the new status is not dayoff and none is set", () => {
    const week = applyShowStatus(standardWeek(), standardWeek()[0].id, "travel");
    expect(week.find((s) => s.id === week[0].id)!.isCompanyRedDay).toBeFalsy();
  });
});

describe("setCompanyRedDay", () => {
  const twoDaysOffWeek = (): Show[] => [
    { ...show("2025-07-15", "00:00", "00:00", "dayoff"), isCompanyRedDay: true }, // Tue, already nominated
    show("2025-07-16", "20:00"), // Wed
    { ...show("2025-07-17", "00:00", "00:00", "dayoff") }, // Thu
  ];

  it("nominating one day off clears any other — at most one at a time", () => {
    const week = twoDaysOffWeek();
    const out = setCompanyRedDay(week, week[2].id, true); // nominate Thu
    expect(out.find((s) => s.id === week[0].id)!.isCompanyRedDay).toBe(false);
    expect(out.find((s) => s.id === week[2].id)!.isCompanyRedDay).toBe(true);
  });

  it("un-nominating leaves no day off flagged", () => {
    const week = twoDaysOffWeek();
    const out = setCompanyRedDay(week, week[0].id, false);
    expect(out.some((s) => s.isCompanyRedDay)).toBe(false);
  });

  it("ignores a show id that is not a day off, and doesn't clear an existing nomination as a side effect", () => {
    const week = twoDaysOffWeek();
    expect(setCompanyRedDay(week, week[1].id, true)).toBe(week); // Wed is a show day
  });
});

describe("nextMondayFrom", () => {
  it("returns a Monday unchanged, so an already-valid start date is not pushed a week out", () => {
    expect(nextMondayFrom("2026-07-06")).toBe("2026-07-06");
  });

  it("advances a Friday to the following Monday", () => {
    expect(nextMondayFrom("2026-07-10")).toBe("2026-07-13");
  });

  it("advances a Sunday by a single day, not by a week", () => {
    expect(nextMondayFrom("2026-07-12")).toBe("2026-07-13");
  });

  it("crosses a year boundary", () => {
    expect(nextMondayFrom("2026-12-31")).toBe("2027-01-04");
  });

  it("agrees with mondayOf on a Monday, and never precedes its input", () => {
    for (const d of ["2026-07-06", "2026-07-07", "2026-07-11", "2026-07-12"]) {
      expect(nextMondayFrom(d) >= d).toBe(true);
    }
    expect(nextMondayFrom("2026-07-06")).toBe(mondayOf("2026-07-06"));
  });
});
