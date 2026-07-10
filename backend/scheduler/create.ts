import { api } from "encore.dev/api";
import { getAuthData } from "encore.dev/internal/codegen/auth";
import type { AuthData } from "../auth/encore_auth";
import { scheduleDB } from "./db";
import { Schedule, Show, Assignment } from "./types";

export interface CreateScheduleRequest {
  location: string;
  week: string;
  shows: Show[];
  // Assignments made before the first save (e.g. auto-generate on a new
  // schedule) — without this the create round-trip would silently drop them.
  assignments?: Assignment[];
}

export interface CreateScheduleResponse {
  schedule: Schedule;
}

// Creates a new schedule.
export const create = api<CreateScheduleRequest, CreateScheduleResponse>(
  { expose: true, method: "POST", path: "/schedules", auth: true },
  async (req) => {
    const authData = await getAuthData<AuthData>();
    const userId = authData?.userID ?? 'system';

    const id = generateId();
    const now = new Date();
    const assignments = req.assignments ?? [];

    const schedule: Schedule = {
      id,
      location: req.location,
      week: req.week,
      shows: req.shows,
      assignments,
      createdAt: now,
      updatedAt: now
    };

    await scheduleDB.exec`
      INSERT INTO schedules (id, location, week, shows_data, assignments_data, user_id, created_at, updated_at)
      VALUES (${id}, ${req.location}, ${req.week}, ${JSON.stringify(req.shows)}, ${JSON.stringify(assignments)}, ${userId}, ${now}, ${now})
    `;

    return { schedule };
  }
);

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
