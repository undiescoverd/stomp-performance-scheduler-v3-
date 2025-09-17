import { api } from "encore.dev/api";
import { scheduleDB } from "./db";
import { autoGenerate } from "./auto_generate";
import { 
  Tour, 
  TourWithWeeks, 
  TourGroup,
  BulkCreateRequest,
  Show,
  DayStatus 
} from "./tour_types";

// API Response Interfaces - defined locally to avoid import issues
interface BulkCreateResponse {
  success: boolean;
  tour?: TourWithWeeks;
  createdWeeks?: number;
  errors?: string[];
}

interface GetToursResponse {
  tours: TourWithWeeks[];
  groups?: TourGroup[];
  error?: string;
}

interface DeleteTourResponse {
  success: boolean;
  deletedWeeks?: number;
}

interface DeleteTourWeekResponse {
  success: boolean;
}

// Creates a tour with bulk schedule generation
export const createTourBulk = api<BulkCreateRequest, BulkCreateResponse>(
  { expose: true, method: "POST", path: "/api/tours/bulk-create" },
  async (req) => {
    const tourId = generateId();
    const now = new Date();
    
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

      // Extract overall start and end dates from weeks
      const startDate = req.weeks[0].startDate;
      const endDate = req.weeks[req.weeks.length - 1].endDate;
      
      // Extract parent tour name (everything before " - ")
      const parentTourName = req.tourName.includes(" - ") 
        ? req.tourName.split(" - ")[0] 
        : req.tourName;

      console.log(`Creating tour ${tourId} with name: ${req.tourName}`);

      // Create tour record with new structure
      await scheduleDB.exec`
        INSERT INTO tours (id, name, segment_name, parent_tour_name, start_date, end_date, cast_member_ids, created_at, updated_at)
        VALUES (${tourId}, ${req.tourName}, ${req.segmentName}, ${parentTourName}, ${startDate}, ${endDate}, ${JSON.stringify(req.castMemberIds)}, ${now}, ${now})
      `;

      console.log(`Tour ${tourId} created successfully with parent: ${parentTourName}`);

      let createdWeeks = 0;
      const errors: string[] = [];
      const createdWeekData: Array<{
        id: string;
        weekNumber: number;
        startDate: string;
        endDate: string;
        showCount: number;
        locationCity: string;
      }> = [];

      // Generate schedules for each week
      for (const tourWeek of req.weeks) {
        try {
          let shows: Show[];
          
          if (!tourWeek.isStandard && tourWeek.customShows) {
            shows = tourWeek.customShows;
          } else {
            // Generate standard week, accounting for travel day
            shows = generateStandardWeekShows(tourWeek.travelDay);
          }

          console.log(`Creating week ${tourWeek.weekNumber} for tour ${tourId} in ${tourWeek.locationCity}`);

          // Create schedule entry with location_city
          const scheduleId = generateId();
          const week = `Week ${tourWeek.weekNumber}`;
          
          await scheduleDB.exec`
            INSERT INTO schedules (id, location, location_city, week, shows_data, assignments_data, tour_id, tour_segment, created_at, updated_at)
            VALUES (${scheduleId}, ${tourWeek.locationCity}, ${tourWeek.locationCity}, ${week}, ${JSON.stringify(shows)}, ${JSON.stringify([])}, ${tourId}, ${req.segmentName}, ${now}, ${now})
          `;

          console.log(`Week ${tourWeek.weekNumber} schedule ${scheduleId} created`);
          
          // Track created week data
          createdWeekData.push({
            id: scheduleId,
            weekNumber: tourWeek.weekNumber,
            startDate: tourWeek.startDate,
            endDate: tourWeek.endDate,
            showCount: shows.length,
            locationCity: tourWeek.locationCity
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
              console.log(`Auto-generated assignments for week ${tourWeek.weekNumber}`);
            } else if (autoGenResult.errors) {
              errors.push(`Week ${tourWeek.weekNumber}: ${autoGenResult.errors.join(", ")}`);
            }
          } catch (autoGenError) {
            console.error(`Auto-generation failed for week ${tourWeek.weekNumber}:`, autoGenError);
            errors.push(`Week ${tourWeek.weekNumber}: Failed to generate assignments - ${autoGenError}`);
          }

          createdWeeks++;
        } catch (weekError) {
          console.error(`Failed to create week ${tourWeek.weekNumber}:`, weekError);
          errors.push(`Week ${tourWeek.weekNumber}: Failed to create schedule - ${weekError}`);
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
  { expose: true, method: "GET", path: "/api/tours" },
  async (req) => {
    console.log("getTours called with params:", req);
    try {
      // Simple query to get all tours
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
          WHERE tour_id = ${row.id}
          ORDER BY week
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

        const weeks = weekRowsArray.map((week: any, index: number) => {
          let showCount = 0;
          try {
            const showsData = week.shows_data ? JSON.parse(week.shows_data) : [];
            showCount = Array.isArray(showsData) ? showsData.length : 0;
          } catch (e) {
            showCount = 0;
          }
          
          return {
            id: week.id,
            weekNumber: index + 1,
            startDate: '',
            endDate: '',
            showCount: showCount,
            locationCity: week.location_city || 'Unknown'
          };
        });
        
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
  { expose: true, method: "DELETE", path: "/api/tours/:id" },
  async (req) => {
    try {
      // Count schedules that will be deleted
      const countResult = await scheduleDB.query`
        SELECT COUNT(*) as count FROM schedules WHERE tour_id = ${req.id}
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

// Helper function to generate standard week shows, accounting for travel days
function generateStandardWeekShows(travelDay?: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday' | 'none'): Show[] {
  const shows: Show[] = [];
  
  // Base schedule: 8 shows (Mon-Sat with matinee on Wed/Sat)
  const baseSchedule = [
    { day: "Monday", time: "19:30", callTime: "18:30", status: "show" as DayStatus },
    { day: "Tuesday", time: "19:30", callTime: "18:30", status: "show" as DayStatus },
    { day: "Wednesday", time: "14:30", callTime: "13:30", status: "show" as DayStatus },
    { day: "Wednesday", time: "19:30", callTime: "18:30", status: "show" as DayStatus },
    { day: "Thursday", time: "19:30", callTime: "18:30", status: "show" as DayStatus },
    { day: "Friday", time: "19:30", callTime: "18:30", status: "show" as DayStatus },
    { day: "Saturday", time: "14:30", callTime: "13:30", status: "show" as DayStatus },
    { day: "Saturday", time: "19:30", callTime: "18:30", status: "show" as DayStatus }
  ];

  // Filter out shows on travel day
  const filteredSchedule = baseSchedule.filter(show => {
    if (!travelDay || travelDay === 'none') return true;
    return show.day.toLowerCase() !== travelDay.toLowerCase();
  });

  // Add travel day if specified
  if (travelDay && travelDay !== 'none') {
    const travelDayCapitalized = travelDay.charAt(0).toUpperCase() + travelDay.slice(1);
    filteredSchedule.push({
      day: travelDayCapitalized,
      time: "Travel",
      callTime: "Travel", 
      status: "travel" as DayStatus
    });
  }

  // Convert to Show objects
  filteredSchedule.forEach((show, index) => {
    shows.push({
      id: generateId(),
      date: show.day,
      time: show.time,
      callTime: show.callTime,
      status: show.status
    });
  });

  return shows;
}

// Helper function to generate unique IDs
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}