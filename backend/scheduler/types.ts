export type Role = "Sarge" | "Potato" | "Mozzie" | "Ringo" | "Particle" | "Bin" | "Cornish" | "Who";

export type DayStatus = "show" | "travel" | "dayoff";

export interface CastMember {
  name: string;
  eligibleRoles: Role[];
  // Optional so legacy/company-loaded records still typecheck. When absent,
  // gender is inferred from eligibility for a female-only role (see algorithm).
  gender?: "male" | "female";
}

export interface Show {
  id: string;
  date: string;
  time: string;
  callTime: string;
  status: DayStatus;
  /**
   * City this column belongs to, when a week spans more than one. Absent on
   * single-city weeks, where the schedule's own `location` is the city. A
   * travel day carries the city being *left*, so the destination lives on the
   * days after it — see `setDestination` in frontend/components/domain/week.ts.
   */
  location?: string;
  /**
   * This day off carries the whole company's RED day. At most one show in a
   * schedule may set it, and only when status === "dayoff".
   */
  isCompanyRedDay?: boolean;
}

export interface Assignment {
  showId: string;
  role: Role | "OFF";
  performer: string;
  isRedDay?: boolean;
  // RD-sanctioned exception (injury/sickness cover). When set, a back-to-back
  // double-days or weekly >6 violation involving this assignment is reported as
  // a warning instead of an error. Never softens casting/eligibility/
  // >6-consecutive/RED-day errors. (Gender-role mismatches are already
  // reported as a warning, not an error — see GENDER_VIOLATION.)
  isOverride?: boolean;
}

export interface Schedule {
  id: string;
  location: string;
  week: string;
  shows: Show[];
  assignments: Assignment[];
  // The template this schedule was created from, if any — lets the editor offer
  // "Update template". May dangle if that template was later deleted.
  templateId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One day of a reusable week template, stored Monday-relative so it can be
 * replayed onto any week-start. `dayOffset` 0 = Monday … 6 = Sunday; two slots
 * may share an offset (a double-show day). The backend stores these verbatim —
 * all offset↔date math lives in frontend/components/domain/week.ts.
 */
export interface TemplateSlot {
  dayOffset: number; // 0 = Monday … 6 = Sunday
  time: string; // "19:30" | "Travel"
  callTime: string;
  status: DayStatus;
  isCompanyRedDay?: boolean;
}

/** A saved, owner-scoped week template: a captured Monday-relative day pattern. */
export interface Template {
  id: string;
  name: string;
  slots: TemplateSlot[];
}

export const CAST_MEMBERS: CastMember[] = [
  { name: "PHIL", eligibleRoles: ["Sarge"], gender: "male" },
  { name: "SEAN", eligibleRoles: ["Sarge", "Potato"], gender: "male" },
  { name: "JAMIE", eligibleRoles: ["Potato", "Ringo"], gender: "male" },
  { name: "ADAM", eligibleRoles: ["Ringo", "Particle"], gender: "male" },
  { name: "CARY", eligibleRoles: ["Particle"], gender: "male" },
  { name: "JOE", eligibleRoles: ["Ringo", "Mozzie"], gender: "male" },
  { name: "JOSE", eligibleRoles: ["Mozzie"], gender: "male" },
  { name: "JOSH", eligibleRoles: ["Who"], gender: "male" },
  { name: "CADE", eligibleRoles: ["Who", "Ringo", "Potato"], gender: "male" },
  { name: "MOLLY", eligibleRoles: ["Bin", "Cornish"], gender: "female" },
  { name: "JASMINE", eligibleRoles: ["Bin", "Cornish"], gender: "female" },
  { name: "SERENA", eligibleRoles: ["Bin", "Cornish"], gender: "female" }
];

export const ROLES: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];

export const FEMALE_ONLY_ROLES: Role[] = ["Bin", "Cornish"];
