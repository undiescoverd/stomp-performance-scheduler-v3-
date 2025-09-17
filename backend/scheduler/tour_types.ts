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
  weekNumber: number;
  startDate: string;
  endDate: string;
  locationCity: string; // NEW: City name for this week
  isStandard: boolean;
  travelDay?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' | 'none'; // NEW
  customShows?: Show[];
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
    weekNumber: number;
    startDate: string;
    endDate: string;
    showCount: number;
    locationCity: string; // NEW
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