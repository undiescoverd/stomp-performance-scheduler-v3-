import { api } from "encore.dev/api";
import { scheduleDB } from "./db";
import { Schedule, Show, Assignment } from "./types";

export interface CreateScheduleRequest {
  location: string;
  week: string;
  shows: Show[];
}

export interface CreateScheduleResponse {
  schedule: Schedule;
}

// Creates a new schedule.
export const create = api<CreateScheduleRequest, CreateScheduleResponse>(
  { expose: true, method: "POST", path: "/schedules", auth: false },
  async (req) => {
    const id = generateId();
    const now = new Date();
    
    const schedule: Schedule = {
      id,
      location: req.location,
      week: req.week,
      shows: req.shows,
      assignments: [],
      createdAt: now,
      updatedAt: now
    };

    await scheduleDB.exec`
      INSERT INTO schedules (id, location, week, shows_data, assignments_data, created_at, updated_at)
      VALUES (${id}, ${req.location}, ${req.week}, ${JSON.stringify(req.shows)}, ${JSON.stringify([])}, ${now}, ${now})
    `;

    return { schedule };
  }
);

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
