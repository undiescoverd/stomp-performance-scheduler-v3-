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
    it('should never allow more than 6 consecutive shows', async () => {
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

            // Independently recompute the consecutive run using the §0 rule:
            // DATES ONLY, a gap day resets the run, and a same-day matinee +
            // evening double counts as 2. (Do not trust the validator here.)
            let maxConsecutive = 1;
            let currentConsecutive = 1;

            for (let i = 1; i < memberShows.length; i++) {
              const prevDay = new Date(`${memberShows[i-1].date}T12:00:00Z`).getTime();
              const currDay = new Date(`${memberShows[i].date}T12:00:00Z`).getTime();
              const dayDiff = Math.round((currDay - prevDay) / (1000 * 60 * 60 * 24));

              if (dayDiff === 0 || dayDiff === 1) { // same date (double) or adjacent date
                currentConsecutive++;
                maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
              } else {
                currentConsecutive = 1;
              }
            }

            // 6 consecutive shows is LEGAL; only 7+ is a violation.
            expect(maxConsecutive).toBeLessThanOrEqual(6,
              `${member.name} has ${maxConsecutive} consecutive shows - CRITICAL VIOLATION! Shows: ${memberShows.map(s => `${s.date} ${s.time}`).join(', ')}`
            );
          }
        }
      }
    });

    it('does not chain a run across a gap day (regression for the old <=2 bug)', () => {
      // Performer works Tue mat+eve, Wed, Thu, Fri, then Sun mat+eve — with
      // SATURDAY entirely off. Tue and Sun are the only double days and are NOT
      // adjacent, so there is no back-to-back-doubles violation. That is 7
      // shows total, but the Sat gap resets the run: the longest true run is
      // Tue mat,Tue eve,Wed,Thu,Fri = 5. The old datetime `<= 2` logic wrongly
      // chained Fri -> Sun into a single 7-run and produced a false error.
      const gapShows: Show[] = [
        { id: "tue_mat", date: "2024-01-02", time: "16:00", callTime: "14:00", status: "show" },
        { id: "tue_eve", date: "2024-01-02", time: "21:00", callTime: "18:00", status: "show" },
        { id: "wed",     date: "2024-01-03", time: "21:00", callTime: "19:00", status: "show" },
        { id: "thu",     date: "2024-01-04", time: "21:00", callTime: "19:00", status: "show" },
        { id: "fri",     date: "2024-01-05", time: "21:00", callTime: "18:00", status: "show" },
        // Saturday: no shows for this performer (full gap day)
        { id: "sun_mat", date: "2024-01-07", time: "16:00", callTime: "14:30", status: "show" },
        { id: "sun_eve", date: "2024-01-07", time: "19:00", callTime: "18:00", status: "show" }
      ];

      const algorithm = new SchedulingAlgorithm(gapShows, defaultCastMembers);
      // PHIL plays Sarge in every one of these 7 shows.
      const assignments = gapShows.map(s => ({ showId: s.id, role: "Sarge" as Role, performer: "PHIL" }));

      const result = algorithm.validateSchedule(assignments);
      const consecutiveErrors = result.errors.filter(e => e.includes("consecutive shows"));
      expect(consecutiveErrors).toEqual([]);
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

  describe('Back-to-Back Double Days Prevention (governs weekend fatigue)', () => {
    // Helper: does any performer perform 4 shows across 2 adjacent dates?
    const hasBackToBackDoubles = (assignments: { showId: string; role: string; performer: string }[], shows: Show[]): boolean => {
      const showById = new Map(shows.map(s => [s.id, s]));
      const byPerformer: Record<string, Record<string, number>> = {};
      for (const a of assignments) {
        if (a.role === 'OFF') continue;
        const show = showById.get(a.showId);
        if (!show) continue;
        byPerformer[a.performer] ??= {};
        byPerformer[a.performer][show.date] = (byPerformer[a.performer][show.date] || 0) + 1;
      }
      for (const dates of Object.values(byPerformer)) {
        const sorted = Object.keys(dates).sort();
        for (let i = 0; i < sorted.length - 1; i++) {
          const d1 = new Date(`${sorted[i]}T12:00:00Z`).getTime();
          const d2 = new Date(`${sorted[i + 1]}T12:00:00Z`).getTime();
          const dayDiff = Math.round((d2 - d1) / 86400000);
          if (dayDiff === 1 && dates[sorted[i]] === 2 && dates[sorted[i + 1]] === 2) return true;
        }
      }
      return false;
    };

    it('validation flags Sat double + Sun double as a back-to-back violation', () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      const assignments = [
        { showId: 'sat_mat', role: 'Sarge' as Role, performer: 'PHIL' },
        { showId: 'sat_eve', role: 'Sarge' as Role, performer: 'PHIL' },
        { showId: 'sun_mat', role: 'Sarge' as Role, performer: 'PHIL' },
        { showId: 'sun_eve', role: 'Sarge' as Role, performer: 'PHIL' }
      ];
      const result = algorithm.validateSchedule(assignments);
      const b2bErrors = result.errors.filter(e => e.includes('back-to-back double days'));
      expect(b2bErrors.length).toBeGreaterThan(0);
    });

    it('validation flags MID-WEEK back-to-back doubles too (rule is date-agnostic)', () => {
      const midWeekShows: Show[] = [
        { id: 'wed_mat', date: '2024-01-03', time: '16:00', callTime: '14:00', status: 'show' },
        { id: 'wed_eve', date: '2024-01-03', time: '21:00', callTime: '18:00', status: 'show' },
        { id: 'thu_mat', date: '2024-01-04', time: '16:00', callTime: '14:00', status: 'show' },
        { id: 'thu_eve', date: '2024-01-04', time: '21:00', callTime: '18:00', status: 'show' }
      ];
      const algorithm = new SchedulingAlgorithm(midWeekShows, defaultCastMembers);
      const assignments = midWeekShows.map(s => ({ showId: s.id, role: 'Sarge' as Role, performer: 'PHIL' }));
      const result = algorithm.validateSchedule(assignments);
      expect(result.errors.filter(e => e.includes('back-to-back double days')).length).toBeGreaterThan(0);
    });

    it('generation never produces back-to-back doubles on a standard week', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      for (let attempt = 0; attempt < 20; attempt++) {
        const result = await algorithm.autoGenerate();
        if (result.success) {
          expect(hasBackToBackDoubles(result.assignments, weekShows)).toBe(false);
        }
      }
    });

    it('allows 5 Fri-Sun shows when the double days are NOT adjacent (Fri-Sun cap is gone)', () => {
      // Fri double + Sat single + Sun double = 5 Fri-Sun shows, but Fri and Sun
      // doubles are separated by Sat, so there is no back-to-back pattern. The
      // old Fri-Sun <=4 cap wrongly rejected this; it is now legal.
      const splitShows: Show[] = [
        { id: 'fri_mat', date: '2024-01-05', time: '16:00', callTime: '14:00', status: 'show' },
        { id: 'fri_eve', date: '2024-01-05', time: '21:00', callTime: '18:00', status: 'show' },
        { id: 'sat_mat', date: '2024-01-06', time: '16:00', callTime: '14:00', status: 'show' },
        { id: 'sun_mat', date: '2024-01-07', time: '16:00', callTime: '14:30', status: 'show' },
        { id: 'sun_eve', date: '2024-01-07', time: '19:00', callTime: '18:00', status: 'show' }
      ];
      const algorithm = new SchedulingAlgorithm(splitShows, defaultCastMembers);
      const assignments = splitShows.map(s => ({ showId: s.id, role: 'Sarge' as Role, performer: 'PHIL' }));

      const result = algorithm.validateSchedule(assignments);
      expect(result.errors.filter(e => e.includes('back-to-back double days'))).toEqual([]);
      expect(result.errors.filter(e => e.includes('over a weekend'))).toEqual([]);

      // And during generation, PHIL playing 4 of these 5 shows is still eligible
      // for the 5th (no weekend cap blocks it).
      (algorithm as any).assignments = new Map([
        ['fri_mat', { Sarge: 'PHIL' }],
        ['fri_eve', { Sarge: 'PHIL' }],
        ['sat_mat', { Sarge: 'PHIL' }],
        ['sun_mat', { Sarge: 'PHIL' }]
      ]);
      const wouldViolate = (algorithm as any).wouldViolateBackToBackDoubleDays('PHIL', 'sun_eve');
      expect(wouldViolate).toBe(false);
    });
  });

  describe('RED-day refill and re-validation (Phase 3)', () => {
    const allRolesSet = new Set<string>(allRoles);

    it('every successful generation ships fully-cast shows AND 1 full-day RED per performer', async () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      const showDates = new Map(weekShows.map(s => [s.id, s.date]));

      for (let attempt = 0; attempt < 30; attempt++) {
        const result = await algorithm.autoGenerate();
        if (!result.success) continue;

        // (a) Every show: exactly 8 unique performers filling all 8 roles.
        for (const show of weekShows.filter(s => s.status === 'show')) {
          const stage = result.assignments.filter(a => a.showId === show.id && a.role !== 'OFF');
          const roles = new Set(stage.map(a => a.role));
          const performers = new Set(stage.map(a => a.performer));
          expect(stage.length).toBe(8);
          expect(roles.size).toBe(8);
          expect(performers.size).toBe(8);
          expect([...roles].every(r => allRolesSet.has(r as string))).toBe(true);
        }

        // (b) & (c) Every performer: exactly 1 RED day, and it is a full day off.
        for (const member of defaultCastMembers) {
          const redDates = new Set(
            result.assignments
              .filter(a => a.performer === member.name && a.role === 'OFF' && a.isRedDay)
              .map(a => showDates.get(a.showId))
          );
          expect(redDates.size).toBe(1);

          const redDate = [...redDates][0];
          const worksOnRedDate = result.assignments.some(a =>
            a.performer === member.name && a.role !== 'OFF' && showDates.get(a.showId) === redDate
          );
          expect(worksOnRedDate).toBe(false);
        }
      }
    });

    it('findRefillCandidate returns an eligible, constraint-clean substitute', () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      const tue = weekShows.find(s => s.id === 'tue')!;
      // No one assigned yet; refilling Sarge that PHIL vacated -> SEAN (the only
      // other Sarge-eligible performer).
      const pick = (algorithm as any).findRefillCandidate([], tue, 'Sarge', 'PHIL', {}, new Set());
      expect(pick).toBe('SEAN');
    });

    it('findRefillCandidate returns null when the only substitute is unavailable', () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      const tue = weekShows.find(s => s.id === 'tue')!;
      // SEAN already on stage in this show -> no eligible substitute for Sarge.
      const current = [{ showId: 'tue', role: 'Potato', performer: 'SEAN' }];
      const pick = (algorithm as any).findRefillCandidate(current, tue, 'Sarge', 'PHIL', {}, new Set());
      expect(pick).toBeNull();

      // SEAN's own RED day is this date -> excluded.
      const pick2 = (algorithm as any).findRefillCandidate([], tue, 'Sarge', 'PHIL', { SEAN: tue.date }, new Set());
      expect(pick2).toBeNull();
    });

    it('forced-RED refill: directly exercises assignRedDays when a performer works every date', () => {
      // Three single-show weekdays. PHIL (Sarge-only) is cast every day, so he
      // has NO natural day off and MUST go through the forced-RED + refill path;
      // every other performer gets at least one natural day off. The refill has
      // to move PHIL off one date and substitute SEAN (the only other Sarge) —
      // a fully valid 8-cast schedule, so casting must be preserved afterward.
      const days: Show[] = [
        { id: 'd1', date: '2024-01-02', time: '19:00', callTime: '18:00', status: 'show' },
        { id: 'd2', date: '2024-01-03', time: '19:00', callTime: '18:00', status: 'show' },
        { id: 'd3', date: '2024-01-04', time: '19:00', callTime: '18:00', status: 'show' }
      ];
      const cast = (showId: string, roles: Record<string, string>) =>
        Object.entries(roles).map(([role, performer]) => ({ showId, role: role as Role, performer }));

      const stage = [
        ...cast('d1', { Sarge: 'PHIL', Potato: 'JAMIE', Ringo: 'ADAM', Particle: 'CARY', Mozzie: 'JOE', Who: 'JOSH', Bin: 'MOLLY', Cornish: 'JASMINE' }),
        ...cast('d2', { Sarge: 'PHIL', Potato: 'SEAN', Mozzie: 'JOSE', Particle: 'ADAM', Who: 'JOSH', Ringo: 'CADE', Bin: 'JASMINE', Cornish: 'SERENA' }),
        ...cast('d3', { Sarge: 'PHIL', Potato: 'JAMIE', Particle: 'CARY', Mozzie: 'JOSE', Ringo: 'JOE', Who: 'CADE', Bin: 'MOLLY', Cornish: 'SERENA' })
      ];

      const algorithm = new SchedulingAlgorithm(days, defaultCastMembers);
      const result: any[] = (algorithm as any).assignRedDays(stage);
      const warnings: string[] = (algorithm as any).lastRedDayWarnings;

      // Casting preserved: every show still has 8 unique performers, 8 roles.
      for (const show of days) {
        const onStage = result.filter(a => a.showId === show.id && a.role !== 'OFF');
        expect(onStage.length).toBe(8);
        expect(new Set(onStage.map(a => a.role)).size).toBe(8);
        expect(new Set(onStage.map(a => a.performer)).size).toBe(8);
      }

      // Every performer gets exactly one RED day, and it is a full day off.
      const showDate = new Map(days.map(s => [s.id, s.date]));
      for (const member of defaultCastMembers) {
        const redDates = new Set(result.filter(a => a.performer === member.name && a.role === 'OFF' && a.isRedDay).map(a => showDate.get(a.showId)));
        expect(redDates.size).toBe(1);
        const worksOnRed = result.some(a => a.performer === member.name && a.role !== 'OFF' && showDate.get(a.showId) === [...redDates][0]);
        expect(worksOnRed).toBe(false);
      }
      expect(warnings).toEqual([]);
    });

    it('findRefillCandidate rejects a sub that would create back-to-back doubles', () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      const sunEve = weekShows.find(s => s.id === 'sun_eve')!;
      // SEAN already plays a Saturday double + Sunday matinee. Adding SEAN to
      // Sunday evening makes Sat + Sun both doubles => back-to-back. SEAN is the
      // only Sarge sub besides PHIL, so the candidate is rejected -> null.
      const current = [
        { showId: 'sat_mat', role: 'Potato', performer: 'SEAN' },
        { showId: 'sat_eve', role: 'Potato', performer: 'SEAN' },
        { showId: 'sun_mat', role: 'Potato', performer: 'SEAN' }
      ];
      const pick = (algorithm as any).findRefillCandidate(current, sunEve, 'Sarge', 'PHIL', {}, new Set());
      expect(pick).toBeNull();
    });

    it('findRefillCandidate rejects a sub that would exceed the weekly / consecutive cap', () => {
      const singleWeek: Show[] = ['2024-01-02','2024-01-03','2024-01-04','2024-01-05','2024-01-06','2024-01-07','2024-01-08']
        .map((date, i) => ({ id: `s${i}`, date, time: '19:00', callTime: '18:00', status: 'show' as const }));
      const algorithm = new SchedulingAlgorithm(singleWeek, defaultCastMembers);
      // SEAN already works 6 shows; adding a 7th exceeds the weekly cap of 6.
      const current = singleWeek.slice(0, 6).map(s => ({ showId: s.id, role: 'Potato', performer: 'SEAN' }));
      const pick = (algorithm as any).findRefillCandidate(current, singleWeek[6], 'Sarge', 'PHIL', {}, new Set());
      expect(pick).toBeNull();
    });

    it('pure run counters honor the §0 date rules', () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers);
      // Adjacent dates: 2 (double) + 1 = run of 3.
      expect((algorithm as any).maxConsecutiveFromDateCounts({ '2024-01-02': 2, '2024-01-03': 1 })).toBe(3);
      // Gap day resets: max is a single date's count.
      expect((algorithm as any).maxConsecutiveFromDateCounts({ '2024-01-02': 2, '2024-01-04': 1 })).toBe(2);
      // Adjacent doubles = back-to-back; non-adjacent doubles are not.
      expect((algorithm as any).hasBackToBackDoublesFromDateCounts({ '2024-01-06': 2, '2024-01-07': 2 })).toBe(true);
      expect((algorithm as any).hasBackToBackDoublesFromDateCounts({ '2024-01-05': 2, '2024-01-07': 2 })).toBe(false);
    });
  });

  describe('Manual injury override (Phase 4)', () => {
    const doubleWeekend: Show[] = [
      { id: 'sat_mat', date: '2024-01-06', time: '16:00', callTime: '14:00', status: 'show' },
      { id: 'sat_eve', date: '2024-01-06', time: '21:00', callTime: '18:00', status: 'show' },
      { id: 'sun_mat', date: '2024-01-07', time: '16:00', callTime: '14:30', status: 'show' },
      { id: 'sun_eve', date: '2024-01-07', time: '19:00', callTime: '18:00', status: 'show' }
    ];
    const philAll = (isOverride?: boolean) => doubleWeekend.map(s => ({
      showId: s.id, role: 'Sarge' as Role, performer: 'PHIL', ...(isOverride ? { isOverride: true } : {})
    }));

    it('downgrades a back-to-back-doubles violation to a warning when overridden', () => {
      const algorithm = new SchedulingAlgorithm(doubleWeekend, defaultCastMembers);
      const result = algorithm.validateSchedule(philAll(true));
      expect(result.errors.filter(e => e.includes('back-to-back double days'))).toEqual([]);
      expect(result.warnings.some(w => w.includes('manual override'))).toBe(true);
    });

    it('still reports a back-to-back-doubles ERROR without the override flag (regression)', () => {
      const algorithm = new SchedulingAlgorithm(doubleWeekend, defaultCastMembers);
      const result = algorithm.validateSchedule(philAll(false));
      expect(result.errors.some(e => e.includes('back-to-back double days'))).toBe(true);
    });

    it('downgrades a weekly >6 violation to a warning when overridden', () => {
      const singleWeek: Show[] = ['2024-01-02','2024-01-03','2024-01-04','2024-01-05','2024-01-06','2024-01-07','2024-01-08']
        .map((date, i) => ({ id: `s${i}`, date, time: '19:00', callTime: '18:00', status: 'show' as const }));
      const algorithm = new SchedulingAlgorithm(singleWeek, defaultCastMembers);
      const seven = singleWeek.map(s => ({ showId: s.id, role: 'Sarge' as Role, performer: 'PHIL', isOverride: true }));
      const result = algorithm.validateSchedule(seven);
      expect(result.errors.filter(e => e.includes('exceeds maximum of 6 shows'))).toEqual([]);
      expect(result.warnings.some(w => w.includes('shows this week') && w.includes('manual override'))).toBe(true);
    });

    it('override does NOT bypass casting/eligibility errors', () => {
      const algorithm = new SchedulingAlgorithm(doubleWeekend, defaultCastMembers);
      // PHIL (Sarge-only) flagged as override on the female-only Bin role — the
      // override must not suppress the eligibility error.
      const bad = [{ showId: 'sat_mat', role: 'Bin' as Role, performer: 'PHIL', isOverride: true }];
      const result = algorithm.validateSchedule(bad);
      expect(result.errors.some(e => e.includes('not in eligible roles'))).toBe(true);
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
