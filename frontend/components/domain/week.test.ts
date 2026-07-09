import { describe, it, expect } from "vitest";
import { addDaysIso, getDefaultShowTimes, nextShow, resetShowTimes, showsOnDate, sortShows } from "./week";
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
