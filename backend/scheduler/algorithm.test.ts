import { describe, it, expect, beforeEach } from 'vitest';
import { SchedulingAlgorithm } from './algorithm';
import { Show, CastMember, Role, Assignment, CAST_MEMBERS } from './types';

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

  describe('Structured rule codes (Phase 5)', () => {
    const doubleWeekend: Show[] = [
      { id: 'sat_mat', date: '2024-01-06', time: '16:00', callTime: '14:00', status: 'show' },
      { id: 'sat_eve', date: '2024-01-06', time: '21:00', callTime: '18:00', status: 'show' },
      { id: 'sun_mat', date: '2024-01-07', time: '16:00', callTime: '14:30', status: 'show' },
      { id: 'sun_eve', date: '2024-01-07', time: '19:00', callTime: '18:00', status: 'show' }
    ];

    it('validateSchedule emits structured items alongside the derived error strings', () => {
      const algorithm = new SchedulingAlgorithm(doubleWeekend, defaultCastMembers);
      const assignments = doubleWeekend.map(s => ({ showId: s.id, role: 'Sarge' as Role, performer: 'PHIL' }));
      const result = algorithm.validateSchedule(assignments);
      const b2b = result.items.find(i => i.code === 'BACK_TO_BACK_DOUBLES');
      expect(b2b).toBeTruthy();
      expect(b2b!.severity).toBe('error');
      expect(b2b!.performer).toBe('PHIL');
      // derived view still carries the human-readable message
      expect(result.errors).toContain(b2b!.message);
    });

    it('the retry gate keys off the CODE, not the message text', () => {
      const algorithm = new SchedulingAlgorithm(doubleWeekend, defaultCastMembers) as any;
      // Same code, arbitrarily reworded message -> still critical.
      expect(algorithm.hasCriticalErrors([{ code: 'BACK_TO_BACK_DOUBLES', severity: 'error', message: 'totally different wording' }])).toBe(true);
      // A non-critical code whose message happens to contain the old trigger
      // string -> NOT critical (proves we no longer string-match).
      expect(algorithm.hasCriticalErrors([{ code: 'UNDERUTILIZED', severity: 'warning', message: 'back-to-back double days exactly 8' }])).toBe(false);
      // An overridden fatigue item is warning severity -> not critical.
      expect(algorithm.hasCriticalErrors([{ code: 'BACK_TO_BACK_DOUBLES', severity: 'warning', message: 'override' }])).toBe(false);
    });

    it('closes the eligibility/gender hole: ineligible role assignment is now critical', () => {
      const algorithm = new SchedulingAlgorithm(doubleWeekend, defaultCastMembers) as any;
      // PHIL is not eligible for Bin. The old string-matcher checked
      // "not eligible" and missed the real string "not in eligible roles".
      const result = algorithm.validateSchedule([{ showId: 'sat_mat', role: 'Bin', performer: 'PHIL' }]);
      expect(result.items.some((i: any) => i.code === 'ROLE_INELIGIBLE' && i.severity === 'error')).toBe(true);
      expect(algorithm.hasCriticalErrors(result.items)).toBe(true);
    });

    it('a male performer manually assigned to Bin/Cornish is flagged as a warning, not blocked', () => {
      const algorithm = new SchedulingAlgorithm(doubleWeekend, [
        ...defaultCastMembers,
        { name: 'MALEBIN', eligibleRoles: ['Bin'], gender: 'male' as const }
      ]) as any;
      const result = algorithm.validateSchedule([{ showId: 'sat_mat', role: 'Bin', performer: 'MALEBIN' }]);
      const item = result.items.find((i: any) => i.code === 'GENDER_VIOLATION');
      expect(item).toBeTruthy();
      expect(item!.severity).toBe('warning');
      // The GENDER_VIOLATION item alone must not trip the retry gate (unlike
      // the incomplete-casting errors also present for this partial show).
      expect(algorithm.hasCriticalErrors([item])).toBe(false);
    });
  });

  describe('ignoreUnstartedShows option (clean-slate validation noise fix)', () => {
    const doubleWeekend: Show[] = [
      { id: 'sat_mat', date: '2024-01-06', time: '16:00', callTime: '14:00', status: 'show' },
      { id: 'sat_eve', date: '2024-01-06', time: '21:00', callTime: '18:00', status: 'show' }
    ];

    it('by default (no option) still flags a fully-empty show as CASTING_INCOMPLETE', () => {
      const algorithm = new SchedulingAlgorithm(doubleWeekend, defaultCastMembers);
      const result = algorithm.validateSchedule([]);
      expect(result.items.filter(i => i.code === 'CASTING_INCOMPLETE').length).toBeGreaterThan(0);
    });

    it('with ignoreUnstartedShows, a fully-empty show emits no CASTING_INCOMPLETE', () => {
      const algorithm = new SchedulingAlgorithm(doubleWeekend, defaultCastMembers);
      const result = algorithm.validateSchedule([], { ignoreUnstartedShows: true });
      expect(result.items.filter(i => i.code === 'CASTING_INCOMPLETE').length).toBe(0);
      expect(result.errors.length).toBe(0);
    });

    it('with ignoreUnstartedShows, a show with at least one assignment still flags missing performers/roles', () => {
      const algorithm = new SchedulingAlgorithm(doubleWeekend, defaultCastMembers);
      const result = algorithm.validateSchedule(
        [{ showId: 'sat_mat', role: 'Sarge' as Role, performer: 'PHIL' }],
        { ignoreUnstartedShows: true }
      );
      expect(result.items.some(i => i.code === 'CASTING_INCOMPLETE' && i.showId === 'sat_mat')).toBe(true);
      // The untouched sat_eve show is still suppressed.
      expect(result.items.some(i => i.code === 'CASTING_INCOMPLETE' && i.showId === 'sat_eve')).toBe(false);
    });
  });

  describe('Data-model & consistency hardening (Phase 6)', () => {
    it('isWeekend is timezone-safe (Saturday is Saturday everywhere)', () => {
      const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers) as any;
      // 2026-07-11 is a Saturday; 2026-07-10 a Friday. Old local-time getDay()
      // would shift these by a day in negative-offset zones.
      expect(algorithm.isWeekend('2026-07-11')).toBe(true);
      expect(algorithm.isWeekend('2026-07-12')).toBe(true);  // Sunday
      expect(algorithm.isWeekend('2026-07-10')).toBe(false); // Friday
    });

    it('gender comes from the explicit field, with a role-based fallback for legacy records', () => {
      // Cast WITHOUT a gender field -> female inferred from Bin/Cornish eligibility.
      const legacy = new SchedulingAlgorithm(weekShows, defaultCastMembers) as any;
      expect(legacy.isFemalePerformer('MOLLY')).toBe(true);
      expect(legacy.isFemalePerformer('PHIL')).toBe(false);

      // Cast WITH an explicit gender field -> field wins.
      const gendered = new SchedulingAlgorithm(weekShows, [
        { name: 'ALEX', eligibleRoles: ['Sarge'], gender: 'female' },
        { name: 'PHIL', eligibleRoles: ['Sarge'], gender: 'male' }
      ]) as any;
      expect(gendered.isFemalePerformer('ALEX')).toBe(true);
      expect(gendered.isFemalePerformer('PHIL')).toBe(false);
    });

    it('auto-generation still defaults to a female performer for Bin/Cornish', () => {
      // This governs the auto-generate candidate pool only (see the
      // GENDER_VIOLATION warning tests above for manual assignment, which is
      // allowed as a rare exception).
      const algorithm = new SchedulingAlgorithm(weekShows, [
        ...defaultCastMembers,
        { name: 'MALEBIN', eligibleRoles: ['Bin'], gender: 'male' }
      ]) as any;
      expect(algorithm.isPerformerEligibleForRole('MALEBIN', 'Bin')).toBe(false);
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

  // A show whose time isn't set yet carries time "TBC". The old sort built a
  // Date from `${date}T${time}`, and `new Date("2024-01-04TTBC").getTime()` is
  // NaN. A NaN comparator makes Array.sort return an arbitrary order *silently*,
  // so every consecutive-show and fatigue check downstream reads a week that
  // never existed. These tests pin the order rather than merely asserting no throw.
  describe('TBC show times', () => {
    const orderOf = (algorithm: SchedulingAlgorithm) =>
      (algorithm as any).getSortedActiveShows().map((s: Show) => s.id);

    // The TBC show is fed in FIRST, out of position. A NaN comparator is treated
    // as 0, which leaves an element where it sits — so a broken sort returns it
    // still at the front. Only a real sort walks it into Thursday evening.
    const withTbcFirst = (): Show[] => [
      { id: "thu_tbc", date: "2024-01-04", time: "TBC", callTime: "TBC", status: "show" },
      ...weekShows,
    ];

    it('sorts a mid-week TBC show last within its own day', () => {
      const algorithm = new SchedulingAlgorithm(withTbcFirst(), defaultCastMembers);

      expect(orderOf(algorithm)).toEqual([
        "tue", "wed", "thu", "thu_tbc", "fri", "sat_mat", "sat_eve", "sun_mat", "sun_eve",
      ]);
    });

    it('returns the same order on a second call (the sort is memoised)', () => {
      const algorithm = new SchedulingAlgorithm(withTbcFirst(), defaultCastMembers);
      const first = orderOf(algorithm);
      expect(orderOf(algorithm)).toEqual(first);
      expect(first[3]).toBe("thu_tbc");
    });

    it('leaves an all-known-times week in the order it always had', () => {
      const shuffled = [weekShows[5], weekShows[0], weekShows[7], weekShows[2],
                        weekShows[4], weekShows[1], weekShows[6], weekShows[3]];
      const algorithm = new SchedulingAlgorithm(shuffled, defaultCastMembers);
      expect(orderOf(algorithm)).toEqual([
        "tue", "wed", "thu", "fri", "sat_mat", "sat_eve", "sun_mat", "sun_eve",
      ]);
    });

    it('never leaks the string "Invalid Date" into a user-facing message', () => {
      const format = (date: string, time: string) =>
        (new SchedulingAlgorithm(weekShows, defaultCastMembers) as any)
          .formatDateForValidation(date, time) as string;

      for (const unknown of ["TBC", ""]) {
        expect(format("2024-01-04", unknown)).not.toContain("Invalid Date");
      }
      expect(format("2024-01-04", "TBC")).toContain("TBC");
    });
  });

  describe('Gap-fill auto-generate (preserve manual picks)', () => {
    it('fills only empty slots, preserving a manual stage pick and a manual RED day', async () => {
      // Manual picks placed by the user before pressing Auto-Generate:
      //  - CADE locked into "Who" on Wednesday (a stage pick)
      //  - SEAN given a manual RED day on Tuesday (OFF all day)
      const existing: Assignment[] = [
        { showId: "wed", role: "Who", performer: "CADE", isRedDay: false },
        { showId: "tue", role: "OFF", performer: "SEAN", isRedDay: true },
      ];

      // Run several times: gap-fill must hold on every attempt, not just by luck.
      for (let attempt = 0; attempt < 10; attempt++) {
        const algorithm = new SchedulingAlgorithm(weekShows, defaultCastMembers, existing);
        const result = await algorithm.autoGenerate();

        expect(result.success).toBe(true);

        // 1. The locked stage pick survives unchanged.
        const wedWho = result.assignments.find(a => a.showId === "wed" && a.role === "Who");
        expect(wedWho?.performer).toBe("CADE");

        // 2. Every active show is fully cast (all 8 stage roles).
        for (const show of weekShows) {
          const roles = new Set(
            result.assignments.filter(a => a.showId === show.id && a.role !== "OFF").map(a => a.role)
          );
          expect(roles.size).toBe(allRoles.length);
        }

        // 3. SEAN's manual RED day is honoured: no stage role on Tuesday, and a
        //    RED marker on the Tuesday show.
        const seanTueStage = result.assignments.filter(
          a => a.showId === "tue" && a.role !== "OFF" && a.performer === "SEAN"
        );
        expect(seanTueStage.length).toBe(0);
        const seanTueRed = result.assignments.find(
          a => a.showId === "tue" && a.role === "OFF" && a.performer === "SEAN" && a.isRedDay === true
        );
        expect(seanTueRed).toBeDefined();

        // 4. Every performer still ends with exactly one RED day (fairness rule).
        for (const member of defaultCastMembers) {
          const redDates = new Set(
            result.assignments
              .filter(a => a.role === "OFF" && a.isRedDay === true && a.performer === member.name)
              .map(a => weekShows.find(s => s.id === a.showId)!.date)
          );
          expect(redDates.size).toBe(1);
        }

        // 5. SEAN's single RED day is specifically Tuesday (the manual choice).
        const seanRedDate = result.assignments
          .filter(a => a.role === "OFF" && a.isRedDay === true && a.performer === "SEAN")
          .map(a => weekShows.find(s => s.id === a.showId)!.date)[0];
        expect(seanRedDate).toBe("2024-01-02");
      }
    });
  });
});

describe('M3 — nominated company RED day', () => {
  // 4 show dates only (Tue double, Thu single, Fri double, Sat double), plus a
  // Sunday day off. Right at (or just under) the v3.1 fairness path's
  // capacity for seating all 12 individual RED days: which of the 100
  // randomized attempts happens to seat the most varies run to run, so this
  // fixture exercises the flagged path deterministically, and the unflagged
  // path's bestAttempt fallback (bug 2) probabilistically — it reliably
  // produces near-misses without asserting an exact, un-reproducible count.
  const sparseWeek = (): Show[] => ([
    { id: "tue1", date: "2024-01-02", time: "15:00", callTime: "13:30", status: "show" },
    { id: "tue2", date: "2024-01-02", time: "20:00", callTime: "18:00", status: "show" },
    { id: "thu1", date: "2024-01-04", time: "20:00", callTime: "18:00", status: "show" },
    { id: "fri1", date: "2024-01-05", time: "15:00", callTime: "13:30", status: "show" },
    { id: "fri2", date: "2024-01-05", time: "20:00", callTime: "18:00", status: "show" },
    { id: "sat1", date: "2024-01-06", time: "15:00", callTime: "13:30", status: "show" },
    { id: "sat2", date: "2024-01-06", time: "20:00", callTime: "18:00", status: "show" },
    { id: "sun", date: "2024-01-07", time: "00:00", callTime: "00:00", status: "dayoff" },
  ]);

  const redDatesFor = (assignments: Assignment[], shows: Show[], performer: string): Set<string> => {
    const dateById = new Map(shows.map(s => [s.id, s.date]));
    return new Set(
      assignments
        .filter(a => a.performer === performer && a.role === 'OFF' && a.isRedDay)
        .map(a => dateById.get(a.showId))
        .filter((d): d is string => !!d)
    );
  };

  it('flagged: the Sunday day off is everyone\'s RED day, none of the 12 get an individual one', async () => {
    const shows = sparseWeek().map(s => s.id === 'sun' ? { ...s, isCompanyRedDay: true } : s);
    const algorithm = new SchedulingAlgorithm(shows, CAST_MEMBERS);
    const result = await algorithm.autoGenerate();
    expect(result.success).toBe(true);

    // The company RED day is DERIVED from the flag, not stored: generating from
    // blank writes no RED rows at all (there are no dormant picks to preserve).
    for (const member of CAST_MEMBERS) {
      expect([...redDatesFor(result.assignments, shows, member.name)]).toEqual([]);
    }
    // ...and the derivation is what makes that correct — every performer reads
    // as covered, so nobody is flagged missing a RED day.
    const validation = algorithm.validateSchedule(result.assignments);
    expect(validation.items.filter(i => i.code.startsWith('RED_DAY'))).toEqual([]);

    // Every show is still fully cast — flagging the day off takes it out of
    // the fairness path entirely, so capacity is a non-issue here.
    for (const show of shows.filter(s => s.status === 'show')) {
      const stage = result.assignments.filter(a => a.showId === show.id && a.role !== 'OFF');
      expect(new Set(stage.map(a => a.performer)).size).toBe(8);
    }
  });

  it('unflagged: ships a fully-cast schedule even on a near-miss, instead of degrading to a relaxed partial one (bug 2)', async () => {
    const shows = sparseWeek(); // Sunday day off present but NOT flagged
    const algorithm = new SchedulingAlgorithm(shows, CAST_MEMBERS);
    const result = await algorithm.autoGenerate();
    expect(result.success).toBe(true);

    const seated = CAST_MEMBERS.filter(m => redDatesFor(result.assignments, shows, m.name).size === 1).length;
    expect(seated).toBeLessThanOrEqual(12);
    // Fewer than 12 seated can only ship (as success:true) via the bestAttempt
    // fallback, which always carries its RED-day warnings; a lucky attempt
    // that happens to seat all 12 carries none. Both are valid outcomes of
    // the same 100-attempt loop — assert the invariant that holds either way.
    if (seated < 12) {
      expect(result.warnings?.some(w => w.includes('Could not create a RED day'))).toBe(true);
    }

    // The critical proof this isn't generatePartialSchedule()'s relaxed
    // fallback: every show is still fully cast with 8 unique performers,
    // regardless of how many RED days got seated.
    for (const show of shows.filter(s => s.status === 'show')) {
      const stage = result.assignments.filter(a => a.showId === show.id && a.role !== 'OFF');
      expect(stage.length).toBe(8);
      expect(new Set(stage.map(a => a.performer)).size).toBe(8);
    }
  });

  it('never reorders the caller\'s shows array (detectCompanyRedDate sorts a copy)', async () => {
    // Deliberately out of date order: the earlier-dated day off (Tue) is last.
    const shows: Show[] = [
      { id: "fri", date: "2024-01-05", time: "00:00", callTime: "00:00", status: "dayoff" },
      { id: "wed", date: "2024-01-03", time: "19:30", callTime: "18:00", status: "show" },
      { id: "tue", date: "2024-01-02", time: "00:00", callTime: "00:00", status: "dayoff", isCompanyRedDay: true },
    ];
    const originalOrder = shows.map(s => s.id);
    const algorithm = new SchedulingAlgorithm(shows, CAST_MEMBERS);
    await algorithm.autoGenerate();
    expect(shows.map(s => s.id)).toEqual(originalOrder);
  });

  it('more than one day off flagged (hand-edited data): uses the earliest and warns rather than trusting it', async () => {
    const shows: Show[] = [
      { id: "tue", date: "2024-01-02", time: "00:00", callTime: "00:00", status: "dayoff", isCompanyRedDay: true },
      { id: "wed", date: "2024-01-03", time: "19:30", callTime: "18:00", status: "show" },
      { id: "thu", date: "2024-01-04", time: "19:30", callTime: "18:00", status: "show" },
      { id: "fri", date: "2024-01-05", time: "00:00", callTime: "00:00", status: "dayoff", isCompanyRedDay: true },
      { id: "sat_mat", date: "2024-01-06", time: "14:00", callTime: "12:30", status: "show" },
      { id: "sat_eve", date: "2024-01-06", time: "19:30", callTime: "18:00", status: "show" },
      { id: "sun_mat", date: "2024-01-07", time: "14:00", callTime: "12:30", status: "show" },
      { id: "sun_eve", date: "2024-01-07", time: "19:30", callTime: "18:00", status: "show" },
    ];
    const algorithm = new SchedulingAlgorithm(shows, CAST_MEMBERS);
    const result = await algorithm.autoGenerate();
    expect(result.success).toBe(true);

    // Earliest flagged day off (Tue) wins. It is derived, so — as above —
    // nothing is stored, and every performer still reads as covered.
    for (const member of CAST_MEMBERS) {
      expect([...redDatesFor(result.assignments, shows, member.name)]).toEqual([]);
    }
    const validation = algorithm.validateSchedule(result.assignments);
    expect(validation.items.filter(i => i.code.startsWith('RED_DAY'))).toEqual([]);

    expect(result.warnings?.some(w => w.includes('More than one day off is flagged'))).toBe(true);
  });
});

// The derived rule: a performer's effective RED date is the company RED date if
// the week has one, else the date of their own isRedDay OFF row. Nothing is
// stored for a company RED day, and individual flags go DORMANT rather than
// being cleared — so removing the day off restores the week exactly.
describe('derived RED days', () => {
  const week = (): Show[] => ([
    { id: "tue", date: "2024-01-02", time: "19:30", callTime: "18:00", status: "show" },
    { id: "wed", date: "2024-01-03", time: "19:30", callTime: "18:00", status: "show" },
    { id: "thu", date: "2024-01-04", time: "19:30", callTime: "18:00", status: "show" },
    { id: "fri", date: "2024-01-05", time: "00:00", callTime: "00:00", status: "dayoff" },
    { id: "sat_mat", date: "2024-01-06", time: "14:00", callTime: "12:30", status: "show" },
    { id: "sat_eve", date: "2024-01-06", time: "19:30", callTime: "18:00", status: "show" },
    { id: "sun_mat", date: "2024-01-07", time: "14:00", callTime: "12:30", status: "show" },
    { id: "sun_eve", date: "2024-01-07", time: "19:30", callTime: "18:00", status: "show" },
  ]);

  const flagFriday = (shows: Show[]): Show[] =>
    shows.map(s => s.id === 'fri' ? { ...s, isCompanyRedDay: true } : s);

  const redItems = (result: { items: Array<{ code: string; severity: string }> }) =>
    result.items.filter(i => i.code.startsWith('RED_DAY'));

  const redDateFor = (assignments: Assignment[], shows: Show[], performer: string): string[] => {
    const dateById = new Map(shows.map(s => [s.id, s.date]));
    return [...new Set(
      assignments
        .filter(a => a.performer === performer && a.role === 'OFF' && a.isRedDay)
        .map(a => dateById.get(a.showId))
        .filter((d): d is string => !!d)
    )];
  };

  // Stale individual flags, shaped so that reading them trips ALL THREE
  // downstream RED rules. A validator still driven by the stored flags cannot
  // pass this; one driven by the derivation sees none of it.
  //   PHIL  — flagged on two dates          -> RED_DAY_MULTIPLE
  //   SEAN  — flagged on tue, but cast on tue -> RED_DAY_NOT_FULL_DAY
  //   the other 10 — no flag at all         -> RED_DAY_MISSING
  const staleIndividualReds = (): Assignment[] => [
    { showId: 'tue', role: 'OFF', performer: 'PHIL', isRedDay: true },
    { showId: 'wed', role: 'OFF', performer: 'PHIL', isRedDay: true },
    { showId: 'tue', role: 'OFF', performer: 'SEAN', isRedDay: true },
    { showId: 'tue', role: 'Sarge', performer: 'SEAN' },
  ];

  describe('Step 1 — validateSchedule derives the rule', () => {
    it('a company RED day covers every performer, ignoring stale individual flags', () => {
      const shows = flagFriday(week());
      const algorithm = new SchedulingAlgorithm(shows, CAST_MEMBERS);

      const result = algorithm.validateSchedule(staleIndividualReds());

      // Everyone's RED day is the Friday, derived. The stale flags are dormant:
      // PHIL's two raise no MULTIPLE, SEAN's raises no NOT_FULL_DAY even though
      // he is cast that day, and the ten unflagged performers are not MISSING.
      expect(redItems(result)).toEqual([]);
    });

    it('without a company RED day, individual flags still drive RED days (regression guard)', () => {
      const shows = week(); // Friday is a day off, but NOT flagged
      const algorithm = new SchedulingAlgorithm(shows, CAST_MEMBERS);

      // Same assignments as above. The ONLY difference is the company RED flag,
      // so this pins the derivation as the cause of the silence up there — all
      // three rules fire on the untouched path.
      const result = algorithm.validateSchedule(staleIndividualReds());

      expect(result.items.some(i => i.code === 'RED_DAY_MULTIPLE' && i.performer === 'PHIL')).toBe(true);
      expect(result.items.some(i => i.code === 'RED_DAY_NOT_FULL_DAY' && i.performer === 'SEAN')).toBe(true);
      expect(result.items.filter(i => i.code === 'RED_DAY_MISSING')).toHaveLength(CAST_MEMBERS.length - 2);
    });
  });

  describe('Steps 2 & 3 — dormant flags survive generation, and stop constraining it', () => {
    const isRed = (assignments: Assignment[], performer: string, showId: string) =>
      assignments.some(a => a.performer === performer && a.showId === showId && a.role === 'OFF' && a.isRedDay === true);

    const castAs = (assignments: Assignment[], showId: string, role: string) =>
      assignments.find(a => a.showId === showId && a.role === role)?.performer;

    // Tuesday fully cast by the eight performers who are NOT the subject of the
    // test, so the subject is guaranteed OFF that day (locked picks survive the
    // per-attempt reset). Leaves PHIL, JOE, CADE, SERENA off on Tuesday.
    const tuesdayCastWithoutPhil = (): Assignment[] => [
      { showId: 'tue', role: 'Sarge', performer: 'SEAN' },
      { showId: 'tue', role: 'Potato', performer: 'JAMIE' },
      { showId: 'tue', role: 'Mozzie', performer: 'JOSE' },
      { showId: 'tue', role: 'Ringo', performer: 'ADAM' },
      { showId: 'tue', role: 'Particle', performer: 'CARY' },
      { showId: 'tue', role: 'Bin', performer: 'MOLLY' },
      { showId: 'tue', role: 'Cornish', performer: 'JASMINE' },
      { showId: 'tue', role: 'Who', performer: 'JOSH' },
    ];

    it('preserves dormant individual RED days when a company RED day is set', async () => {
      // THE STEP 3 REGRESSION. Before this change Branch A cleared every
      // individual isRedDay, so auto-generating with a company RED day set
      // destroyed the picks permanently — remove the day off afterwards and all
      // twelve performers had no RED day, with no way back.
      const seeded: Assignment[] = [
        ...tuesdayCastWithoutPhil(),
        { showId: 'tue', role: 'OFF', performer: 'PHIL', isRedDay: true },
      ];
      const shows = flagFriday(week());
      const algorithm = new SchedulingAlgorithm(shows, CAST_MEMBERS, seeded);

      const result = await algorithm.autoGenerate();
      expect(result.success).toBe(true);

      // PHIL's Tuesday pick is dormant, not deleted: it is still on the OFF row,
      // ready to come back the moment the Friday day off is removed.
      expect(isRed(result.assignments, 'PHIL', 'tue')).toBe(true);
    });

    it('drops a dormant RED day the generator cast over, without resurrecting it onto the other show of a two-show day', async () => {
      // PHIL is cast on the Saturday MATINEE but carries a dormant RED day on
      // that same date. He is not cast in the evening (SEAN holds the only role
      // PHIL can play), so he takes an OFF row there — and the naive
      // `dormant === show.date` test would happily stamp isRedDay onto it.
      // A restored RED day on a date he is working is un-restorable state.
      const seeded: Assignment[] = [
        { showId: 'sat_mat', role: 'Sarge', performer: 'PHIL' },
        { showId: 'sat_eve', role: 'Sarge', performer: 'SEAN' },
        { showId: 'sat_mat', role: 'OFF', performer: 'PHIL', isRedDay: true },
      ];
      const shows = flagFriday(week());
      const algorithm = new SchedulingAlgorithm(shows, CAST_MEMBERS, seeded);

      const result = await algorithm.autoGenerate();
      expect(result.success).toBe(true);

      // He really is cast in the matinee and OFF in the evening — the setup the
      // guard exists for, not a vacuous pass.
      expect(castAs(result.assignments, 'sat_mat', 'Sarge')).toBe('PHIL');
      expect(result.assignments.some(a => a.performer === 'PHIL' && a.showId === 'sat_eve' && a.role === 'OFF')).toBe(true);

      // The dormant flag is gone entirely — not on the matinee, and crucially
      // not displaced onto the evening.
      expect(isRed(result.assignments, 'PHIL', 'sat_eve')).toBe(false);
      expect(result.assignments.some(a => a.performer === 'PHIL' && a.isRedDay === true)).toBe(false);
    });

    it('a dormant RED date does not keep a performer off stage under a company RED day', async () => {
      // THE STEP 2 BYPASS. SEAN is locked into Potato on Tuesday, so Sarge that
      // day can only be filled by PHIL — who carries a dormant RED day on it.
      // While the company RED day is active that pick means nothing, so PHIL
      // must be castable; leaving him off stage would narrow the pool for a
      // reason that no longer applies.
      const seeded: Assignment[] = [
        { showId: 'tue', role: 'Potato', performer: 'SEAN' },
        { showId: 'tue', role: 'OFF', performer: 'PHIL', isRedDay: true },
      ];

      const withCompanyRed = new SchedulingAlgorithm(flagFriday(week()), CAST_MEMBERS, seeded);
      const result = await withCompanyRed.autoGenerate();
      expect(result.success).toBe(true);
      expect(castAs(result.assignments, 'tue', 'Sarge')).toBe('PHIL');

      // The counterpart: with no company RED day the pick is live again, so the
      // constraint holds and PHIL stays off stage on his RED date. Same seed,
      // same week — only the flag differs, which is what makes the assertion
      // above attributable to it.
      const noCompanyRed = new SchedulingAlgorithm(week(), CAST_MEMBERS, seeded);
      const plain = await noCompanyRed.autoGenerate();
      expect(plain.assignments.some(
        a => a.showId === 'tue' && a.role !== 'OFF' && a.performer === 'PHIL',
      )).toBe(false);
    });
  });
});

// The OVERWORKED warning compares a performer's show count against the week's
// FAIR SHARE. Fair share is not shows/cast — every show puts `roles.length`
// performers on stage, so a 12-strong company covering an 8-show week averages
// 8 * 8 / 12 = 5.33 shows each, not 0.67.
describe('OVERWORKED warning — fair share is per STAGE SLOT, not per show', () => {
  const standardWeek = (): Show[] => ([
    { id: "tue", date: "2024-01-02", time: "19:30", callTime: "18:00", status: "show" },
    { id: "wed", date: "2024-01-03", time: "19:30", callTime: "18:00", status: "show" },
    { id: "thu", date: "2024-01-04", time: "19:30", callTime: "18:00", status: "show" },
    { id: "fri", date: "2024-01-05", time: "19:30", callTime: "18:00", status: "show" },
    { id: "sat_mat", date: "2024-01-06", time: "14:00", callTime: "12:30", status: "show" },
    { id: "sat_eve", date: "2024-01-06", time: "19:30", callTime: "18:00", status: "show" },
    { id: "sun_mat", date: "2024-01-07", time: "14:00", callTime: "12:30", status: "show" },
    { id: "sun_eve", date: "2024-01-07", time: "19:30", callTime: "18:00", status: "show" },
  ]);

  it('a balanced, fully-cast standard week warns NOBODY as overworked', async () => {
    // THE REGRESSION. The old threshold was ceil((8 shows / 12 cast) * 1.5) = 1,
    // so every performer with 2+ shows was "potentially overworked" — all twelve
    // of them, in a perfectly legal, evenly-balanced week. Pure noise, and it sat
    // next to the RED-day section making a clean schedule look broken.
    const shows = standardWeek();
    const algorithm = new SchedulingAlgorithm(shows, CAST_MEMBERS);
    const result = await algorithm.autoGenerate();
    expect(result.success).toBe(true);

    const validation = algorithm.validateSchedule(result.assignments);
    expect(validation.items.filter(i => i.code === 'OVERWORKED')).toEqual([]);

    // Not vacuous: the schedule really is full, and people really do work most
    // of the week (5-6 shows each) — they are simply not overworked doing so.
    expect(result.assignments.filter(a => a.role !== 'OFF')).toHaveLength(8 * 8);
    const counts = CAST_MEMBERS.map(m =>
      new Set(result.assignments.filter(a => a.performer === m.name && a.role !== 'OFF').map(a => a.showId)).size);
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(5);
  });

  it('still fires for a performer genuinely working past the fair share', async () => {
    // A 16-strong company over 6 shows: fair share is 6 * 8 / 16 = 3 shows, so
    // the threshold is ceil(3 * 1.5) = 4. PHIL plays every one of the 6 — well
    // past his share, and without tripping the hard weekly cap of 6.
    const shows = standardWeek().slice(0, 6);
    const bigCast: CastMember[] = [
      ...CAST_MEMBERS,
      { name: "EXTRA1", eligibleRoles: ["Sarge", "Potato"] },
      { name: "EXTRA2", eligibleRoles: ["Ringo", "Who"] },
      { name: "EXTRA3", eligibleRoles: ["Mozzie", "Particle"] },
      { name: "EXTRA4", eligibleRoles: ["Bin", "Cornish"] },
    ];
    const algorithm = new SchedulingAlgorithm(shows, bigCast);

    const assignments: Assignment[] = shows.map(s => ({ showId: s.id, role: 'Sarge', performer: 'PHIL' }));
    const validation = algorithm.validateSchedule(assignments);

    expect(validation.items.some(i => i.code === 'OVERWORKED' && i.performer === 'PHIL')).toBe(true);
  });
});
