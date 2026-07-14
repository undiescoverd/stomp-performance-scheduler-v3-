import { api, APIError } from "encore.dev/api";
import { getAuthData } from "encore.dev/internal/codegen/auth";
import type { AuthData } from "../auth/encore_auth";
import { scheduleDB } from "./db";
import { autoGenerate } from "./auto_generate";
import { FEATURE_FLAGS } from "../config/features";
import {
  Tour,
  TourWithWeeks,
  TourGroup,
  BulkCreateRequest,
  BulkCreateResponse,
  GetToursResponse,
  DeleteTourResponse,
  DeleteTourWeekResponse,
  Show
} from "./tour_types";

// Creates a tour with bulk schedule generation
export const createTourBulk = api<BulkCreateRequest, BulkCreateResponse>(
  { expose: true, method: "POST", path: "/api/tours/bulk-create", auth: true },
  async (req) => {
    // Feature flag check
    if (!FEATURE_FLAGS.MULTI_COUNTRY_TOURS) {
      return {
        success: false,
        errors: ["Tours feature is not available"]
      };
    }

    const tourId = generateId();
    const now = new Date();
    // Tour week schedules must be owned by the creating user, or the
    // user-scoped get()/list() endpoints can't open them (they filter on
    // user_id). Mirrors create.ts.
    const authData = await getAuthData<AuthData>();
    const userId = authData?.userID ?? 'system';

    try {
      // Validate request
      if (!req.weeks || req.weeks.length === 0 || req.weeks.length > 12) {
        return {
          success: false,
          errors: ["Must have between 1 and 12 weeks"]
        };
      }

      if (!req.castMemberIds || req.castMemberIds.length === 0) {
        return {
          success: false,
          errors: ["At least one cast member must be selected"]
        };
      }

      // Overall span = earliest start / latest end across the weeks. Take the
      // min/max rather than the first/last array entry: the caller may hand
      // weeks in any order (getTours re-sorts by start date), and first/last
      // would otherwise store an inverted range. Dates are YYYY-MM-DD, so a
      // string compare is chronological.
      const startDate = req.weeks.reduce((min, w) => (w.startDate < min ? w.startDate : min), req.weeks[0].startDate);
      const endDate = req.weeks.reduce((max, w) => (w.endDate > max ? w.endDate : max), req.weeks[0].endDate);

      // Extract parent tour name (everything before " - ")
      const parentTourName = req.tourName.includes(" - ")
        ? req.tourName.split(" - ")[0]
        : req.tourName;

      console.log(`Creating tour ${tourId} with name: ${req.tourName}`);

      // Create tour record with new structure
      await scheduleDB.exec`
        INSERT INTO tours (id, name, segment_name, parent_tour_name, start_date, end_date, cast_member_ids, user_id, created_at, updated_at)
        VALUES (${tourId}, ${req.tourName}, ${req.segmentName}, ${parentTourName}, ${startDate}, ${endDate}, ${JSON.stringify(req.castMemberIds)}, ${userId}, ${now}, ${now})
      `;

      console.log(`Tour ${tourId} created successfully with parent: ${parentTourName}`);

      let createdWeeks = 0;
      const errors: string[] = [];
      const createdWeekData: Array<{
        id: string;
        startDate: string;
        endDate: string;
        showCount: number;
        locationCity: string;
        week: string;
      }> = [];

      // Generate schedules for each week
      for (const tourWeek of req.weeks) {
        // A week is identified by its venue + date range, so label failures by
        // city rather than an arbitrary week number.
        const weekTag = `${tourWeek.locationCity} (${tourWeek.startDate})`;
        try {
          // Shows are resolved client-side from the chosen template; the backend
          // persists them like a normal create and does no offset math.
          const shows: Show[] = tourWeek.shows ?? [];
          const weekLabel = tourWeek.week ?? "";

          console.log(`Creating week for tour ${tourId} in ${tourWeek.locationCity}`);

          // Create schedule entry with location_city
          const scheduleId = generateId();

          await scheduleDB.exec`
            INSERT INTO schedules (id, location, location_city, week, shows_data, assignments_data, tour_id, tour_segment, user_id, created_at, updated_at)
            VALUES (${scheduleId}, ${tourWeek.locationCity}, ${tourWeek.locationCity}, ${weekLabel}, ${JSON.stringify(shows)}, ${JSON.stringify([])}, ${tourId}, ${req.segmentName}, ${userId}, ${now}, ${now})
          `;

          console.log(`Week schedule ${scheduleId} created for ${weekTag}`);

          // Track created week data
          createdWeekData.push({
            id: scheduleId,
            startDate: tourWeek.startDate,
            endDate: tourWeek.endDate,
            showCount: shows.filter((s) => s.status === "show").length,
            locationCity: tourWeek.locationCity,
            week: weekLabel
          });

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
              console.log(`Auto-generated assignments for ${weekTag}`);
            } else if (autoGenResult.errors) {
              errors.push(`${weekTag}: ${autoGenResult.errors.join(", ")}`);
            }
          } catch (autoGenError) {
            console.error(`Auto-generation failed for ${weekTag}:`, autoGenError);
            errors.push(`${weekTag}: Failed to generate assignments - ${autoGenError}`);
          }

          createdWeeks++;
        } catch (weekError) {
          console.error(`Failed to create week ${weekTag}:`, weekError);
          errors.push(`${weekTag}: Failed to create schedule - ${weekError}`);
        }
      }

      console.log(`Created tour ${tourId} with ${createdWeeks} weeks`);

      // Return success with detailed tour info
      return {
        success: true,
        tour: {
          id: tourId,
          name: req.tourName,
          segmentName: req.segmentName,
          parentTourName: parentTourName,
          startDate: startDate,
          endDate: endDate,
          castMemberIds: req.castMemberIds,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          weeks: createdWeekData
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

// Gets all tours with their weeks, optionally grouped by parent tour
export const getTours = api<{ grouped?: boolean }, GetToursResponse>(
  { expose: true, method: "GET", path: "/api/tours", auth: true },
  async (req) => {
    // Feature flag check
    if (!FEATURE_FLAGS.MULTI_COUNTRY_TOURS) {
      return {
        tours: [],
        error: "Tours feature is not available"
      };
    }

    console.log("getTours called with params:", req);
    const authData = await getAuthData<AuthData>();
    const userId = authData?.userID ?? 'system';
    try {
      // Only the caller's own tours (mirrors the user scoping on list.ts/get.ts)
      const rows = await scheduleDB.query`
        SELECT
          id,
          name,
          segment_name,
          parent_tour_name,
          start_date,
          end_date,
          cast_member_ids,
          created_at,
          updated_at
        FROM tours
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `;

      console.log("Database query did not return an array:", rows);

      // Convert AsyncGenerator to array
      const rowsArray: any[] = [];
      if (rows && typeof rows[Symbol.asyncIterator] === 'function') {
        for await (const row of rows) {
          rowsArray.push(row);
        }
      } else if (Array.isArray(rows)) {
        rowsArray.push(...rows);
      }

      console.log(`Query returned rows: ${rowsArray.length} rows`);

      if (rowsArray.length === 0) {
        // Debug: Check if tours table has any data
        const countResult = await scheduleDB.query`SELECT COUNT(*) as total FROM tours`;
        const countArray: any[] = [];
        if (countResult && typeof countResult[Symbol.asyncIterator] === 'function') {
          for await (const row of countResult) {
            countArray.push(row);
          }
        }
        console.log(`Total tours in database: ${countArray[0]?.total || 0}`);
        console.log("No tours found in database");
        return { tours: [] };
      }

      const tours: TourWithWeeks[] = [];

      for (const row of rowsArray) {
        // Get weeks for this tour
        const weekRows = await scheduleDB.query`
          SELECT id, location_city, week, shows_data
          FROM schedules
          WHERE tour_id = ${row.id} AND user_id = ${userId}
        `;

        // Convert weekRows AsyncGenerator to array
        const weekRowsArray: any[] = [];
        if (weekRows && typeof weekRows[Symbol.asyncIterator] === 'function') {
          for await (const week of weekRows) {
            weekRowsArray.push(week);
          }
        } else if (Array.isArray(weekRows)) {
          weekRowsArray.push(...weekRows);
        }

        // Week numbers were dropped: a week is identified by its venue + date
        // range. Derive each week's start/end from its shows_data (there is no
        // start/end column) and sort chronologically by start date. The dates
        // are YYYY-MM-DD strings, so a lexicographic compare is chronological.
        const weeks = weekRowsArray
          .map((week: any) => {
            let shows: any[] = [];
            try {
              const parsed = week.shows_data ? JSON.parse(week.shows_data) : [];
              shows = Array.isArray(parsed) ? parsed : [];
            } catch (e) {
              shows = [];
            }
            const dates = shows
              .map((s) => String(s?.date ?? ""))
              .filter(Boolean)
              .sort();

            return {
              id: week.id,
              startDate: dates[0] ?? '',
              endDate: dates[dates.length - 1] ?? '',
              showCount: shows.filter((s) => s?.status === "show").length,
              locationCity: week.location_city || 'Unknown',
              week: week.week ?? ''
            };
          })
          .sort((a, b) => a.startDate.localeCompare(b.startDate));

        // Parse cast member IDs
        let castMemberIds: string[] = [];
        try {
          if (typeof row.cast_member_ids === 'string') {
            castMemberIds = JSON.parse(row.cast_member_ids);
          } else if (Array.isArray(row.cast_member_ids)) {
            castMemberIds = row.cast_member_ids;
          }
        } catch (e) {
          castMemberIds = [];
        }

        tours.push({
          id: row.id,
          name: row.name,
          segmentName: row.segment_name,
          parentTourName: row.parent_tour_name,
          startDate: row.start_date,
          endDate: row.end_date,
          castMemberIds: castMemberIds,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          weeks: weeks
        });
      }

      // If grouped is requested, group by parent tour name
      if (req?.grouped) {
        const groupMap = new Map<string, TourWithWeeks[]>();

        tours.forEach(tour => {
          const parentName = tour.parentTourName || tour.name;
          if (!groupMap.has(parentName)) {
            groupMap.set(parentName, []);
          }
          groupMap.get(parentName)!.push(tour);
        });

        const groups: TourGroup[] = Array.from(groupMap.entries()).map(([tourName, segments]) => {
          const allStartDates = segments.map(s => new Date(s.startDate));
          const allEndDates = segments.map(s => new Date(s.endDate));
          const totalWeeks = segments.reduce((sum, segment) => sum + segment.weeks.length, 0);

          return {
            tourName,
            createdAt: segments[0]?.createdAt || new Date().toISOString(),
            segments: segments.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()),
            totalWeeks,
            overallStartDate: new Date(Math.min(...allStartDates.map(d => d.getTime()))).toISOString(),
            overallEndDate: new Date(Math.max(...allEndDates.map(d => d.getTime()))).toISOString()
          };
        });

        return { tours, groups };
      }

      return { tours };
    } catch (error) {
      return { tours: [], error: String(error) };
    }
  }
);

// Deletes a tour and all its associated schedules
export const deleteTour = api<{ id: string }, DeleteTourResponse>(
  { expose: true, method: "DELETE", path: "/api/tours/:id", auth: true },
  async (req) => {
    // Feature flag check
    if (!FEATURE_FLAGS.MULTI_COUNTRY_TOURS) {
      return {
        success: false
      };
    }

    const authData = await getAuthData<AuthData>();
    const userId = authData?.userID ?? 'system';

    const existingTour = await scheduleDB.queryRow`
      SELECT id FROM tours WHERE id = ${req.id} AND user_id = ${userId}
    `;
    if (!existingTour) {
      throw APIError.notFound("tour not found");
    }

    try {
      // Count schedules that will be deleted
      const countResult = await scheduleDB.query`
        SELECT COUNT(*) as count FROM schedules WHERE tour_id = ${req.id} AND user_id = ${userId}
      `;

      // Convert AsyncGenerator to array
      const countArray: any[] = [];
      if (countResult && typeof countResult[Symbol.asyncIterator] === 'function') {
        for await (const row of countResult) {
          countArray.push(row);
        }
      } else if (Array.isArray(countResult)) {
        countArray.push(...countResult);
      }
      const deletedWeeks = countArray[0]?.count || 0;

      // Delete tour (cascades to schedules due to foreign key), only if the
      // caller owns it — mirrors the user scoping on delete.ts.
      const result = await scheduleDB.exec`
        DELETE FROM tours WHERE id = ${req.id} AND user_id = ${userId}
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
  { expose: true, method: "DELETE", path: "/api/tours/:tourId/weeks/:weekId", auth: true },
  async (req) => {
    // Feature flag check
    if (!FEATURE_FLAGS.MULTI_COUNTRY_TOURS) {
      return {
        success: false
      };
    }

    const authData = await getAuthData<AuthData>();
    const userId = authData?.userID ?? 'system';

    const existingWeek = await scheduleDB.queryRow`
      SELECT id FROM schedules WHERE id = ${req.weekId} AND tour_id = ${req.tourId} AND user_id = ${userId}
    `;
    if (!existingWeek) {
      throw APIError.notFound("tour week not found");
    }

    try {
      await scheduleDB.exec`
        DELETE FROM schedules
        WHERE id = ${req.weekId} AND tour_id = ${req.tourId} AND user_id = ${userId}
      `;

      return { success: true };
    } catch (error) {
      return { success: false };
    }
  }
);

// Helper function to generate unique IDs
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}