import { api } from "encore.dev/api";
import { Show, Assignment } from "./types";
import { SchedulingAlgorithm, ConstraintResult, ValidationItem } from "./algorithm";

// Re-exported so the structured validation items enter the generated client and
// the frontend can attribute each issue to a performer / show without parsing
// the human-readable message text.
export type { ValidationItem } from "./algorithm";

export interface ValidateScheduleRequest {
  shows: Show[];
  assignments: Assignment[];
}

export interface ValidateScheduleResponse {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  /**
   * Structured, message-independent attribution for every issue — the same set
   * `errors`/`warnings` are derived from, each tagged with its rule `code`,
   * `severity`, and (where known) the `performer` and/or `showId` it concerns.
   */
  items: ValidationItem[];
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
      warnings: result.warnings,
      items: result.items
    };
  }
);
