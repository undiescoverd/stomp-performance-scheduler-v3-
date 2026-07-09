import { api, APIError } from "encore.dev/api";
import { getAuthData } from "encore.dev/internal/codegen/auth";
import type { AuthData } from "../auth/encore_auth";
import { scheduleDB } from "./db";

export interface DeleteScheduleRequest {
  id: string;
}

// Deletes a schedule.
export const deleteSchedule = api<DeleteScheduleRequest, void>(
  { expose: true, method: "DELETE", path: "/schedules/:id", auth: true },
  async (req) => {
    const authData = await getAuthData<AuthData>();
    const userId = authData?.userID ?? 'system';

    const result = await scheduleDB.queryRow`
      SELECT id FROM schedules WHERE id = ${req.id} AND user_id = ${userId}
    `;

    if (!result) {
      throw APIError.notFound("schedule not found");
    }

    await scheduleDB.exec`
      DELETE FROM schedules WHERE id = ${req.id} AND user_id = ${userId}
    `;
  }
);
