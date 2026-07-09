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
  createdAt: Date;
  updatedAt: Date;
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
