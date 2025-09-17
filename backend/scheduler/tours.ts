import { api } from "encore.dev/api";
import { scheduleDB } from "./db";
import { autoGenerate } from "./auto_generate";
import { 
  Tour, 
  TourWithWeeks, 
  BulkCreateRequest, 
  BulkCreateResponse,
  GetToursResponse,
  DeleteTourResponse,
  DeleteTourWeekResponse,
  Show,
  DayStatus 
} from "./tour_types";

// Creates a tour with bulk schedule generation
export const createTourBulk = api<BulkCreateRequest, BulkCreateResponse>(
  { expose: true, method: "POST", path: "/api/tours/bulk-create" },
  async (req) => {
    const tourId = generateId();
    const now = new Date();
    
    try {
      // Validate request
      if (req.weekCount < 1 || req.weekCount > 12) {
        return {
          success: false,
          errors: ["Week count must be between 1 and 12"]
        };
      }

      if (!req.castMemberIds || req.castMemberIds.length === 0) {
        return {
          success: false,
          errors: ["At least one cast member must be selected"]
        };
      }

      console.log(`Creating tour ${tourId} with name: ${req.name}`);

      // Create tour record
      await scheduleDB.exec`
        INSERT INTO tours (id, name, segment_name, start_date, end_date, cast_member_ids, created_at, updated_at)
        VALUES (${tourId}, ${req.name}, ${req.segmentName}, ${req.startDate}, ${req.endDate}, ${JSON.stringify(req.castMemberIds)}, ${now}, ${now})
      `;

      console.log(`Tour ${tourId} created successfully`);

      let createdWeeks = 0;
      const errors: string[] = [];
      const weekIds: string[] = [];

      // Generate schedules for each week
      for (let weekNum = 1; weekNum <= req.weekCount; weekNum++) {
        try {
          let shows: Show[];
          let location: string;

          if (req.scheduleType === "custom" && req.customSchedule && req.customSchedule[weekNum - 1]) {
            const customWeek = req.customSchedule[weekNum - 1];
            shows = customWeek.shows;
            location = customWeek.location;
          } else {
            // Generate standard 8-show week
            const standardWeek = generateStandardWeek(weekNum);
            shows = standardWeek.shows;
            location = standardWeek.location;
          }

          console.log(`Creating week ${weekNum} for tour ${tourId}`);

          // Create schedule entry
          const scheduleId = generateId();
          const week = `Week ${weekNum}`;
          
          await scheduleDB.exec`
            INSERT INTO schedules (id, location, week, shows_data, assignments_data, tour_id, tour_segment, created_at, updated_at)
            VALUES (${scheduleId}, ${location}, ${week}, ${JSON.stringify(shows)}, ${JSON.stringify([])}, ${tourId}, ${req.segmentName}, ${now}, ${now})
          `;

          console.log(`Week ${weekNum} schedule ${scheduleId} created`);
          weekIds.push(scheduleId);

          // Auto-generate assignments for this week
          try {
            const autoGenResult = await autoGenerate({
              shows: shows
            });

            if (autoGenResult.success && autoGenResult.assignments.length > 0) {
              // Update schedule with generated assignments
              await scheduleDB.exec`
                UPDATE schedules 
                SET assignments_data = ${JSON.stringify(autoGenResult.assignments)}, updated_at = ${now}
                WHERE id = ${scheduleId}
              `;
              console.log(`Auto-generated assignments for week ${weekNum}`);
            } else if (autoGenResult.errors) {
              errors.push(`Week ${weekNum}: ${autoGenResult.errors.join(", ")}`);
            }
          } catch (autoGenError) {
            console.error(`Auto-generation failed for week ${weekNum}:`, autoGenError);
            errors.push(`Week ${weekNum}: Failed to generate assignments - ${autoGenError}`);
          }

          createdWeeks++;
        } catch (weekError) {
          console.error(`Failed to create week ${weekNum}:`, weekError);
          errors.push(`Week ${weekNum}: Failed to create schedule - ${weekError}`);
        }
      }

      console.log(`Created tour ${tourId} with ${createdWeeks} weeks`);

      // Return success with simple tour info instead of fetching
      return {
        success: true,
        tour: {
          id: tourId,
          name: req.name,
          segmentName: req.segmentName,
          startDate: req.startDate,
          endDate: req.endDate,
          castMemberIds: req.castMemberIds,
          createdAt: now,
          updatedAt: now,
          weekCount: createdWeeks,
          weeks: weekIds.map((weekId, index) => ({
            id: weekId,
            location: `Location ${index + 1}`,
            week: `Week ${index + 1}`,
            tourSegment: req.segmentName,
            showCount: 8
          }))
        },
        createdWeeks,
        errors: errors.length > 0 ? errors : undefined
      };

    } catch (error) {
      console.error(`Tour creation failed:`, error);
      
      // Cleanup on failure
      try {
        await scheduleDB.exec`DELETE FROM tours WHERE id = ${tourId}`;
      } catch (cleanupError) {
        console.error(`Cleanup failed:`, cleanupError);
      }
      
      return {
        success: false,
        errors: [`Failed to create tour: ${error}`]
      };
    }
  }
);

