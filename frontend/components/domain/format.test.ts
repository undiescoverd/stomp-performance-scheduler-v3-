import { describe, it, expect } from "vitest";
import { isoDate, dateRange, shortDate, splitLocation, fmtTime, sortByName } from "./format";
import type { Show } from "~backend/scheduler/types";

const show = (date: string | Date, time = "19:30"): Show =>
  ({ id: String(Math.random()), date: date as string, time, callTime: "18:00", status: "show" });

describe("isoDate", () => {
  it("passes through YYYY-MM-DD strings", () => {
    expect(isoDate("2025-08-05")).toBe("2025-08-05");
  });
  it("recovers the calendar date from a UTC-midnight Date (client dateReviver)", () => {
    expect(isoDate(new Date("2025-08-05T00:00:00.000Z"))).toBe("2025-08-05");
  });
  it("returns empty for empty input", () => {
    expect(isoDate("")).toBe("");
  });
});

describe("shortDate", () => {
  it("defaults to day/month/year", () => {
    expect(shortDate("2026-07-22")).toBe("22/07/2026");
  });
  it("renders each style", () => {
    expect(shortDate("2026-07-22", "dmy")).toBe("22/07/2026");
    expect(shortDate("2026-07-22", "mdy")).toBe("07/22/2026");
    expect(shortDate("2026-07-22", "iso")).toBe("2026-07-22");
    expect(shortDate("2026-07-22", "short")).toBe("22 Jul");
  });
  it("zero-pads single-digit days and months in the numeric styles", () => {
    expect(shortDate("2026-01-05", "dmy")).toBe("05/01/2026");
    expect(shortDate("2026-01-05", "mdy")).toBe("01/05/2026");
    expect(shortDate("2026-01-05", "iso")).toBe("2026-01-05");
  });
  it("does not pad the short style", () => {
    expect(shortDate("2026-01-05", "short")).toBe("5 Jan");
  });
});

describe("dateRange", () => {
  it("defaults to a full dmy span on both endpoints", () => {
    expect(dateRange([show("2026-08-05"), show("2026-08-10")])).toBe("05/08/2026 – 10/08/2026");
  });

  it("renders both endpoints in full under each numeric style, never eliding", () => {
    const week = [show("2026-08-05"), show("2026-08-10")];
    expect(dateRange(week, "dmy")).toBe("05/08/2026 – 10/08/2026");
    expect(dateRange(week, "mdy")).toBe("08/05/2026 – 08/10/2026");
    expect(dateRange(week, "iso")).toBe("2026-08-05 – 2026-08-10");
  });

  it("keeps the word-form elision under the short style", () => {
    expect(dateRange([show("2025-08-05"), show("2025-08-10")], "short")).toBe("Aug 5 – 10");
  });

  it("spans two months under the short style", () => {
    expect(dateRange([show("2025-07-29"), show("2025-08-03")], "short")).toBe("Jul 29 – Aug 3");
  });

  it("spells out a month-boundary span in full under a numeric style", () => {
    expect(dateRange([show("2026-07-29"), show("2026-08-03")], "dmy")).toBe("29/07/2026 – 03/08/2026");
  });

  it("says so when there are no dates", () => {
    expect(dateRange([], "dmy")).toBe("No dates");
  });
});

describe("splitLocation", () => {
  it("splits city and venue on an em dash", () => {
    expect(splitLocation("London — Ambassadors Theatre")).toEqual(["London", "Ambassadors Theatre"]);
  });
  it("returns the whole string as city when unsplit", () => {
    expect(splitLocation("Tokyo")[0]).toBe("Tokyo");
  });
});

describe("fmtTime", () => {
  it("formats 24h to 12h", () => {
    expect(fmtTime("19:30")).toBe("7:30 PM");
    expect(fmtTime("14:00")).toBe("2:00 PM");
  });
  it("passes through TBC", () => {
    expect(fmtTime("TBC")).toBe("TBC");
  });
  it("renders a cleared time as TBC, never as blank", () => {
    expect(fmtTime("")).toBe("TBC");
  });
});

describe("sortByName", () => {
  const items = [{ name: "Sean" }, { name: "adam" }, { name: "Cade" }];

  it("sorts ascending by default", () => {
    expect(sortByName(items).map((i) => i.name)).toEqual(["adam", "Cade", "Sean"]);
  });

  it("sorts descending when asked", () => {
    expect(sortByName(items, "desc").map((i) => i.name)).toEqual(["Sean", "Cade", "adam"]);
  });

  it("does not mutate the input array", () => {
    const original = [...items];
    sortByName(items, "desc");
    expect(items).toEqual(original);
  });

  it("returns an empty array unchanged", () => {
    expect(sortByName([])).toEqual([]);
  });
});
