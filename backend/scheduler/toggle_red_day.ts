import { api, APIError } from "encore.dev/api";
import { getAuthData } from "encore.dev/internal/codegen/auth";
import type { AuthData } from "../auth/encore_auth";
import { scheduleDB } from "./db";
import { Assignment, Show } from "./types";

export interface ToggleRedDayRequest {
  id: string; // scheduleId
  performer: string;
  date: string;
}

export interface ToggleRedDayResponse {
  assignments: Assignment[];
}

// Toggles the RED day status for a performer for an entire date.
export const toggleRedDay = api<ToggleRedDayRequest, ToggleRedDayResponse>(
  { expose: true, method: "PUT", path: "/schedules/:id/toggle-red-day", auth: true },
  async (req) => {
    const authData = await getAuthData<AuthData>();
    const userId = authData?.userID ?? 'system';

    // First, get the existing schedule (scoped to the authenticated user)
    const existingRow = await scheduleDB.queryRow`
      SELECT id, assignments_data, shows_data, updated_at
      FROM schedules
      WHERE id = ${req.id} AND user_id = ${userId}
    `;

    if (!existingRow) {
      throw APIError.notFound("schedule not found");
    }

    const assignments: Assignment[] = JSON.parse(existingRow.assignments_data);
    const shows: Show[] = JSON.parse(existingRow.shows_data);
    
    // 1. Check if performer is OFF for all shows on the given date.
    const showsOnDate = shows.filter(s => s.date === req.date && s.status === 'show');
    if (showsOnDate.length === 0) {
        throw APIError.invalidArgument("Cannot set a RED day on a non-show day.");
    }

    const assignmentsOnDate = assignments.filter(a => 
        a.performer === req.performer && showsOnDate.some(s => s.id === a.showId)
    );

    // If the performer has any stage roles on this date, they can't have a RED day.
    if (assignmentsOnDate.some(a => a.role !== 'OFF')) {
        throw APIError.failedPrecondition(`${req.performer} is not OFF for all shows on ${req.date}.`);
    }

    // 2. Find current RED day for the performer, if any.
    let currentRedDate: string | null = null;
    for (const a of assignments) {
        if (a.performer === req.performer && a.isRedDay) {
            const show = shows.find(s => s.id === a.showId);
            if (show) {
                currentRedDate = show.date;
                break;
            }
        }
    }

    // 3. Clear the old RED day flags
    if (currentRedDate) {
        assignments.forEach(a => {
            const show = shows.find(s => s.id === a.showId);
            if (a.performer === req.performer && show && show.date === currentRedDate) {
                a.isRedDay = false;
            }
        });
    }

    // 4. Set new RED day flags, or unset if toggling off
    if (currentRedDate !== req.date) {
        assignments.forEach(a => {
            const show = shows.find(s => s.id === a.showId);
            if (a.performer === req.performer && show && show.date === req.date) {
                a.isRedDay = true;
            }
        });
    }

    // Update the database
    const now = new Date();
    await scheduleDB.exec`
      UPDATE schedules
      SET assignments_data = ${JSON.stringify(assignments)},
          updated_at = ${now}
      WHERE id = ${req.id} AND user_id = ${userId}
    `;

    return { assignments };
  }
);
