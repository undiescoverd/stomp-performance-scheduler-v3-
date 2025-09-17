// Re-export existing types from main types.ts
export { Show, Assignment, Role, DayStatus, CastMember, CAST_MEMBERS, ROLES, FEMALE_ONLY_ROLES } from "./types";

// Import Show type for use in interfaces
import { Show } from "./types";

export interface Tour {
  id: string;
  name: string;
  segmentName: string;
  startDate: string;
  endDate: string;
  castMemberIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TourWeek {
  id: string;
  location: string;
  week: string;
  tourSegment: string;
  showCount: number;
}

export interface TourWithWeeks extends Tour {
  weeks: TourWeek[];
  weekCount: number;
}

export interface BulkCreateRequest {
  name: string;
  segmentName: string;
  startDate: string;
  endDate: string;
  castMemberIds: string[];
  weekCount: number;
  scheduleType: "standard" | "custom";
  customSchedule?: {
    location: string;
    shows: Show[];
  }[];
}

export interface BulkCreateResponse {
  success: boolean;
  tour?: TourWithWeeks;
  errors?: string[];
  createdWeeks?: number;
}

export interface GetToursResponse {
  tours: TourWithWeeks[];
}

export interface DeleteTourResponse {
  success: boolean;
  deletedWeeks?: number;
}

export interface DeleteTourWeekResponse {
  success: boolean;
}