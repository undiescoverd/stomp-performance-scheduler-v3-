import { describe, it, expect } from "vitest";
import { clampToRange } from "./number";

describe("clampToRange", () => {
  it("returns the fallback for an empty field, so it can be cleared mid-edit", () => {
    expect(clampToRange("", 1, 12, 1)).toBe(1);
  });

  it("returns the fallback for whitespace", () => {
    expect(clampToRange("   ", 1, 12, 1)).toBe(1);
  });

  it("clamps below-range up to min", () => {
    expect(clampToRange("0", 1, 12, 1)).toBe(1);
    expect(clampToRange("-5", 1, 12, 1)).toBe(1);
  });

  it("clamps above-range down to max", () => {
    expect(clampToRange("99", 1, 12, 1)).toBe(12);
  });

  it("passes an in-range value through", () => {
    expect(clampToRange("12", 1, 12, 1)).toBe(12);
    expect(clampToRange("7", 1, 12, 1)).toBe(7);
  });

  it("returns the fallback for non-numeric input", () => {
    expect(clampToRange("abc", 1, 12, 1)).toBe(1);
  });

  it("does not clamp a partial entry on the way to a larger one", () => {
    // "1" is a legal value en route to "12"; it must survive as 1, not snap.
    expect(clampToRange("1", 1, 12, 1)).toBe(1);
  });
});
