import { api } from "encore.dev/api";
import { Show, Assignment } from "./types";
import { SchedulingAlgorithm, ConstraintResult } from "./algorithm";

export interface ValidateScheduleRequest {
  shows: Show[];
  assignments: Assignment[];
}

export interface ValidateScheduleResponse {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Validates a schedule against all constraints and business rules.
export const validate = api<ValidateScheduleRequest, ValidateScheduleResponse>(
  { expose: true, method: "POST", path: "/schedules/validate" },
  async (req) => {
    // Get current cast members from company system
    const { getCastMembers } = await import("./cast_members");
    const castData = await getCastMembers();
    
    const algorithm = new SchedulingAlgorithm(req.shows, castData.castMembers);
    const result = algorithm.validateSchedule(req.assignments, { ignoreUnstartedShows: true });
    
    return {
      isValid: result.isValid,
      errors: result.errors,
      warnings: result.warnings
    };
  }
);
