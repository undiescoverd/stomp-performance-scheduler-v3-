export type Role = "Sarge" | "Potato" | "Mozzie" | "Ringo" | "Particle" | "Bin" | "Cornish" | "Who";

export type DayStatus = "show" | "travel" | "dayoff";

export interface CastMember {
  name: string;
  eligibleRoles: Role[];
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
  // a warning instead of an error. Never softens casting/eligibility/gender/
  // >6-consecutive/RED-day errors.
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
  { name: "PHIL", eligibleRoles: ["Sarge"] },
  { name: "SEAN", eligibleRoles: ["Sarge", "Potato"] },
  { name: "JAMIE", eligibleRoles: ["Potato", "Ringo"] },
  { name: "ADAM", eligibleRoles: ["Ringo", "Particle"] },
  { name: "CARY", eligibleRoles: ["Particle"] },
  { name: "JOE", eligibleRoles: ["Ringo", "Mozzie"] },
  { name: "JOSE", eligibleRoles: ["Mozzie"] },
  { name: "JOSH", eligibleRoles: ["Who"] },
  { name: "CADE", eligibleRoles: ["Who", "Ringo", "Potato"] },
  { name: "MOLLY", eligibleRoles: ["Bin", "Cornish"] },
  { name: "JASMINE", eligibleRoles: ["Bin", "Cornish"] },
  { name: "SERENA", eligibleRoles: ["Bin", "Cornish"] }
];

export const ROLES: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];

export const FEMALE_ONLY_ROLES: Role[] = ["Bin", "Cornish"];
