import { api } from "encore.dev/api";
import { Show, Assignment } from "./types";
import { SchedulingAlgorithm, AutoGenerateResult } from "./algorithm";

export interface AutoGenerateRequest {
  shows: Show[];
}

export interface AutoGenerateResponse {
  success: boolean;
  assignments: Assignment[];
  errors?: string[];
  warnings?: string[];
  generationId?: string;
}

// Generates optimal cast assignments for the given shows using constraint satisfaction.
export const autoGenerate = api<AutoGenerateRequest, AutoGenerateResponse>(
  { expose: true, method: "POST", path: "/schedules/auto-generate" },
  async (req) => {
    // Get current cast members from company system
    const { getCastMembers } = await import("./cast_members");
    const castData = await getCastMembers();
    
    const algorithm = new SchedulingAlgorithm(req.shows, castData.castMembers);
    const result = await algorithm.autoGenerate();
    
    return {
      success: result.success,
      assignments: result.assignments,
      errors: result.errors,
      warnings: result.warnings,
      generationId: result.generationId
    };
  }
);
