import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Show, Assignment, CastMember, Role } from "~backend/scheduler/types";

const autoTableCalls: any[] = [];

vi.mock("jspdf", () => ({
  default: class {
    setFontSize() {}
    setFont() {}
    setTextColor() {}
    setDrawColor() {}
    setLineWidth() {}
    line() {}
    text() {}
    save() {}
    getNumberOfPages() {
      return 1;
    }
    setPage() {}
    internal = { pageSize: { width: 297, height: 210 }, getNumberOfPages: () => 1 };
    lastAutoTable = { finalY: 100 };
  },
}));

vi.mock("jspdf-autotable", () => ({
  default: (_doc: unknown, opts: any) => {
    autoTableCalls.push(opts);
  },
}));

const { SchedulePDFExporter } = await import("./pdfExport");

const roles: Role[] = ["Sarge"];
const castMembers: CastMember[] = [{ name: "ALEX", eligibleRoles: ["Sarge"] }];
const assignments: Assignment[] = [{ showId: "a", role: "Sarge", performer: "ALEX", isRedDay: false }];

const shows: Show[] = [
  { id: "a", date: "2025-08-05", time: "19:30", callTime: "18:00", status: "show" },
  { id: "b", date: "2025-08-06", time: "TBC", callTime: "TBC", status: "show" },
  { id: "c", date: "2025-08-07", time: "", callTime: "", status: "show" },
  { id: "d", date: "2025-08-08", time: "Travel", callTime: "Travel", status: "travel" },
];

describe("SchedulePDFExporter main grid head", () => {
  beforeEach(() => {
    autoTableCalls.length = 0;
    new SchedulePDFExporter({ location: "London", week: "32", shows, assignments, castMembers, roles }).generate();
  });

  const head = () => autoTableCalls[0].head as string[][];

  it("prints Show and Call as two labelled rows, as on the call sheet", () => {
    expect(head()[1][0]).toBe("Show");
    expect(head()[2][0]).toBe("Call");
  });

  it("prints a known time in each row", () => {
    expect(head()[1][1]).toBe("19:30");
    expect(head()[2][1]).toBe("18:00");
  });

  it("prints TBC for an unset show time as well as an unset call time", () => {
    expect(head()[1][2]).toBe("TBC");
    expect(head()[2][2]).toBe("TBC");
  });

  it("prints a cleared time as TBC, not as a blank cell that reads as a missing show", () => {
    expect(head()[1][3]).toBe("TBC");
    expect(head()[2][3]).toBe("TBC");
  });

  it("labels a travel column in the Show row and leaves its Call empty", () => {
    expect(head()[1][4]).toBe("TRAVEL");
    expect(head()[2][4]).toBe("");
  });
});