// Gets all tours with their weeks
export const getTours = api<{}, GetToursResponse>(
  { expose: true, method: "GET", path: "/api/tours" },
  async () => {
    try {
      // First check if tours table exists by querying directly
      const rows = await scheduleDB.query`
        SELECT 
          t.id,
          t.name,
          t.segment_name,
          t.start_date,
          t.end_date,
          t.cast_member_ids,
          t.created_at,
          t.updated_at,
          COUNT(s.id) as week_count
        FROM tours t
        LEFT JOIN schedules s ON t.id = s.tour_id
        GROUP BY t.id, t.name, t.segment_name, t.start_date, t.end_date, t.cast_member_ids, t.created_at, t.updated_at
        ORDER BY t.created_at DESC
      `;

      if (!Array.isArray(rows)) {
        console.error("Database query did not return an array:", rows);
        return { tours: [] };
      }

      const tours: TourWithWeeks[] = [];
      
      for (const row of rows) {
        // Get weeks for this tour
        const weekRows = await scheduleDB.query`
          SELECT id, location, week, tour_segment
          FROM schedules
          WHERE tour_id = ${row.id}
          ORDER BY week
        `;

        const weeks = Array.isArray(weekRows) ? weekRows.map((week: any) => ({
          id: week.id,
          location: week.location,
          week: week.week,
          tourSegment: week.tour_segment,
          showCount: 0 // Could be calculated from shows_data if needed
        })) : [];

        tours.push({
          id: row.id,
          name: row.name,
          segmentName: row.segment_name,
          startDate: row.start_date,
          endDate: row.end_date,
          castMemberIds: row.cast_member_ids || [],
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          weekCount: Number(row.week_count) || 0,
          weeks: weeks
        });
      }

      return { tours };
    } catch (error) {
      console.error("Error fetching tours:", error);
      return { tours: [] };
    }
  }
);

// Deletes a tour and all its associated schedules
export const deleteTour = api<{ id: string }, DeleteTourResponse>(
  { expose: true, method: "DELETE", path: "/api/tours/:id" },
  async (req) => {
    try {
      // Count schedules that will be deleted
      const countResult = await scheduleDB.query`
        SELECT COUNT(*) as count FROM schedules WHERE tour_id = ${req.id}
      `;
      const deletedWeeks = countResult[0]?.count || 0;

      // Delete tour (cascades to schedules due to foreign key)
      const result = await scheduleDB.exec`
        DELETE FROM tours WHERE id = ${req.id}
      `;

      return {
        success: true,
        deletedWeeks: Number(deletedWeeks)
      };
    } catch (error) {
      return {
        success: false
      };
    }
  }
);

// Deletes a specific week from a tour
export const deleteTourWeek = api<{ tourId: string; weekId: string }, DeleteTourWeekResponse>(
  { expose: true, method: "DELETE", path: "/api/tours/:tourId/weeks/:weekId" },
  async (req) => {
    try {
      await scheduleDB.exec`
        DELETE FROM schedules 
        WHERE id = ${req.weekId} AND tour_id = ${req.tourId}
      `;

      return { success: true };
    } catch (error) {
      return { success: false };
    }
  }
);

// Helper function to generate standard 8-show week
function generateStandardWeek(weekNumber: number): { shows: Show[], location: string } {
  const location = `Location ${weekNumber}`;
  const shows: Show[] = [];
  
  // Generate 8 shows for a standard week (Mon-Sat with matinee on Wed/Sat)
  const days = [
    { day: "Monday", time: "19:30", callTime: "18:30", status: "show" as DayStatus },
    { day: "Tuesday", time: "19:30", callTime: "18:30", status: "show" as DayStatus },
    { day: "Wednesday", time: "14:30", callTime: "13:30", status: "show" as DayStatus },
    { day: "Wednesday", time: "19:30", callTime: "18:30", status: "show" as DayStatus },
    { day: "Thursday", time: "19:30", callTime: "18:30", status: "show" as DayStatus },
    { day: "Friday", time: "19:30", callTime: "18:30", status: "show" as DayStatus },
    { day: "Saturday", time: "14:30", callTime: "13:30", status: "show" as DayStatus },
    { day: "Saturday", time: "19:30", callTime: "18:30", status: "show" as DayStatus }
  ];

  days.forEach((show, index) => {
    shows.push({
      id: generateId(),
      date: show.day,
      time: show.time,
      callTime: show.callTime,
      status: show.status
    });
  });

  return { shows, location };
}

// Helper function to generate unique IDs
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}