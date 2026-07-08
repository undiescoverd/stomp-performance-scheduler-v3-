import { describe, it, expect } from "vitest";
import { areDatesConsecutive, dayDiff } from "./date_rules";

describe("date_rules", () => {
  describe("areDatesConsecutive", () => {
    it("treats adjacent dates as consecutive (Tue + Wed)", () => {
      // 2024-01-02 is a Tuesday, 2024-01-03 a Wednesday
      expect(areDatesConsecutive("2024-01-02", "2024-01-03")).toBe(true);
    });

    it("treats the same date as consecutive (Sat matinee + Sat evening)", () => {
      expect(areDatesConsecutive("2024-01-06", "2024-01-06")).toBe(true);
    });

    it("treats a gap day as NOT consecutive (Tue + Thu, Wed off)", () => {
      // Regression for the old `daysDiff <= 2` bug: a full day with no show
      // must reset the run.
      expect(areDatesConsecutive("2024-01-02", "2024-01-04")).toBe(false);
    });

    it("is order-independent", () => {
      expect(areDatesConsecutive("2024-01-04", "2024-01-02")).toBe(false);
      expect(areDatesConsecutive("2024-01-03", "2024-01-02")).toBe(true);
    });

    it("ignores time-of-day — Sun evening + Tue is not consecutive", () => {
      // Dates only: Sunday 2024-01-07 to Tuesday 2024-01-09 is a 2-day gap
      // regardless of the shows' times.
      expect(areDatesConsecutive("2024-01-07", "2024-01-09")).toBe(false);
    });
  });

  describe("dayDiff", () => {
    it("returns whole-day differences", () => {
      expect(dayDiff("2024-01-02", "2024-01-03")).toBe(1);
      expect(dayDiff("2024-01-02", "2024-01-02")).toBe(0);
      expect(dayDiff("2024-01-02", "2024-01-04")).toBe(2);
    });

    it("is unaffected by DST boundaries (spring forward)", () => {
      // US DST 2024 begins 2024-03-10; a naive local-time diff can be off by
      // an hour and round wrong. Noon-UTC anchoring keeps this exact.
      expect(dayDiff("2024-03-09", "2024-03-11")).toBe(2);
    });
  });
});
