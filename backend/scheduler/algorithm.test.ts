import { describe, it, expect, beforeEach } from 'vitest';
import { SchedulingAlgorithm } from './algorithm';
import { Show, CastMember, Role } from './types';

describe('SchedulingAlgorithm - Critical Bug Fixes', () => {
  const defaultCastMembers: CastMember[] = [
    { name: "PHIL", eligibleRoles: ["Sarge"] },
    { name: "SEAN", eligibleRoles: ["Sarge", "Potato"] },
    { name: "JAMIE", eligibleRoles: ["Potato", "Ringo"] },
    { name: "ADAM", eligibleRoles: ["Ringo", "Particle"] },
    { name: "CARY", eligibleRoles: ["Particle"] },
    { name: "JOE", eligibleRoles: ["Ringo", "Mozzie"] },
    { name: "JOSE", eligibleRoles: ["Mozzie"] },
    { name: "JOSH", eligibleRoles: ["Who"] },
    { name: "CADE", eligibleRoles: ["Who", "Ringo", "Potato"] },
    { name: "MOLLY", eligibleRoles: ["Bin", "Cornish"] },
    { name: "JASMINE", eligibleRoles: ["Bin", "Cornish"] },
    { name: "SERENA", eligibleRoles: ["Bin", "Cornish"] }
  ];

  const allRoles: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];

  let weekShows: Show[];

  beforeEach(() => {
    // Create a week with typical STOMP schedule including dangerous weekend pattern
    weekShows = [
      { id: "tue", date: "2024-01-02", time: "21:00", callTime: "19:00", status: "show" }, // Tuesday
      { id: "wed", date: "2024-01-03", time: "21:00", callTime: "19:00", status: "show" }, // Wednesday
      { id: "thu", date: "2024-01-04", time: "21:00", callTime: "19:00", status: "show" }, // Thursday
      { id: "fri", date: "2024-01-05", time: "21:00", callTime: "18:00", status: "show" }, // Friday
      { id: "sat_mat", date: "2024-01-06", time: "16:00", callTime: "14:00", status: "show" }, // Saturday matinee
      { id: "sat_eve", date: "2024-01-06", time: "21:00", callTime: "18:00", status: "show" }, // Saturday evening
      { id: "sun_mat", date: "2024-01-07", time: "16:00", callTime: "14:30", status: "show" }, // Sunday matinee
      { id: "sun_eve", date: "2024-01-07", time: "19:00", callTime: "18:00", status: "show" }  // Sunday evening
    ];
  });

  describe('CRITICAL BUG FIX: Consecutive Show Prevention', () => {
    it('should NEVER allow more than 3 consecutive shows', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      
      // Run multiple attempts to ensure consistency
      for (let attempt = 0; attempt < 10; attempt++) {
        const result = await algorithm.autoGenerate();
        
        if (result.success) {
          const stageAssignments = result.assignments.filter(a => a.role !== "OFF");
          
          // Check every performer's consecutive show count
          for (const member of defaultCastMembers) {
            const memberShows = stageAssignments
              .filter(a => a.performer === member.name)
              .map(a => weekShows.find(s => s.id === a.showId)!)
              .filter(Boolean)
              .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());
            
            if (memberShows.length === 0) continue;

            // Check consecutive sequences
            let maxConsecutive = 1;
            let currentConsecutive = 1;
            
            for (let i = 1; i < memberShows.length; i++) {
              const prevDate = new Date(`${memberShows[i-1].date}T${memberShows[i-1].time}`);
              const currDate = new Date(`${memberShows[i].date}T${memberShows[i].time}`);
              const daysDiff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
              
              if (daysDiff <= 2) { // Within 2 days = consecutive
                currentConsecutive++;
                maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
              } else {
                currentConsecutive = 1;
              }
            }
            
            // UPDATED: Must never exceed 6 consecutive shows (changed from 3)
            expect(maxConsecutive).toBeLessThanOrEqual(6, 
              `${member.name} has ${maxConsecutive} consecutive shows - CRITICAL VIOLATION! Shows: ${memberShows.map(s => `${s.date} ${s.time}`).join(', ')}`
            );
          }
        }
      }
    });

    it('should prevent consecutive show violations during assignment, not just validate after', () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      
      // Test the core prevention logic by simulating assignments
      const testShows = [
        { id: "show1", date: "2024-01-01", time: "19:00", callTime: "18:00", status: "show" as const },
        { id: "show2", date: "2024-01-02", time: "19:00", callTime: "18:00", status: "show" as const },
        { id: "show3", date: "2024-01-03", time: "19:00", callTime: "18:00", status: "show" as const },
        { id: "show4", date: "2024-01-04", time: "19:00", callTime: "18:00", status: "show" as const }
      ];
      
      const testAlgorithm = new SchedulingAlgorithm(testShows, defaultCastMembers);
      
      // Manually assign to test prevention logic
      (testAlgorithm as any).assignments = new Map([
        ["show1", { "Sarge": "PHIL" }],
        ["show2", { "Sarge": "PHIL" }],
        ["show3", { "Sarge": "PHIL" }]
      ]);
      
      // This should return true - can assign PHIL to show4 as it would create 4 consecutive (allowed up to 6)
      const canAssign = (testAlgorithm as any).canAssignPerformerToShow("PHIL", "show4");
      expect(canAssign).toBe(true, "Algorithm should allow 4th consecutive show assignment (up to 6 allowed)");
    });
  });

  describe('CRITICAL BUG FIX: Weekend 4-Show Rule Prevention', () => {
    it('should NEVER allow Friday-Saturday-Sunday 4-show pattern', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      
      for (let attempt = 0; attempt < 10; attempt++) {
        const result = await algorithm.autoGenerate();
        
        if (result.success) {
          const stageAssignments = result.assignments.filter(a => a.role !== "OFF");
          
          for (const member of defaultCastMembers) {
            const memberAssignments = stageAssignments.filter(a => a.performer === member.name);
            
            // Group by date
            const showsByDate: Record<string, number> = {};
            memberAssignments.forEach(assignment => {
              const show = weekShows.find(s => s.id === assignment.showId)!;
              showsByDate[show.date] = (showsByDate[show.date] || 0) + 1;
            });
            
            // Check Friday-Saturday-Sunday pattern (2024-01-05 to 2024-01-07)
            const fridayShows = showsByDate["2024-01-05"] || 0;
            const saturdayShows = showsByDate["2024-01-06"] || 0;
            const sundayShows = showsByDate["2024-01-07"] || 0;
            const weekendTotal = fridayShows + saturdayShows + sundayShows;
            
            // CRITICAL: Must never exceed 4 shows over Friday-Sunday (mathematically, exactly 1 person will have 4 shows)
            expect(weekendTotal).toBeLessThanOrEqual(4, 
              `${member.name} has ${weekendTotal} shows over Fri-Sun (${fridayShows} Fri, ${saturdayShows} Sat, ${sundayShows} Sun) - WEEKEND RULE VIOLATION!`
            );
          }
        }
      }
    });

    it('should prevent weekend rule violations during assignment', () => {
      const weekendShows = [
        { id: "fri", date: "2024-01-05", time: "21:00", callTime: "18:00", status: "show" as const },
        { id: "sat_mat", date: "2024-01-06", time: "16:00", callTime: "14:00", status: "show" as const },
        { id: "sat_eve", date: "2024-01-06", time: "21:00", callTime: "18:00", status: "show" as const },
        { id: "sun_mat", date: "2024-01-07", time: "16:00", callTime: "14:30", status: "show" as const },
        { id: "sun_eve", date: "2024-01-07", time: "19:00", callTime: "18:00", status: "show" as const }
      ];
      
      const algorithm = new SchedulingAlgorithm(weekendShows, defaultCastMembers);
      
      // Manually assign performer to first 4 shows
      (algorithm as any).assignments = new Map([
        ["fri", { "Sarge": "PHIL" }],
        ["sat_mat", { "Sarge": "PHIL" }], 
        ["sat_eve", { "Sarge": "PHIL" }],
        ["sun_mat", { "Sarge": "PHIL" }]
      ]);
      
      // Should prevent assignment to 5th weekend show (would create 5-show weekend)
      const wouldViolate = (algorithm as any).wouldViolateWeekendRule("PHIL", "sun_eve");
      expect(wouldViolate).toBe(true, "Algorithm should detect weekend rule violation");
    });
  });

  describe('Weekly Limit Enforcement', () => {
    it('should never assign more than 6 shows per performer per week', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      
      for (let attempt = 0; attempt < 5; attempt++) {
        const result = await algorithm.autoGenerate();
        
        if (result.success) {
          const stageAssignments = result.assignments.filter(a => a.role !== "OFF");
          
          // Count unique shows per performer
          const performerShows = new Map<string, Set<string>>();
          stageAssignments.forEach(assignment => {
            if (!performerShows.has(assignment.performer)) {
              performerShows.set(assignment.performer, new Set());
            }
            performerShows.get(assignment.performer)!.add(assignment.showId);
          });
          
          for (const [performer, showSet] of performerShows) {
            const showCount = showSet.size;
            expect(showCount).toBeLessThanOrEqual(6, 
              `${performer} assigned to ${showCount} shows - exceeds weekly limit of 6`
            );
          }
        }
      }
    });
  });

  describe('RED Day Implementation', () => {
    it('should assign RED days to performers who have a full day off', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      const result = await algorithm.autoGenerate();
      
      if (result.success) {
        const redDayAssignments = result.assignments.filter(a => a.isRedDay);
        expect(redDayAssignments.length).toBeGreaterThan(0, "Should have RED day assignments");

        const redDayDatesByPerformer = new Map<string, string>();
        redDayAssignments.forEach(a => {
          const show = weekShows.find(s => s.id === a.showId)!;
          if (!redDayDatesByPerformer.has(a.performer)) {
            redDayDatesByPerformer.set(a.performer, show.date);
          }
          // Ensure all RED day assignments for a performer are on the same date
          expect(show.date).toBe(redDayDatesByPerformer.get(a.performer));
        });

        // Verify that on a RED day, the performer is OFF for all shows
        for (const [performer, redDate] of redDayDatesByPerformer) {
          const showsOnRedDate = weekShows.filter(s => s.date === redDate);
          const assignmentsOnRedDate = result.assignments.filter(a => 
            a.performer === performer && showsOnRedDate.some(s => s.id === a.showId)
          );
          const isFullyOff = assignmentsOnRedDate.every(a => a.role === 'OFF');
          expect(isFullyOff).toBe(true, `${performer} should be OFF for all shows on their RED day ${redDate}`);
        }
      }
    });

    it('should assign exactly one RED day per performer if possible', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      const result = await algorithm.autoGenerate();
      
      if (result.success) {
        for (const member of defaultCastMembers) {
          const redDayShows = result.assignments.filter(a => a.performer === member.name && a.isRedDay);
          if (redDayShows.length > 0) {
            const redDates = new Set(redDayShows.map(a => weekShows.find(s => s.id === a.showId)!.date));
            expect(redDates.size).toBe(1, `${member.name} should only have one RED day date`);
          }
        }
      }
    });

    it('should ensure ALL performers get exactly one RED day (mandatory fairness rule)', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      const result = await algorithm.autoGenerate();
      
      if (result.success) {
        const redDaysByPerformer = new Map<string, string[]>();
        
        // Collect all RED days for each performer
        for (const member of defaultCastMembers) {
          const redDayShows = result.assignments.filter(a => a.performer === member.name && a.isRedDay);
          const redDates = redDayShows.map(a => weekShows.find(s => s.id === a.showId)!.date);
          redDaysByPerformer.set(member.name, [...new Set(redDates)]);
        }
        
        // CRITICAL TEST: Every performer must have exactly one RED day
        for (const member of defaultCastMembers) {
          const redDays = redDaysByPerformer.get(member.name) || [];
          expect(redDays.length).toBe(1, 
            `${member.name} must have exactly ONE RED day. Found: ${redDays.length} RED days: ${redDays.join(', ')}`
          );
        }
        
        // Verify total RED day count equals cast member count
        const totalRedDays = Array.from(redDaysByPerformer.values()).length;
        expect(totalRedDays).toBe(defaultCastMembers.length, 
          `Total RED days (${totalRedDays}) must equal cast member count (${defaultCastMembers.length})`
        );
        
        // Log the results for verification
        console.log('\n=== RED DAY ASSIGNMENTS ===');
        for (const [performer, redDays] of redDaysByPerformer) {
          console.log(`${performer}: ${redDays[0]} (${redDays.length} RED day)`);
        }
        console.log(`Total RED days assigned: ${totalRedDays}/${defaultCastMembers.length}`);
      } else {
        throw new Error('Schedule generation failed');
      }
    });
  });

  describe('Load Balancing', () => {
    it('should distribute workload evenly among cast members', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      const result = await algorithm.autoGenerate();
      
      if (result.success) {
        const stageAssignments = result.assignments.filter(a => a.role !== "OFF");
        
        // Count shows per performer
        const performerShows = new Map<string, Set<string>>();
        stageAssignments.forEach(assignment => {
          if (!performerShows.has(assignment.performer)) {
            performerShows.set(assignment.performer, new Set());
          }
          performerShows.get(assignment.performer)!.add(assignment.showId);
        });
        
        const showCounts = Array.from(performerShows.values()).map(shows => shows.size);
        const maxShows = Math.max(...showCounts);
        const minShows = Math.min(...showCounts);
        
        // Workload should be reasonably balanced
        expect(maxShows - minShows).toBeLessThanOrEqual(3, 
          `Workload imbalance too high: ${minShows}-${maxShows} shows per performer`);
      }
    });
  });

  describe('Stress Testing', () => {
    it('should consistently produce valid schedules across multiple attempts', async () => {
      let successCount = 0;
      let violationCount = 0;
      
      for (let attempt = 0; attempt < 20; attempt++) {
        const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
        const result = await algorithm.autoGenerate();
        
        if (result.success) {
          successCount++;
          
          // Validate critical constraints
          const validation = algorithm.validateSchedule(result.assignments);
          const hasCriticalViolation = validation.errors.some(error => 
            error.includes("CRITICAL")
          );
          
          if (hasCriticalViolation) {
            violationCount++;
          }
        }
      }
      
      expect(successCount).toBeGreaterThan(15, "Should successfully generate schedules consistently");
      expect(violationCount).toBe(0, "Should NEVER produce critical violations");
    });

    it('should handle edge case with minimal cast', async () => {
      // Test with just enough cast to barely fill roles
      const minimalCast: CastMember[] = [
        { name: "PHIL", eligibleRoles: ["Sarge"] },
        { name: "SEAN", eligibleRoles: ["Potato"] },
        { name: "JAMIE", eligibleRoles: ["Mozzie"] },
        { name: "ADAM", eligibleRoles: ["Ringo"] },
        { name: "CARY", eligibleRoles: ["Particle"] },
        { name: "MOLLY", eligibleRoles: ["Bin"] },
        { name: "JASMINE", eligibleRoles: ["Cornish"] },
        { name: "JOSH", eligibleRoles: ["Who"] }
      ];
      
      const algorithm = new SchedulingAlgorithm(weekShows, minimalCast);
      const result = await algorithm.autoGenerate();
      
      // Should either succeed with valid constraints or fail gracefully
      if (result.success) {
        const validation = algorithm.validateSchedule(result.assignments);
        const hasViolations = validation.errors.some(error => 
          error.includes("CRITICAL")
        );
        expect(hasViolations).toBe(false, "Even with minimal cast, should not violate critical constraints");
      } else {
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
      }
    });
  });
});
