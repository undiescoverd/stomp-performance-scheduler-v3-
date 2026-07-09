import { describe, it, expect } from "vitest";
import { isoDate, dateRange, splitLocation, fmtTime } from "./format";
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

describe("dateRange", () => {
  it("collapses a same-month span", () => {
    expect(dateRange([show("2025-08-05"), show("2025-08-10")])).toBe("Aug 5 – 10");
  });
  it("spans two months", () => {
    expect(dateRange([show("2025-07-29"), show("2025-08-03")])).toBe("Jul 29 – Aug 3");
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
