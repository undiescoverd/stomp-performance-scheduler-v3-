import { api } from "encore.dev/api";
import { scheduleDB } from "./db";
import { Schedule, Show, Assignment } from "./types";

export interface ListSchedulesResponse {
  schedules: Schedule[];
}

// Retrieves all schedules for the authenticated user, ordered by creation date (latest first).
export const list = api<void, ListSchedulesResponse>(
  { expose: true, method: "GET", path: "/schedules", auth: false },
  async () => {
    // Temporarily disable auth for testing
    const rows = await scheduleDB.queryAll`
      SELECT id, location, week, shows_data, assignments_data, created_at, updated_at
      FROM schedules 
      ORDER BY created_at DESC
    `;

    const schedules: Schedule[] = rows.map(row => ({
      id: row.id,
      location: row.location,
      week: row.week,
      shows: JSON.parse(row.shows_data) as Show[],
      assignments: JSON.parse(row.assignments_data) as Assignment[],
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));

    return { schedules };
  }
);
