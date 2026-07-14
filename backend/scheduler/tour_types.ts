// Re-export existing types from main types.ts
export type { Show, Assignment, Role, DayStatus, CastMember } from "./types";
export { CAST_MEMBERS, ROLES, FEMALE_ONLY_ROLES } from "./types";

// Import Show type for use in interfaces
import { Show } from "./types";

export interface Tour {
  id: string;
  name: string; // Full tour name e.g., "European Summer Tour 2025"
  segmentName: string; // Segment e.g., "France"
  parentTourName?: string; // For grouping
  startDate: string;
  endDate: string;
  castMemberIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface TourWeek {
  startDate: string; // the week's Monday (YYYY-MM-DD)
  endDate: string;
  locationCity: string;
  // Optional free-text week label (default ""). Week numbers were dropped —
  // identity is venue + date range.
  week?: string;
  // Shows resolved client-side from the chosen template + week-start
  // (applyTemplate in frontend/components/domain/week.ts). The backend persists
  // them like a normal create; it does no offset math of its own.
  shows: Show[];
}

export interface BulkCreateRequest {
  tourName: string; // e.g., "European Summer Tour 2025"
  segmentName: string; // e.g., "France"
  castMemberIds: string[];
  weeks: TourWeek[];
}

export interface TourWithWeeks extends Tour {
  weeks: Array<{
    id: string;
    startDate: string; // derived from the week's shows_data (earliest show date)
    endDate: string; // derived from the week's shows_data (latest show date)
    showCount: number;
    locationCity: string;
    week: string; // optional free-text label ("" when unset)
  }>;
}

export interface TourGroup {
  tourName: string; // Parent tour name
  createdAt: string;
  segments: TourWithWeeks[]; // All segments under this tour
  totalWeeks: number;
  overallStartDate: string;
  overallEndDate: string;
}

// API Response Interfaces
export interface BulkCreateResponse {
  success: boolean;
  tour?: TourWithWeeks;
  createdWeeks?: number;
  errors?: string[];
}

export interface GetToursResponse {
  tours: TourWithWeeks[];
  groups?: TourGroup[];
  error?: string;
}

export interface DeleteTourResponse {
  success: boolean;
  deletedWeeks?: number;
}

export interface DeleteTourWeekResponse {
  success: boolean;
}