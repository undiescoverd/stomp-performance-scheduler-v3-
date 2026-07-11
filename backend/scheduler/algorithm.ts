import { Role, Show, Assignment, CastMember, FEMALE_ONLY_ROLES } from "./types";
import { areDatesConsecutive } from "./date_rules";
import { TBC, isKnownTime, showSortKey } from "./time";

export interface AutoGenerateResult {
  success: boolean;
  assignments: Assignment[];
  errors?: string[];
  warnings?: string[];
  dayOffStats?: Record<string, number>;
  generationId?: string;
  generatedAt?: string;
}

// Stable, message-independent identity for each validation rule. Generation
// retry decisions and any UI branching key off these codes, never off the
// human-readable message text (which may be reworded freely).
export type RuleCode =
  | "CASTING_INCOMPLETE" | "CASTING_DUPLICATE" | "ROLE_INELIGIBLE" | "GENDER_VIOLATION"
  | "CONSECUTIVE_EXCEEDED" | "BACK_TO_BACK_DOUBLES" | "WEEKLY_LIMIT_EXCEEDED"
  | "RED_DAY_MULTIPLE" | "RED_DAY_NOT_FULL_DAY" | "RED_DAY_MISSING"
  | "OVERRIDE_ACKNOWLEDGED" | "UNDERUTILIZED" | "OVERWORKED" | "CONSECUTIVE_DAYS_OFF";

export interface ValidationItem {
  code: RuleCode;
  severity: "error" | "warning";
  message: string;
  performer?: string;
  showId?: string;
}

// Codes that make a generated schedule unusable (must retry / cannot ship).
// Deliberately excludes RED_DAY_* (RED assignment is a separate post-pass with
// its own retry signal) and the soft advisory codes. GENDER_VIOLATION is also
// excluded: Bin/Cornish are typically cast with a female performer, but that's
// a casting convention, not a hard rule, so a mismatch is a warning, not an
// error.
const CRITICAL_RULE_CODES: ReadonlySet<RuleCode> = new Set<RuleCode>([
  "CASTING_INCOMPLETE", "CASTING_DUPLICATE", "ROLE_INELIGIBLE",
  "CONSECUTIVE_EXCEEDED", "BACK_TO_BACK_DOUBLES", "WEEKLY_LIMIT_EXCEEDED"
]);

export interface ConstraintResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  items: ValidationItem[];
}

interface ShowAssignment {
  [role: string]: string;
}

interface ConsecutiveSequence {
  startIndex: number;
  endIndex: number;
  count: number;
  startDate: string;
  endDate: string;
}

interface PerformerShowData {
  showIndexes: Set<number>;
  sortedShows: Array<{ show: Show; index: number }>;
  maxConsecutive: number;
  sequences: ConsecutiveSequence[];
}

export class SchedulingAlgorithm {
  private shows: Show[];
  private assignments: Map<string, ShowAssignment>;
  private castMembers: CastMember[];
  private roles: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];
  private offAssignments: Map<string, string[]> = new Map();
  
  // Warnings produced by the most recent assignRedDays() call (e.g. a performer
  // whose forced RED day could not be created without breaking casting).
  private lastRedDayWarnings: string[] = [];

  // Manual picks seeded from an existing (partially-filled) grid so that
  // Auto-Generate fills only EMPTY slots and never vacates a user's pick.
  // Both stay empty unless the caller passes existingAssignments, so every
  // code path below is byte-for-byte identical to today when nothing is locked.
  private lockedCells: Set<string> = new Set();            // `${showId}:${role}`
  private lockedRedDates: Map<string, string> = new Map(); // performer -> RED date (YYYY-MM-DD)

  // How many shows in the current generation attempt fell back from fair
  // OFF-selection to the random old logic (day-off fairness may be reduced).
  private fairnessFallbackCount = 0;

  // Cached data structures for performance
  private _sortedActiveShows: Show[] | null = null;
  private _showIndexMap: Map<string, number> | null = null;
  private _performerShowCache: Map<string, PerformerShowData> | null = null;
  // Identity of the assignments array the cache above was computed from —
  // assignRedDays returns a new array, so keying on reference means the
  // pre-RED and post-RED validateSchedule calls never share a stale cache.
  private _performerShowCacheKey: Assignment[] | null = null;

  // Fisher-Yates shuffle for proper randomization
  private shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  constructor(shows: Show[], castMembers?: CastMember[], existingAssignments?: Assignment[]) {
    this.shows = shows;
    this.assignments = new Map();
    this.offAssignments = new Map();

    this.castMembers = castMembers || [];

    // Initialize empty assignments for all shows
    shows.forEach(show => {
      const showAssignment: ShowAssignment = {};
      this.roles.forEach(role => {
        showAssignment[role] = "";
      });
      this.assignments.set(show.id, showAssignment);
      this.offAssignments.set(show.id, []);
    });

    // Seed any manual picks (gap-fill mode). Skipped entirely for the 2-arg
    // callers (validate.ts, tests) so their behaviour is unchanged.
    if (existingAssignments?.length) {
      this.seedAssignments(existingAssignments);
    }
  }

  // Seed manual picks from a partially-filled grid into internal state and mark
  // them "locked" so gap-fill preserves them. Stage roles go into the
  // assignments map + lockedCells; manual RED days (OFF + isRedDay) are pinned
  // in lockedRedDates. Non-RED OFF records are derived downstream, so ignored.
  private seedAssignments(existing: Assignment[]): void {
    for (const a of existing) {
      if (a.role === 'OFF') {
        if (a.isRedDay === true && a.performer) {
          const show = this.shows.find(s => s.id === a.showId);
          if (show) {
            this.lockedRedDates.set(a.performer, show.date);
          }
        }
        continue;
      }

      if (!a.performer) continue;
      const show = this.shows.find(s => s.id === a.showId);
      if (!show || show.status !== 'show') continue;
      if (!this.roles.includes(a.role as Role)) continue;

      const showAssignment = this.assignments.get(a.showId);
      if (!showAssignment) continue;
      showAssignment[a.role] = a.performer;
      this.lockedCells.add(`${a.showId}:${a.role}`);
    }
  }

  // Clear caches when data changes
  private clearCaches(): void {
    this._sortedActiveShows = null;
    this._showIndexMap = null;
    this._performerShowCache = null;
    this._performerShowCacheKey = null;
  }

  // Get sorted active shows with caching
  private getSortedActiveShows(): Show[] {
    if (this._sortedActiveShows === null) {
      // showSortKey, not a Date difference: a TBC show yields an Invalid Date,
      // whose NaN comparator silently leaves the sort in an arbitrary order.
      this._sortedActiveShows = this.shows
        .filter(show => show.status === "show")
        .sort((a, b) => showSortKey(a.date, a.time).localeCompare(showSortKey(b.date, b.time)));
    }
    return this._sortedActiveShows;
  }

  // Get show index mapping with caching
  private getShowIndexMap(): Map<string, number> {
    if (this._showIndexMap === null) {
      this._showIndexMap = new Map();
      const sortedShows = this.getSortedActiveShows();
      sortedShows.forEach((show, index) => {
        this._showIndexMap!.set(show.id, index);
      });
    }
    return this._showIndexMap;
  }

  // =====================================
  // Day-Off Tracking Utility Functions
  // =====================================

  private getPerformerDaysOff(assignments: Assignment[]): Record<string, string[]> {
    const performerDaysOff: Record<string, string[]> = {};
    const showsByDate: Record<string, Show[]> = {};
    
    // Group shows by date
    this.shows.filter(s => s.status === 'show').forEach(show => {
      if (!showsByDate[show.date]) showsByDate[show.date] = [];
      showsByDate[show.date].push(show);
    });
    
    // Track which dates each performer is completely off
    this.castMembers.forEach(member => {
      performerDaysOff[member.name] = [];
      
      for (const date in showsByDate) {
        const showsOnDate = showsByDate[date];
        const performerAssignmentsOnDate = assignments.filter(a => 
          a.performer === member.name && 
          showsOnDate.some(s => s.id === a.showId)
        );
        
        // If performer has no assignments on this date, they're off
        if (performerAssignmentsOnDate.length === 0) {
          performerDaysOff[member.name].push(date);
        }
      }
    });
    
    return performerDaysOff;
  }

  // The one day off nominated to carry the whole company's RED day, or null
  // when none is — the v3.1 fairness path then gives each performer their
  // own. Filters on the isCompanyRedDay flag, not merely status === 'dayoff':
  // a week can hold several days off (a loading day after a mid-week travel
  // day), and only one may be marked. Maps to plain date strings before
  // sorting so this never mutates this.shows or the array `filter` returned.
  private detectCompanyRedDate(): string | null {
    const flagged = this.shows
      .filter(s => s.status === 'dayoff' && s.isCompanyRedDay === true)
      .map(s => s.date)
      .sort();
    return flagged.length > 0 ? flagged[0] : null;
  }

  private findConsecutiveDoubleDays(): Array<{startDate: string, endDate: string, showIds: string[]}> {
    const consecutiveDoubles: Array<{startDate: string, endDate: string, showIds: string[]}> = [];
    const showsByDate: Record<string, Show[]> = {};
    
    this.shows.filter(s => s.status === 'show').forEach(show => {
      if (!showsByDate[show.date]) showsByDate[show.date] = [];
      showsByDate[show.date].push(show);
    });
    
    const dates = Object.keys(showsByDate).sort();
    
    for (let i = 0; i < dates.length - 1; i++) {
      const currentDate = dates[i];
      const nextDate = dates[i + 1];
      
      // Check if consecutive days
      const d1 = new Date(currentDate + 'T12:00:00Z');
      const d2 = new Date(nextDate + 'T12:00:00Z');
      const dayDiff = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
      
      if (dayDiff === 1 && 
          showsByDate[currentDate].length >= 2 && 
          showsByDate[nextDate].length >= 2) {
        consecutiveDoubles.push({
          startDate: currentDate,
          endDate: nextDate,
          showIds: [
            ...showsByDate[currentDate].map(s => s.id),
            ...showsByDate[nextDate].map(s => s.id)
          ]
        });
      }
    }
    
    return consecutiveDoubles;
  }

  private hasConsecutiveDaysOff(performer: string, showId: string, currentAssignments: Map<string, Record<string, string>>): boolean {
    const show = this.shows.find(s => s.id === showId);
    if (!show) return false;
    
    // Get all dates where performer is OFF
    const offDates: string[] = [];
    
    for (const [assignedShowId, roleAssignments] of currentAssignments) {
      const assignedShow = this.shows.find(s => s.id === assignedShowId);
      if (!assignedShow || assignedShow.status !== 'show') continue;
      
      // Check if performer is assigned to this show
      const isAssigned = Object.values(roleAssignments).includes(performer);
      if (!isAssigned) {
        // Check if this is a show day (not a day off status)
        const showsOnDate = this.shows.filter(s => 
          s.date === assignedShow.date && s.status === 'show'
        );
        
        // If performer isn't assigned to any shows on this date
        const performerShowsOnDate = showsOnDate.filter(s => {
          const assignments = currentAssignments.get(s.id);
          return assignments && Object.values(assignments).includes(performer);
        });
        
        if (performerShowsOnDate.length === 0 && !offDates.includes(assignedShow.date)) {
          offDates.push(assignedShow.date);
        }
      }
    }
    
    // Add the current show date if performer would be OFF
    if (!offDates.includes(show.date)) {
      offDates.push(show.date);
    }
    
    // Sort dates and check for consecutive days
    offDates.sort();
    
    for (let i = 0; i < offDates.length - 1; i++) {
      const d1 = new Date(offDates[i] + 'T12:00:00Z');
      const d2 = new Date(offDates[i + 1] + 'T12:00:00Z');
      const dayDiff = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
      
      if (dayDiff === 1) {
        return true; // Found consecutive days off
      }
    }
    
    return false;
  }

  // =====================================
  // Enhanced OFF Selection Logic
  // =====================================

  private selectOffMembersWithFairness(showId: string): string[] {
    const show = this.shows.find(s => s.id === showId);
    if (!show || show.status !== 'show') return [];
    
    const companyRedDate = this.detectCompanyRedDate();
    const consecutiveDoubles = this.findConsecutiveDoubleDays();
    
    // Get all performers assigned to this show
    const assignedToShow = new Set<string>();
    const showAssignment = this.assignments.get(showId);
    if (showAssignment) {
      Object.values(showAssignment).forEach(performer => {
        if (performer) assignedToShow.add(performer);
      });
    }
    
    // Get all performers (we'll select 4 to be OFF from those not assigned)
    const eligibleForOff = this.castMembers
      .map(m => m.name)
      .filter(name => !assignedToShow.has(name));
    
    // If we don't have enough unassigned performers, fallback
    if (eligibleForOff.length < 4) {
      return eligibleForOff; // Return whatever we have
    }
    
    // Calculate statistics for each performer
    const performerStats = eligibleForOff.map(performer => {
      let fullDaysOff = 0;
      let totalShows = 0;
      let consecutiveShows = 0;
      let hasCompanyDayOff = false;
      
      // Count current assignments
      for (const [assignedShowId, roleAssignments] of this.assignments) {
        if (Object.values(roleAssignments).includes(performer)) {
          totalShows++;
        }
      }
      
      // Count full days off
      const daysWithShows: Record<string, number> = {};
      const daysAssigned: Record<string, number> = {};
      
      this.shows.filter(s => s.status === 'show').forEach(s => {
        if (!daysWithShows[s.date]) daysWithShows[s.date] = 0;
        daysWithShows[s.date]++;
      });
      
      for (const [assignedShowId, roleAssignments] of this.assignments) {
        const assignedShow = this.shows.find(s => s.id === assignedShowId);
        if (!assignedShow || assignedShow.status !== 'show') continue;
        
        if (Object.values(roleAssignments).includes(performer)) {
          if (!daysAssigned[assignedShow.date]) daysAssigned[assignedShow.date] = 0;
          daysAssigned[assignedShow.date]++;
        }
      }
      
      // Count days where performer has 0 shows
      for (const date in daysWithShows) {
        if (!daysAssigned[date] || daysAssigned[date] === 0) {
          fullDaysOff++;
        }
      }
      
      // Check if this would create consecutive days off
      const wouldCreateConsecutiveDaysOff = this.hasConsecutiveDaysOff(
        performer, 
        showId, 
        this.assignments
      );
      
      // Calculate current consecutive shows leading to this show
      consecutiveShows = this.getConsecutiveShowCount(performer, showId);
      
      return {
        performer,
        fullDaysOff,
        totalShows,
        consecutiveShows,
        wouldCreateConsecutiveDaysOff,
        hasCompanyDayOff
      };
    });
    
    // Sort by priority
    performerStats.sort((a, b) => {
      // Priority 1: Avoid giving someone multiple full days off
      if (companyRedDate) {
        // If there's a company day off, everyone already has 1 day
        // Strongly avoid giving anyone a second day off
        if (a.fullDaysOff !== b.fullDaysOff) {
          return a.fullDaysOff - b.fullDaysOff;
        }
      } else {
        // No company day off, so aim for everyone to have exactly 1
        const aNeedsDayOff = a.fullDaysOff === 0 ? 1 : 0;
        const bNeedsDayOff = b.fullDaysOff === 0 ? 1 : 0;
        if (aNeedsDayOff !== bNeedsDayOff) {
          return bNeedsDayOff - aNeedsDayOff; // Prioritize those with 0 days off
        }
      }
      
      // Priority 2: Avoid consecutive days off (penalty for those who would create them)
      if (a.wouldCreateConsecutiveDaysOff !== b.wouldCreateConsecutiveDaysOff) {
        return a.wouldCreateConsecutiveDaysOff ? 1 : -1;
      }
      
      // Priority 3: Workload balance (prefer those with more shows)
      if (a.totalShows !== b.totalShows) {
        return b.totalShows - a.totalShows;
      }
      
      // Priority 4: Consecutive show count (help those working many in a row)
      if (a.consecutiveShows !== b.consecutiveShows) {
        return b.consecutiveShows - a.consecutiveShows;
      }
      
      // Random tiebreaker
      return Math.random() - 0.5;
    });
    
    // Return top 4 performers
    return performerStats.slice(0, 4).map(stat => stat.performer);
  }

  private getConsecutiveShowCount(performer: string, showId: string): number {
    // Get performer's current assignments
    const performerShows = new Set<string>();
    for (const [currentShowId, showAssignment] of this.assignments) {
      for (const [role, assignedPerformer] of Object.entries(showAssignment)) {
        if (assignedPerformer === performer && role !== "OFF") {
          performerShows.add(currentShowId);
          break;
        }
      }
    }
    
    // Add this show to the list
    performerShows.add(showId);
    
    // Convert to sorted array by show date/time
    const sortedShows = this.getSortedActiveShows();
    const showIndexMap = this.getShowIndexMap();
    
    const performerShowIndices = Array.from(performerShows)
      .map(id => showIndexMap.get(id))
      .filter(index => index !== undefined)
      .sort((a, b) => a! - b!);
    
    // Find longest consecutive sequence
    let maxConsecutive = 1;
    let currentConsecutive = 1;
    
    for (let i = 1; i < performerShowIndices.length; i++) {
      const prevShow = sortedShows[performerShowIndices[i - 1]!];
      const currentShow = sortedShows[performerShowIndices[i]!];
      
      if (this.areShowsConsecutive(prevShow, currentShow)) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 1;
      }
    }
    
    return maxConsecutive;
  }

  // =====================================
  // Validation and Warning System
  // =====================================

  private validateDayOffFairness(assignments: Assignment[]): { 
    warnings: string[], 
    performerDayOffCounts: Record<string, number> 
  } {
    const warnings: string[] = [];
    const performerDaysOff = this.getPerformerDaysOff(assignments);
    const performerDayOffCounts: Record<string, number> = {};
    const companyRedDate = this.detectCompanyRedDate();

    for (const [performer, daysOff] of Object.entries(performerDaysOff)) {
      performerDayOffCounts[performer] = daysOff.length;

      // Add company day off if it exists
      if (companyRedDate && !daysOff.includes(companyRedDate)) {
        performerDayOffCounts[performer]++;
      }
      
      if (performerDayOffCounts[performer] >= 3) {
        warnings.push(`⚠️ ${performer} has ${performerDayOffCounts[performer]} days off (target is 1)`);
      } else if (performerDayOffCounts[performer] >= 2) {
        warnings.push(`📋 ${performer} has ${performerDayOffCounts[performer]} days off (target is 1)`);
      }
      
      // Check for consecutive days off
      const sortedDaysOff = daysOff.sort();
      for (let i = 0; i < sortedDaysOff.length - 1; i++) {
        const d1 = new Date(sortedDaysOff[i] + 'T12:00:00Z');
        const d2 = new Date(sortedDaysOff[i + 1] + 'T12:00:00Z');
        const dayDiff = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
        
        if (dayDiff === 1) {
          warnings.push(`📅 ${performer} has consecutive days off: ${sortedDaysOff[i]} and ${sortedDaysOff[i + 1]}`);
        }
      }
    }
    
    return { warnings, performerDayOffCounts };
  }

  // FIXED: Check if assigning performer to show would violate consecutive show rule (max 6, not 3)
  private canAssignPerformerToShow(performer: string, showId: string): boolean {
    const sortedShows = this.getSortedActiveShows();
    const showIndexMap = this.getShowIndexMap();
    
    const targetIndex = showIndexMap.get(showId);
    if (targetIndex === undefined) return true; // If show not found, allow assignment

    // Get performer's current assignments (only show roles, not OFF)
    const performerShows = new Set<string>();
    for (const [currentShowId, showAssignment] of this.assignments) {
      for (const [role, assignedPerformer] of Object.entries(showAssignment)) {
        if (assignedPerformer === performer && role !== "OFF") {
          performerShows.add(currentShowId);
          break; // Only count once per show
        }
      }
    }

    // Convert to sorted indices
    const performerShowIndices = Array.from(performerShows)
      .map(showId => showIndexMap.get(showId))
      .filter(index => index !== undefined)
      .sort((a, b) => a! - b!);

    // Check consecutive shows with the new assignment
    const newIndices = [...performerShowIndices, targetIndex].filter(index => index !== undefined).sort((a, b) => a! - b!);
    
    // Find the longest consecutive sequence
    let maxConsecutive = 1;
    let currentConsecutive = 1;
    
    for (let i = 1; i < newIndices.length; i++) {
      const prevShow = sortedShows[newIndices[i - 1]!];
      const currentShow = sortedShows[newIndices[i]!];
      
      if (this.areShowsConsecutive(prevShow, currentShow)) {
        currentConsecutive++;
        maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
      } else {
        currentConsecutive = 1;
      }
      
      // FIXED: Allow up to 6 consecutive shows (not 3)
      if (maxConsecutive > 6) {
        return false;
      }
    }
    
    return true;
  }

  // NEW: Check back-to-back double days rule (4 shows across 2 consecutive days)
  private wouldViolateBackToBackDoubleDays(performer: string, showId: string): boolean {
    const allShows = this.getSortedActiveShows();
    const targetShow = allShows.find(s => s.id === showId);
    if (!targetShow) return false;

    const performerShows: Show[] = [targetShow];
    for (const [currentShowId, showAssignment] of this.assignments) {
        if (Object.values(showAssignment).includes(performer)) {
            const show = allShows.find(s => s.id === currentShowId);
            if (show && show.id !== showId) {
                performerShows.push(show);
            }
        }
    }

    // Group shows by date
    const showsByDate: Record<string, Show[]> = {};
    performerShows.forEach(show => {
      if (!showsByDate[show.date]) showsByDate[show.date] = [];
      showsByDate[show.date].push(show);
    });

    // Check for back-to-back double days (adjacent calendar dates, dates-only)
    const dates = Object.keys(showsByDate).sort();
    for (let i = 0; i < dates.length - 1; i++) {
      const currentDate = dates[i];
      const nextDate = dates[i + 1];

      if (areDatesConsecutive(currentDate, nextDate) && currentDate !== nextDate) {
        // Check if both days have 2 shows (double days)
        if (showsByDate[currentDate].length === 2 && showsByDate[nextDate].length === 2) {
          return true; // Would create back-to-back double days
        }
      }
    }

    return false;
  }

  // Check if performer has exceeded weekly show limit
  private hasExceededWeeklyLimit(performer: string): boolean {
    const performerShows = new Set<string>();
    for (const [showId, showAssignment] of this.assignments) {
      for (const [role, assignedPerformer] of Object.entries(showAssignment)) {
        if (assignedPerformer === performer && role !== "OFF") {
          performerShows.add(showId);
          break; // Only count once per show
        }
      }
    }
    return performerShows.size >= 6; // Maximum 6 shows per week
  }

  // Check if performer is already assigned to this show
  private isPerformerAssignedToShow(performer: string, showId: string): boolean {
    const showAssignment = this.assignments.get(showId);
    if (!showAssignment) return false;
    
    return Object.values(showAssignment).includes(performer);
  }

  // Get current show count for load balancing
  private getCurrentShowCount(performer: string): number {
    const performerShows = new Set<string>();
    for (const [showId, showAssignment] of this.assignments) {
      for (const [role, assignedPerformer] of Object.entries(showAssignment)) {
        if (assignedPerformer === performer && role !== "OFF") {
          performerShows.add(showId);
          break; // Only count once per show
        }
      }
    }
    return performerShows.size;
  }

  // Whether a performer is female. Prefers the explicit CastMember.gender field;
  // falls back to eligibility for a female-only role (Bin/Cornish are female-only
  // by definition) for legacy records that predate the gender field.
  private isFemalePerformer(performer: string): boolean {
    const castMember = this.castMembers.find(m => m.name === performer);
    if (!castMember) return false;
    if (castMember.gender) return castMember.gender === "female";
    return castMember.eligibleRoles.some(r => FEMALE_ONLY_ROLES.includes(r));
  }

  // Check if performer is eligible for role (including gender constraints)
  private isPerformerEligibleForRole(performer: string, role: Role): boolean {
    const castMember = this.castMembers.find(m => m.name === performer);
    if (!castMember) return false;

    // Check if performer can do this role
    if (!castMember.eligibleRoles.includes(role)) return false;

    // Female-only roles require a female performer.
    if (FEMALE_ONLY_ROLES.includes(role) && !this.isFemalePerformer(performer)) {
      return false;
    }

    return true;
  }

  // Whether any validation item makes an attempt unusable (must retry / cannot
  // ship). Keyed off structured rule codes, not message strings, so rewording a
  // message can never silently change generator behavior. Both the generation
  // path and the post-RED re-validation share this predicate.
  private hasCriticalErrors(items: ValidationItem[]): boolean {
    return items.some(item => item.severity === "error" && CRITICAL_RULE_CODES.has(item.code));
  }

  public async autoGenerate(): Promise<AutoGenerateResult> {
    try {
      this.clearCaches();

      // An empty week has nothing to cast: succeed with no assignments instead
      // of burning 100 attempts and failing on RED-day coverage no day can hold.
      if (this.shows.length === 0) {
        return { success: true, assignments: [] };
      }

      // If no cast members provided, fetch from company system
      if (this.castMembers.length === 0) {
        try {
          const { getCastMembers } = await import("./cast_members");
          const castData = await getCastMembers();
          this.castMembers = castData.castMembers;
        } catch (error) {
          return {
            success: false,
            assignments: [],
            errors: ["Failed to load cast members from company system"]
          };
        }
      }

      // Clear existing assignments
      this.clearAllAssignments();

      // The closest critically-clean attempt seen so far when none manages to
      // seat every individual RED day — fewest RED-day warnings wins. A week
      // that structurally can't seat all 12 (e.g. too few show dates) should
      // ship this, with its warnings intact, rather than fall through to
      // generatePartialSchedule()'s relaxed constraints, which would silently
      // under-cast shows to hide the same failure.
      let bestAttempt: { assignments: Assignment[]; warnings: string[]; dayOffStats: Record<string, number> } | null = null;

      // Try multiple attempts to find a valid assignment with corrected constraints
      for (let attempt = 0; attempt < 100; attempt++) {
        this.clearAllAssignments();

        if (this.generateScheduleAttempt()) {
          const assignments = this.convertToAssignments();
          const validation = this.validateSchedule(assignments);

          if (!this.hasCriticalErrors(validation.items)) {
            // Add RED day assignments (may vacate + refill stage roles)
            const finalAssignments = this.assignRedDays(assignments);

            // RE-VALIDATE: RED-day assignment can vacate stage roles. If the
            // refill left any show under-filled (or otherwise broke a critical
            // rule), do NOT ship this attempt — fall through to the next one.
            const postValidation = this.validateSchedule(finalAssignments);
            if (this.hasCriticalErrors(postValidation.items)) {
              continue;
            }

            if (this.lastRedDayWarnings.length > 0) {
              // Critically clean, but a performer could not be given a RED
              // day. Remember it as the fallback if it's the best one yet,
              // and keep trying for a fully clean attempt.
              if (!bestAttempt || this.lastRedDayWarnings.length < bestAttempt.warnings.length) {
                const { warnings, performerDayOffCounts } = this.validateDayOffFairness(finalAssignments);
                bestAttempt = {
                  assignments: finalAssignments,
                  warnings: [...this.lastRedDayWarnings, ...warnings],
                  dayOffStats: performerDayOffCounts
                };
              }
              continue;
            }

            // Add fairness validation
            const { warnings, performerDayOffCounts } = this.validateDayOffFairness(finalAssignments);
            const fallbackWarnings = this.fairnessFallbackCount > 0
              ? [`Fair OFF-selection fell back to random for ${this.fairnessFallbackCount} show(s) — day-off fairness may be reduced`]
              : [];

            return {
              success: true,
              assignments: finalAssignments,
              warnings: [...this.lastRedDayWarnings, ...fallbackWarnings, ...warnings],
              dayOffStats: performerDayOffCounts,
              generationId: Date.now().toString(36) + Math.random().toString(36).substring(2),
              generatedAt: new Date().toISOString()
            };
          }
        }
      }

      if (bestAttempt) {
        return {
          success: true,
          assignments: bestAttempt.assignments,
          warnings: bestAttempt.warnings,
          dayOffStats: bestAttempt.dayOffStats,
          generationId: Date.now().toString(36) + Math.random().toString(36).substring(2),
          generatedAt: new Date().toISOString()
        };
      }

      // If we couldn't find a complete solution, try a partial one with very relaxed constraints
      this.clearAllAssignments();
      const partialResult = this.generatePartialSchedule();
      
      if (partialResult.success || partialResult.assignments.length > 0) {
        const finalAssignments = this.assignRedDays(partialResult.assignments);

        // Re-validate: surface any post-RED casting problems in the returned
        // errors instead of silently discarding them (this is already a
        // best-effort partial result, so we still return it).
        const postValidation = this.validateSchedule(finalAssignments);

        // Add fairness validation for partial results too
        const { warnings, performerDayOffCounts } = this.validateDayOffFairness(finalAssignments);

        return {
          success: true,
          assignments: finalAssignments,
          errors: [...(partialResult.errors ?? []), ...postValidation.errors],
          warnings: [...this.lastRedDayWarnings, ...warnings],
          dayOffStats: performerDayOffCounts,
          generationId: Date.now().toString(36) + Math.random().toString(36).substring(2),
          generatedAt: new Date().toISOString()
        };
      }

      return partialResult;

    } catch (error) {
      return {
        success: false,
        assignments: [],
        errors: [`Algorithm error: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  private generateScheduleAttempt(): boolean {
    const sortedShows = this.getSortedActiveShows();
    this.fairnessFallbackCount = 0; // reset per attempt

    // Randomize order of shows and roles to avoid getting stuck in patterns
    const shuffledShows = this.shuffle(sortedShows);
    
    for (const show of shuffledShows) {
      if (!this.assignRolesForShow(show.id)) {
        return false;
      }
    }
    return true;
  }

  private assignRolesForShow(showId: string): boolean {
    const showAssignment = this.assignments.get(showId)!;
    const show = this.shows.find(s => s.id === showId);
    
    if (!show || show.status !== 'show') {
      return true;
    }
    
    // Try to fill all roles first
    const rolesToFill = this.shuffle([...this.roles]);
    
    for (const role of rolesToFill) {
      if (!showAssignment[role]) {
        const eligiblePerformers = this.getEligiblePerformers(role, showId);
        if (eligiblePerformers.length > 0) {
          const selected = this.selectBestPerformer(eligiblePerformers, showId, role);
          if (selected) {
            showAssignment[role] = selected;
          } else {
            return false;
          }
        } else {
          return false;
        }
      }
    }
    
    // Now assign OFF members using the new fair logic with fallback
    try {
      const offMembers = this.selectOffMembersWithFairness(showId);
      
      // Validate we got exactly 4
      if (offMembers.length !== 4) {
        // Fallback to old logic when fair selection provides insufficient candidates
        this.fairnessFallbackCount++;
        const oldOffMembers = this.selectOffMembersOld(showId);
        offMembers.length = 0;
        offMembers.push(...oldOffMembers);
      }
      
      // Store OFF assignments
      this.offAssignments.get(showId)!.length = 0; // Clear existing
      this.offAssignments.get(showId)!.push(...offMembers);
      
    } catch (error) {
      // If anything fails, use old logic
      console.error('Error in fair OFF selection, using fallback:', error);
      this.fairnessFallbackCount++;
      const offMembers = this.selectOffMembersOld(showId);
      this.offAssignments.get(showId)!.length = 0;
      this.offAssignments.get(showId)!.push(...offMembers);
    }
    
    return true;
  }

  // Helper methods for the new assignRolesForShow structure

  private getEligiblePerformers(role: Role, showId: string): CastMember[] {
    const show = this.shows.find(s => s.id === showId);
    return this.castMembers
      .filter(member => member.eligibleRoles.includes(role))
      .filter(member => {
        // CHECK 0: Don't staff a performer onto an empty slot on their manually
        // locked RED date — otherwise the final OFF-marker loop emits no RED for
        // them and post-validation fails, destroying the user's picks. No-op
        // when lockedRedDates is empty (get() -> undefined !== show.date).
        if (show && this.lockedRedDates.get(member.name) === show.date) {
          return false;
        }

        // CHECK 1: Not already assigned to this show
        if (this.isPerformerAssignedToShow(member.name, showId)) {
          return false;
        }
        
        // CHECK 2: Won't create consecutive show violation (max 6)
        if (!this.canAssignPerformerToShow(member.name, showId)) {
          return false;
        }

        // CHECK 3: Won't create back-to-back double days violation
        // (This governs weekend fatigue; there is no standalone Fri-Sun cap.)
        if (this.wouldViolateBackToBackDoubleDays(member.name, showId)) {
          return false;
        }

        // CHECK 4: Haven't exceeded weekly limit (max 6 shows)
        if (this.hasExceededWeeklyLimit(member.name)) {
          return false;
        }

        // CHECK 5: Gender constraints for female-only roles
        if (!this.isPerformerEligibleForRole(member.name, role)) {
          return false;
        }
        
        return true;
      });
  }

  private selectBestPerformer(eligiblePerformers: CastMember[], showId: string, role: Role): string | null {
    if (eligiblePerformers.length === 0) return null;
    
    const sortedPerformers = eligiblePerformers.sort((a, b) => {
      // Prioritize by show count (balance workload) with randomization
      const aCount = this.getCurrentShowCount(a.name);
      const bCount = this.getCurrentShowCount(b.name);
      const countDiff = aCount - bCount;
      
      // If counts are close, add randomization
      if (Math.abs(countDiff) <= 1) {
        return Math.random() - 0.5; // Keep simple randomization for small tie-breaking
      }
      
      return countDiff;
    });
    
    return sortedPerformers[0].name;
  }

  private selectOffMembersOld(showId: string): string[] {
    // Fallback logic: simple selection of 4 people not assigned to this show
    const assignedToShow = new Set<string>();
    const showAssignment = this.assignments.get(showId);
    if (showAssignment) {
      Object.values(showAssignment).forEach(performer => {
        if (performer) assignedToShow.add(performer);
      });
    }
    
    const availableForOff = this.castMembers
      .map(m => m.name)
      .filter(name => !assignedToShow.has(name))
      .sort(() => Math.random() - 0.5); // Random selection
    
    return availableForOff.slice(0, 4);
  }

  private generatePartialSchedule(): AutoGenerateResult {
    const errors: string[] = [];
    
    const rolesByDifficulty = this.getRolesByDifficulty();
    const sortedActiveShows = this.getSortedActiveShows();

    for (const role of rolesByDifficulty) {
      const eligibleCast = this.castMembers.filter(member => member.eligibleRoles.includes(role));
      
      for (const show of sortedActiveShows) {
        const showAssignment = this.assignments.get(show.id)!;
        
        if (showAssignment[role] === "") {
          const availableCast = eligibleCast.filter(member => {
            // Respect a manually locked RED day on this date (mirrors
            // getEligiblePerformers). No-op when lockedRedDates is empty.
            if (this.lockedRedDates.get(member.name) === show.date) {
              return false;
            }

            // Be more lenient in partial schedule generation
            if (this.isPerformerAssignedToShow(member.name, show.id)) {
              return false;
            }
            
            // Only check critical constraints in partial generation
            if (this.hasExceededWeeklyLimit(member.name)) {
              return false;
            }
            
            // Check gender constraints
            if (!this.isPerformerEligibleForRole(member.name, role)) {
              return false;
            }
            
            return true;
          });
          
          if (availableCast.length > 0) {
            const sortedCast = availableCast.sort((a, b) => {
              const aCount = this.getCurrentShowCount(a.name);
              const bCount = this.getCurrentShowCount(b.name);
              return aCount - bCount;
            });
            
            showAssignment[role] = sortedCast[0].name;
          } else {
            errors.push(`Could not assign ${role} for show on ${this.formatDateForValidation(show.date, show.time)} - no available performers`);
          }
        }
      }
    }

    const assignments = this.convertToAssignments();
    const hasAnyAssignments = assignments.length > 0;

    return {
      success: hasAnyAssignments,
      assignments,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  // Assign RED days to OFF performers, honoring a nominated company RED day.
  private assignRedDays(assignments: Assignment[]): Assignment[] {
    this.lastRedDayWarnings = [];

    // More than one day off flagged is only reachable via hand-edited JSON —
    // the frontend enforces at-most-one. Fall back to the earliest and warn
    // rather than silently picking, so a bad import surfaces instead of
    // hiding a scheduling mistake.
    const flaggedCount = this.shows.filter(s => s.status === 'dayoff' && s.isCompanyRedDay === true).length;
    const companyRedDate = this.detectCompanyRedDate();
    if (flaggedCount > 1) {
      this.lastRedDayWarnings.push(
        `More than one day off is flagged as the company RED day; using the earliest (${companyRedDate})`
      );
    }
    const allPerformers = this.castMembers.map(m => m.name);

    // If a day off is nominated as the company RED day, handle it differently
    if (companyRedDate) {
      const companyRedShowIds = this.shows
        .filter(s => s.date === companyRedDate && s.status === 'dayoff')
        .map(s => s.id);

      // Mark all performers as RED on the company RED day
      const finalAssignments: Assignment[] = [...assignments];

      // Add RED day assignments for the company RED day
      for (const showId of companyRedShowIds) {
        for (const performer of allPerformers) {
          finalAssignments.push({
            showId: showId,
            role: 'OFF',
            performer: performer,
            isRedDay: true
          });
        }
      }

      // All other OFF assignments are not RED
      return finalAssignments.map(a => {
        if (a.role === 'OFF' && !companyRedShowIds.includes(a.showId)) {
          return { ...a, isRedDay: false };
        }
        return a;
      });
    }

    // NEW LOGIC: Ensure everyone gets exactly one RED day
    const showsByDate: Record<string, Show[]> = {};
    this.shows.filter(s => s.status === 'show').forEach(show => {
      if (!showsByDate[show.date]) showsByDate[show.date] = [];
      showsByDate[show.date].push(show);
    });
    
    // Get all available dates sorted
    const availableDates = Object.keys(showsByDate).sort();
    
    // Create final assignments starting with all non-OFF assignments
    const finalAssignments: Assignment[] = assignments
      .filter(a => a.role !== 'OFF')
      .map(a => ({ ...a, isRedDay: false }));
    
    // Track which performers already have natural full days off
    const performerNaturalDaysOff: Record<string, string[]> = {};
    for (const performer of allPerformers) {
      performerNaturalDaysOff[performer] = [];
    }
    
    // Identify performers who already have natural full days off
    for (const date of availableDates) {
      const showsOnDate = showsByDate[date];
      const showsOnDateIds = new Set(showsOnDate.map(s => s.id));
      
      for (const performer of allPerformers) {
        const performerShowsOnDate = assignments.filter(a => 
          a.performer === performer && showsOnDateIds.has(a.showId) && a.role !== 'OFF'
        );
        
        if (performerShowsOnDate.length === 0) {
          performerNaturalDaysOff[performer].push(date);
        }
      }
    }
    
    // Assign RED days to performers with natural days off (prefer weekdays and fewer shows)
    const performerRedDays: Record<string, string> = {};
    
    for (const performer of allPerformers) {
      const naturalDaysOff = performerNaturalDaysOff[performer];
      if (naturalDaysOff.length > 0) {
        // Per §0 rule 6 the real preference is single-show days (Tue-Fri),
        // so order by fewest shows first, then weekday as a tiebreak.
        const sortedDaysOff = naturalDaysOff.sort((a, b) => {
          const showsOnA = showsByDate[a]?.length || 99;
          const showsOnB = showsByDate[b]?.length || 99;
          if (showsOnA !== showsOnB) {
            return showsOnA - showsOnB;
          }

          // Then prefer weekdays over weekends
          const aIsWeekend = this.isWeekend(a);
          const bIsWeekend = this.isWeekend(b);
          if (aIsWeekend !== bIsWeekend) {
            return aIsWeekend ? 1 : -1;
          }
          return 0;
        });
        
        performerRedDays[performer] = sortedDaysOff[0];
      }
    }
    
    // For performers without natural days off, create forced RED days.
    // Removing a performer from every show on a date vacates the stage roles
    // they held, so each vacated (show, role) must be REFILLED by a
    // constraint-clean substitute — otherwise the show ships with < 8 on stage.
    // Pin manually locked RED days: they override the natural pick, exclude the
    // performer from the force-vacate pass below (they already have a RED day),
    // and findRefillCandidate refuses to sub them onto their own RED date.
    // No-op when lockedRedDates is empty.
    for (const [performer, date] of this.lockedRedDates) {
      if (allPerformers.includes(performer)) {
        performerRedDays[performer] = date;
      }
    }

    const performersWithoutRedDays = allPerformers.filter(p => !performerRedDays[p]);
    const showById = new Map(this.shows.map(s => [s.id, s]));

    for (const performer of performersWithoutRedDays) {
      // Rank candidate dates by preference: single-show days first (§0 rule 6),
      // then avoid back-to-back double days, then a small weekday tiebreak.
      const rankedDates = [...availableDates].sort((a, b) => this.scoreRedDate(b, showsByDate) - this.scoreRedDate(a, showsByDate));

      // Performers who still need their own free day must not be pulled onto
      // stage to cover this vacancy (it could erase their only day off).
      const stillNeedsRedDay = new Set(
        performersWithoutRedDays.filter(p => p !== performer && !performerRedDays[p])
      );

      let placed = false;
      for (const date of rankedDates) {
        // The stage roles this performer holds on the candidate date.
        const vacated = finalAssignments.filter(a =>
          a.performer === performer && a.role !== 'OFF' && showById.get(a.showId)?.date === date
        );

        // Never vacate a manually locked pick to free a forced RED day; try the
        // next candidate date instead. If none is feasible, the !placed branch
        // below records a warning that trips the re-validation retry, so the
        // pick is never destroyed. No-op when lockedCells is empty.
        if (vacated.some(va => this.lockedCells.has(`${va.showId}:${va.role}`))) {
          continue;
        }

        // Work on a trial copy so an infeasible date leaves nothing half-done.
        let trial = finalAssignments.filter(a =>
          !(a.performer === performer && a.role !== 'OFF' && showById.get(a.showId)?.date === date)
        );

        let feasible = true;
        for (const va of vacated) {
          const show = showById.get(va.showId)!;
          const substitute = this.findRefillCandidate(trial, show, va.role as Role, performer, performerRedDays, stillNeedsRedDay);
          if (!substitute) {
            feasible = false;
            break;
          }
          trial = [...trial, { showId: va.showId, role: va.role, performer: substitute }];
        }

        if (feasible) {
          finalAssignments.length = 0;
          finalAssignments.push(...trial);
          performerRedDays[performer] = date;
          placed = true;
          break;
        }
      }

      if (!placed) {
        // No date can be freed for this performer without under-filling a show.
        // Leave their assignments intact; the autoGenerate re-validation will
        // reject this attempt and try again.
        this.lastRedDayWarnings.push(`Could not create a RED day for ${performer} without breaking casting`);
      }
    }

    // Add OFF assignments with correct RED day markers
    for (const show of this.shows.filter(s => s.status === 'show')) {
      const stageAssignments = finalAssignments.filter(a => a.showId === show.id && a.role !== 'OFF');
      const assignedPerformers = new Set(stageAssignments.map(a => a.performer));
      
      for (const performer of allPerformers) {
        if (!assignedPerformers.has(performer)) {
          const isRedDay = performerRedDays[performer] === show.date;
          finalAssignments.push({
            showId: show.id,
            role: 'OFF',
            performer: performer,
            isRedDay: isRedDay
          });
        }
      }
    }
    
    return finalAssignments;
  }

  // RED-day date preference (higher = better). Single-show days dominate
  // (§0 rule 6), then avoid back-to-back double days, then a small weekday
  // tiebreak.
  private scoreRedDate(date: string, showsByDate: Record<string, Show[]>): number {
    const showsOnDate = showsByDate[date]?.length ?? 0;
    let score = (2 - showsOnDate) * 10; // 1-show day (=10) >> 2-show day (=0)
    if (!this.isBackToBackDoubleDay(date)) score += 5;
    if (!this.isWeekend(date)) score += 3;
    return score;
  }

  // Find a substitute to fill a stage (show, role) vacated by a forced RED day.
  // Pure over `current` (does not touch this.assignments): the candidate must be
  // role/gender eligible, not already on stage in the show, not on their own RED
  // day, not a performer who still needs their own free day, and must stay within
  // the consecutive (<=6), back-to-back-double, and weekly (<=6) limits. Picks the
  // eligible performer with the fewest shows so far (balance).
  private findRefillCandidate(
    current: Assignment[],
    show: Show,
    role: Role,
    excludePerformer: string,
    performerRedDays: Record<string, string>,
    stillNeedsRedDay: Set<string>
  ): string | null {
    const onStageInShow = new Set(
      current.filter(a => a.showId === show.id && a.role !== 'OFF').map(a => a.performer)
    );
    const showDateById = new Map(
      this.shows.filter(s => s.status === 'show').map(s => [s.id, s.date])
    );

    // Per-performer performed-show counts per date, from `current`.
    const datesByPerformer = new Map<string, Record<string, number>>();
    for (const a of current) {
      if (a.role === 'OFF') continue;
      const date = showDateById.get(a.showId);
      if (!date) continue;
      const rec = datesByPerformer.get(a.performer) ?? {};
      rec[date] = (rec[date] || 0) + 1;
      datesByPerformer.set(a.performer, rec);
    }

    const candidates: { name: string; showCount: number }[] = [];
    for (const member of this.castMembers) {
      const name = member.name;
      if (name === excludePerformer) continue;
      if (onStageInShow.has(name)) continue;
      if (performerRedDays[name] === show.date) continue;
      if (stillNeedsRedDay.has(name)) continue;
      if (!this.isPerformerEligibleForRole(name, role)) continue;

      // Hypothetical schedule with this performer added to the show.
      const dates = { ...(datesByPerformer.get(name) ?? {}) };
      dates[show.date] = (dates[show.date] || 0) + 1;

      const total = Object.values(dates).reduce((sum, n) => sum + n, 0);
      if (total > 6) continue; // weekly cap
      if (this.maxConsecutiveFromDateCounts(dates) > 6) continue;
      if (this.hasBackToBackDoublesFromDateCounts(dates)) continue;

      candidates.push({ name, showCount: total - 1 });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.showCount - b.showCount);
    return candidates[0].name;
  }

  // Longest consecutive run given a performer's shows-per-date map. Same-date
  // shows (a double) add their count; a gap day resets the run. §0 rule 2.
  private maxConsecutiveFromDateCounts(dateCounts: Record<string, number>): number {
    const dates = Object.keys(dateCounts).sort();
    let max = 0;
    let run = 0;
    let prev: string | null = null;
    for (const date of dates) {
      if (prev && areDatesConsecutive(prev, date)) {
        run += dateCounts[date];
      } else {
        run = dateCounts[date];
      }
      max = Math.max(max, run);
      prev = date;
    }
    return max;
  }

  // True if the performer performs 2 shows on each of two adjacent dates. §0 rule 3.
  private hasBackToBackDoublesFromDateCounts(dateCounts: Record<string, number>): boolean {
    const dates = Object.keys(dateCounts).sort();
    for (let i = 0; i < dates.length - 1; i++) {
      if (
        areDatesConsecutive(dates[i], dates[i + 1]) &&
        dateCounts[dates[i]] === 2 &&
        dateCounts[dates[i + 1]] === 2
      ) {
        return true;
      }
    }
    return false;
  }

  // Helper method to determine if a date is a weekend
  private isWeekend(date: string): boolean {
    // Noon-UTC anchor + getUTCDay so the weekday is correct in every timezone.
    const dayOfWeek = new Date(date + "T12:00:00Z").getUTCDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
  }

  // Helper method to determine if a date is part of back-to-back double show days
  private isBackToBackDoubleDay(date: string): boolean {
    const currentDate = new Date(date);
    const nextDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    const prevDate = new Date(currentDate.getTime() - 24 * 60 * 60 * 1000);
    
    const formatDate = (d: Date) => d.toISOString().split('T')[0];
    
    const currentShows = this.shows.filter(s => s.date === date && s.status === 'show').length;
    const nextShows = this.shows.filter(s => s.date === formatDate(nextDate) && s.status === 'show').length;
    const prevShows = this.shows.filter(s => s.date === formatDate(prevDate) && s.status === 'show').length;
    
    // Returns true if current day has 2+ shows AND either the next or previous day has 2+ shows
    return currentShows >= 2 && (nextShows >= 2 || prevShows >= 2);
  }

  // Helper method to get the number of shows on a specific date
  private getShowCountForDate(date: string): number {
    return this.shows.filter(s => s.date === date && s.status === 'show').length;
  }

  private clearAllAssignments(): void {
    this.clearCaches();

    this.shows.forEach(show => {
      const showAssignment: ShowAssignment = {};
      const prev = this.assignments.get(show.id);
      this.roles.forEach(role => {
        // Keep a locked (manually seeded) pick across per-attempt resets; clear
        // everything else. Empty lockedCells -> every cell "" -> identical to
        // today. Fill never overwrites a locked cell (it is non-empty and the
        // gap guards skip it), so prev always holds the seeded value.
        showAssignment[role] = this.lockedCells.has(`${show.id}:${role}`)
          ? (prev?.[role] ?? "")
          : "";
      });
      this.assignments.set(show.id, showAssignment);
      this.offAssignments.set(show.id, []);
    });
  }

  private getRolesByDifficulty(): Role[] {
    const roles: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];
    return [...roles].sort((a, b) => {
      const aEligible = this.castMembers.filter(member => member.eligibleRoles.includes(a)).length;
      const bEligible = this.castMembers.filter(member => member.eligibleRoles.includes(b)).length;
      return aEligible - bEligible;
    });
  }

  private convertToAssignments(): Assignment[] {
    const assignments: Assignment[] = [];
    
    // Add stage role assignments
    for (const [showId, showAssignment] of this.assignments) {
      for (const [role, performer] of Object.entries(showAssignment)) {
        if (performer !== "") {
          assignments.push({
            showId,
            role: role as Role,
            performer,
            isRedDay: false
          });
        }
      }
    }
    
    // Add OFF assignments from our tracked offAssignments
    for (const [showId, offPerformers] of this.offAssignments) {
      for (const performer of offPerformers) {
        assignments.push({
          showId,
          role: 'OFF',
          performer,
          isRedDay: false
        });
      }
    }
    
    return assignments;
  }

  // Optimized consecutive show analysis for validation
  private analyzeConsecutiveShows(assignments: Assignment[]): Map<string, PerformerShowData> {
    if (this._performerShowCache !== null && this._performerShowCacheKey === assignments) {
      return this._performerShowCache;
    }

    const sortedShows = this.getSortedActiveShows();
    const showIndexMap = this.getShowIndexMap();
    const performerData = new Map<string, PerformerShowData>();

    // Initialize data for all cast members
    for (const member of this.castMembers) {
      performerData.set(member.name, {
        showIndexes: new Set<number>(),
        sortedShows: [],
        maxConsecutive: 0,
        sequences: []
      });
    }

    // Build performer show indexes efficiently (only for show roles, not OFF)
    for (const assignment of assignments) {
      if (assignment.role !== "OFF") {
        const showIndex = showIndexMap.get(assignment.showId);
        if (showIndex !== undefined) {
          const data = performerData.get(assignment.performer);
          if (data) {
            data.showIndexes.add(showIndex);
          }
        }
      }
    }

    // Analyze consecutive sequences for each performer
    for (const [performerName, data] of performerData) {
      if (data.showIndexes.size === 0) continue;

      // Convert to sorted array of indexes
      const sortedIndexes = Array.from(data.showIndexes).sort((a, b) => a - b);
      
      // Build show data
      data.sortedShows = sortedIndexes.map(index => ({
        show: sortedShows[index],
        index
      }));

      // Find consecutive sequences using optimized algorithm
      this.findConsecutiveSequences(data, sortedShows);
    }

    this._performerShowCache = performerData;
    this._performerShowCacheKey = assignments;
    return performerData;
  }

  // Optimized consecutive sequence detection
  private findConsecutiveSequences(data: PerformerShowData, sortedShows: Show[]): void {
    const sortedIndexes = Array.from(data.showIndexes).sort((a, b) => a - b);
    if (sortedIndexes.length === 0) return;

    const sequences: ConsecutiveSequence[] = [];
    let currentSequenceStart = 0;
    let maxConsecutive = 1;

    // Single pass algorithm to find consecutive sequences
    for (let i = 1; i < sortedIndexes.length; i++) {
      const currentIndex = sortedIndexes[i];
      const prevIndex = sortedIndexes[i - 1];
      
      // Check if shows are consecutive (considering date gaps)
      const isConsecutive = this.areShowsConsecutive(
        sortedShows[prevIndex],
        sortedShows[currentIndex]
      );

      if (!isConsecutive) {
        // End current sequence if it's significant
        const sequenceLength = i - currentSequenceStart;
        if (sequenceLength > 6) {
          const startIndex = sortedIndexes[currentSequenceStart];
          const endIndex = sortedIndexes[i - 1];
          sequences.push({
            startIndex,
            endIndex,
            count: sequenceLength,
            startDate: this.formatDateForValidation(sortedShows[startIndex].date, sortedShows[startIndex].time),
            endDate: this.formatDateForValidation(sortedShows[endIndex].date, sortedShows[endIndex].time)
          });
        }
        maxConsecutive = Math.max(maxConsecutive, sequenceLength);
        currentSequenceStart = i;
      }
    }

    // Handle final sequence
    const finalSequenceLength = sortedIndexes.length - currentSequenceStart;
    if (finalSequenceLength > 6) {
      const startIndex = sortedIndexes[currentSequenceStart];
      const endIndex = sortedIndexes[sortedIndexes.length - 1];
      sequences.push({
        startIndex,
        endIndex,
        count: finalSequenceLength,
        startDate: this.formatDateForValidation(sortedShows[startIndex].date, sortedShows[startIndex].time),
        endDate: this.formatDateForValidation(sortedShows[endIndex].date, sortedShows[endIndex].time)
      });
    }
    maxConsecutive = Math.max(maxConsecutive, finalSequenceLength);

    data.maxConsecutive = maxConsecutive;
    data.sequences = sequences;
  }

  // Two shows count toward the same consecutive run only when they are on the
  // same calendar date (a matinee + evening double) or on directly adjacent
  // dates. Any calendar day with zero shows resets the run. Compares DATES ONLY
  // (never times) via the shared helper — see date_rules.ts.
  private areShowsConsecutive(show1: Show, show2: Show): boolean {
    try {
      return areDatesConsecutive(show1.date, show2.date);
    } catch (error) {
      return false;
    }
  }

  public validateSchedule(assignments: Assignment[], options?: { ignoreUnstartedShows?: boolean }): ConstraintResult {
    const items: ValidationItem[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    // errors/warnings are derived views over the structured items so the public
    // ConstraintResult stays backward-compatible.
    const addError = (code: RuleCode, message: string, meta?: { performer?: string; showId?: string }) => {
      errors.push(message);
      items.push({ code, severity: "error", message, ...meta });
    };
    const addWarning = (code: RuleCode, message: string, meta?: { performer?: string; showId?: string }) => {
      warnings.push(message);
      items.push({ code, severity: "warning", message, ...meta });
    };

    // Filter active shows for validation
    const activeShows = this.shows.filter(show => show.status === "show");

    // Group assignments by show
    const showAssignments = new Map<string, Assignment[]>();
    assignments.forEach(assignment => {
      if (!showAssignments.has(assignment.showId)) {
        showAssignments.set(assignment.showId, []);
      }
      showAssignments.get(assignment.showId)!.push(assignment);
    });

    // Validate each active show
    for (const show of activeShows) {
      const showAssignmentList = showAssignments.get(show.id) || [];
      const showDate = this.formatDateForValidation(show.date, show.time);
      
      // Filter only stage assignments (not OFF)
      const stageAssignments = showAssignmentList.filter(a => a.role !== "OFF");

      // An untouched show (no assignments at all) hasn't been started yet -
      // it's a to-do, not a defect. Display-facing callers (validate.ts,
      // validate_comprehensive.ts) opt into hiding this noise via
      // ignoreUnstartedShows; the internal auto-generate retry loop never
      // sets it, so it still catches a show a bug vacated back to empty.
      const isUnstartedShow = options?.ignoreUnstartedShows && stageAssignments.length === 0;

      if (!isUnstartedShow) {
        // CRITICAL: Check if exactly 8 performers per show
        const uniquePerformers = new Set(stageAssignments.map(a => a.performer));
        if (uniquePerformers.size !== 8) {
          if (uniquePerformers.size < 8) {
            const missingCount = 8 - uniquePerformers.size;
            addError("CASTING_INCOMPLETE", `Show ${showDate}: Missing ${missingCount} performer${missingCount > 1 ? 's' : ''} - must have exactly 8 on stage`, { showId: show.id });
          } else {
            addError("CASTING_DUPLICATE", `Show ${showDate}: Has ${uniquePerformers.size} performers but can only have 8 - remove duplicate assignments`, { showId: show.id });
          }
        }

        // Check if all roles are filled
        const filledRoles = new Set(stageAssignments.map(a => a.role));
        if (filledRoles.size !== 8) {
          if (filledRoles.size < 8) {
            const missingRoles = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"]
              .filter(role => !filledRoles.has(role as Role));
            addError("CASTING_INCOMPLETE", `Show ${showDate}: Missing roles: ${missingRoles.join(", ")} - assign performers to these roles`, { showId: show.id });
          }
        }
      }

      // Check role eligibility; flag (but don't block on) an atypical gender pairing.
      for (const assignment of stageAssignments) {
        const castMember = this.castMembers.find(m => m.name === assignment.performer);
        if (!castMember) {
          addError("ROLE_INELIGIBLE", `Show ${showDate}: Unknown performer "${assignment.performer}" assigned to ${assignment.role}`, { performer: assignment.performer, showId: assignment.showId });
        } else if (!castMember.eligibleRoles.includes(assignment.role as Role)) {
          addError("ROLE_INELIGIBLE", `Show ${showDate}: ${assignment.performer} cannot perform ${assignment.role} - not in eligible roles`, { performer: assignment.performer, showId: assignment.showId });
        } else if (FEMALE_ONLY_ROLES.includes(assignment.role as Role) && !this.isFemalePerformer(assignment.performer)) {
          addWarning("GENDER_VIOLATION", `Show ${showDate}: ${assignment.performer} is assigned to ${assignment.role}, which is usually cast with a female performer - double-check this assignment`, { performer: assignment.performer, showId: assignment.showId });
        }
      }

      // Check for duplicate performers in same show
      const performerCounts = new Map<string, Assignment[]>();
      stageAssignments.forEach(assignment => {
        if (!performerCounts.has(assignment.performer)) {
          performerCounts.set(assignment.performer, []);
        }
        performerCounts.get(assignment.performer)!.push(assignment);
      });
      
      for (const [performer, duplicateAssignments] of performerCounts) {
        if (duplicateAssignments.length > 1) {
          const roles = duplicateAssignments.map(a => a.role);
          addError("CASTING_DUPLICATE", `Show ${showDate}: ${performer} assigned to multiple roles (${roles.join(", ")}) - each performer can only have one role per show`, { performer, showId: show.id });
        }
      }
    }

    // CRITICAL: Use optimized consecutive shows analysis (max 6, not 3)
    const performerData = this.analyzeConsecutiveShows(assignments);
    for (const [memberName, data] of performerData) {
      for (const sequence of data.sequences) {
        if (sequence.count > 6) {
          addError("CONSECUTIVE_EXCEEDED", `${memberName} has ${sequence.count} consecutive shows (${sequence.startDate} to ${sequence.endDate}) - exceeds maximum of 6 consecutive shows`, { performer: memberName });
        }
      }
    }

    // Fatigue rules (back-to-back double days, weekly cap). Both are
    // OVERRIDABLE: when the RD flags the involved assignments as an
    // injury/sickness override (isOverride), the violation is reported as a
    // warning instead of an error. Casting/eligibility/gender/>6-consecutive/
    // RED-day errors are never softened.
    const stageByPerformer = new Map<string, Assignment[]>();
    for (const a of assignments) {
      if (a.role === 'OFF') continue;
      const list = stageByPerformer.get(a.performer) ?? [];
      list.push(a);
      stageByPerformer.set(a.performer, list);
    }
    const activeShowById = new Map(activeShows.map(s => [s.id, s]));

    // Validate back-to-back double days rule (§0 rule 3).
    for (const member of this.castMembers) {
      const memberStage = stageByPerformer.get(member.name) ?? [];
      const showsByDate: Record<string, Assignment[]> = {};
      for (const a of memberStage) {
        const show = activeShowById.get(a.showId);
        if (!show) continue;
        (showsByDate[show.date] ??= []).push(a);
      }

      const dates = Object.keys(showsByDate).sort();
      for (let i = 0; i < dates.length - 1; i++) {
        const d1 = dates[i], d2 = dates[i + 1];
        if (showsByDate[d1].length === 2 && showsByDate[d2].length === 2 && areDatesConsecutive(d1, d2)) {
          const overridden = [...showsByDate[d1], ...showsByDate[d2]].some(a => a.isOverride);
          if (overridden) {
            addWarning("BACK_TO_BACK_DOUBLES", `⚠ ${member.name}: 4 shows across ${d1}/${d2} — manual override (injury cover)`, { performer: member.name });
          } else {
            addError("BACK_TO_BACK_DOUBLES", `${member.name} has 4 shows across 2 consecutive days (${d1} and ${d2}) - violates back-to-back double days rule`, { performer: member.name });
          }
        }
      }
    }

    // Validate weekly cap (§0 rule 5): max 6 shows per performer.
    for (const member of this.castMembers) {
      const memberStage = stageByPerformer.get(member.name) ?? [];
      if (memberStage.length > 6) {
        if (memberStage.some(a => a.isOverride)) {
          addWarning("WEEKLY_LIMIT_EXCEEDED", `⚠ ${member.name}: ${memberStage.length} shows this week — manual override (injury cover)`, { performer: member.name });
        } else {
          addError("WEEKLY_LIMIT_EXCEEDED", `${member.name} has ${memberStage.length} shows this week - exceeds maximum of 6 shows per week`, { performer: member.name });
        }
      }
    }

    // RED Day Validation
    const performerRedDays: Record<string, string[]> = {};
    this.castMembers.forEach(m => performerRedDays[m.name] = []);

    const offAssignments = assignments.filter(a => a.role === 'OFF' && a.isRedDay);
    offAssignments.forEach(a => {
        // Resolve against ALL shows, not just 'show'-status ones: a full-company
        // RED day sits on a 'dayoff'-status show (see §7), so restricting to
        // activeShows here would drop it and falsely flag everyone as missing a
        // RED day.
        const show = this.shows.find(s => s.id === a.showId);
        if (show) {
            if (!performerRedDays[a.performer].includes(show.date)) {
                performerRedDays[a.performer].push(show.date);
            }
        }
    });

    for (const performer in performerRedDays) {
        if (performerRedDays[performer].length > 1) {
            addError("RED_DAY_MULTIPLE", `${performer} has more than one RED day assigned.`, { performer });
        }
        if (this.castMembers.some(m => m.name === performer) && performerRedDays[performer].length === 0) {
            addWarning("RED_DAY_MISSING", `${performer} does not have a RED day assigned.`, { performer });
        }

        for (const redDate of performerRedDays[performer]) {
            const showsOnRedDate = activeShows.filter(s => s.date === redDate);
            const assignmentsOnRedDate = assignments.filter(a => a.performer === performer && showsOnRedDate.some(s => s.id === a.showId));
            const isFullDayOff = assignmentsOnRedDate.every(a => a.role === 'OFF');
            if (!isFullDayOff) {
                addError("RED_DAY_NOT_FULL_DAY", `${performer} has a RED day on ${redDate} but is also assigned to a role on that day.`, { performer });
            }
        }
    }

    // Check show distribution with specific suggestions
    const showCounts = this.getShowCounts(assignments, activeShows);
    const averageShows = activeShows.length > 0 ? activeShows.length / this.castMembers.length : 0;
    
    for (const [performer, count] of Object.entries(showCounts)) {
      if (count < 2 && count > 0 && activeShows.length >= 4) {
        addWarning("UNDERUTILIZED", `${performer} only has ${count} show${count === 1 ? '' : 's'} (underutilized)`, { performer });
      } else if (count > Math.ceil(averageShows * 1.5) && activeShows.length > 4) {
        addWarning("OVERWORKED", `${performer} has ${count} shows (potentially overworked)`, { performer });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      items
    };
  }

  private formatDateForValidation(date: string, time: string): string {
    try {
      // Noon-UTC anchor + explicit UTC formatting so the weekday/date match the
      // calendar date in every timezone.
      const dateObj = new Date(date + "T12:00:00Z");
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
      const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

      // An unknown time must not be parsed: parseInt("TBC") is NaN, setHours(NaN)
      // makes an Invalid Date, and toLocaleTimeString then renders the literal
      // string "Invalid Date" straight into a user-facing error. No throw, so the
      // catch below never fires.
      if (!isKnownTime(time)) return `${dayName} ${monthDay} ${TBC}`;

      const [hours, minutes] = time.split(':');
      const timeObj = new Date();
      timeObj.setHours(parseInt(hours), parseInt(minutes));
      const timeStr = timeObj.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      return `${dayName} ${monthDay} ${timeStr}`;
    } catch (error) {
      return `${date} ${time}`;
    }
  }

  private getAlternativePerformers(currentPerformer: string, roles: Role[], showId: string): string[] {
    const alternatives: string[] = [];
    
    // Get currently assigned performers in this show
    const showAssignments = this.convertToAssignments().filter(a => a.showId === showId && a.role !== "OFF");
    const assignedPerformers = new Set(showAssignments.map(a => a.performer));
    
    // Find alternative performers for each role (excluding current performer and already assigned)
    for (const role of roles) {
      const eligiblePerformers = this.castMembers
        .filter(member => 
          member.eligibleRoles.includes(role) && 
          member.name !== currentPerformer &&
          !assignedPerformers.has(member.name)
        )
        .map(member => member.name);
      
      alternatives.push(...eligiblePerformers);
    }
    
    return [...new Set(alternatives)]; // Remove duplicates
  }

  private getConsecutiveShowSuggestions(memberName: string, sequence: ConsecutiveSequence, assignments: Assignment[], activeShows: Show[]): string {
    const suggestions: string[] = [];
    
    // Find shows in the middle of the sequence where we could make substitutions
    const memberAssignments = assignments.filter(a => a.performer === memberName && a.role !== "OFF");
    const showIndexMap = this.getShowIndexMap();
    const sortedShows = this.getSortedActiveShows();
    
    // Get middle show index from the sequence
    const middleIndex = Math.floor((sequence.startIndex + sequence.endIndex) / 2);
    if (middleIndex < sortedShows.length) {
      const middleShow = sortedShows[middleIndex];
      const memberRoleInShow = memberAssignments.find(a => a.showId === middleShow.id)?.role;
      
      if (memberRoleInShow && memberRoleInShow !== "OFF") {
        const alternatives = this.getAlternativePerformers(memberName, [memberRoleInShow as Role], middleShow.id);
        if (alternatives.length > 0) {
          const showDate = this.formatDateForValidation(middleShow.date, middleShow.time);
          suggestions.push(`Replace ${memberName} with ${alternatives[0]} for ${memberRoleInShow} on ${showDate}`);
        }
      }
    }
    
    // If no specific suggestions, give general advice
    if (suggestions.length === 0) {
      suggestions.push("Consider redistributing some shows to other cast members");
    }
    
    return suggestions.join(". ");
  }

  private getUnderutilizedSuggestions(performer: string, assignments: Assignment[], activeShows: Show[]): string {
    const suggestions: string[] = [];
    
    // Find shows where this performer is not assigned but could be
    const performerMember = this.castMembers.find(m => m.name === performer);
    if (!performerMember) return "verify performer availability";
    
    const assignedShowIds = new Set(assignments.filter(a => a.performer === performer && a.role !== "OFF").map(a => a.showId));
    const unassignedShows = activeShows.filter(show => !assignedShowIds.has(show.id));
    
    if (unassignedShows.length > 0) {
      // Look for roles this performer could fill in unassigned shows
      for (const show of unassignedShows.slice(0, 2)) { // Check first 2 shows
        const showAssignments = assignments.filter(a => a.showId === show.id && a.role !== "OFF");
        const unfilledRoles = performerMember.eligibleRoles.filter(role => 
          !showAssignments.some(a => a.role === role)
        );
        
        if (unfilledRoles.length > 0) {
          const showDate = this.formatDateForValidation(show.date, show.time);
          suggestions.push(`assign ${unfilledRoles[0]} role on ${showDate}`);
          break;
        }
      }
    }
    
    if (suggestions.length === 0) {
      suggestions.push("look for opportunities to assign additional roles");
    }
    
    return suggestions.join(", ");
  }

  private getOverworkedSuggestions(performer: string, assignments: Assignment[], activeShows: Show[]): string {
    const suggestions: string[] = [];
    
    // Find this performer's assignments and suggest redistributing some
    const performerAssignments = assignments.filter(a => a.performer === performer && a.role !== "OFF");
    
    if (performerAssignments.length > 2) {
      // Suggest redistributing the last few assignments
      const lastAssignment = performerAssignments[performerAssignments.length - 1];
      const show = activeShows.find(s => s.id === lastAssignment.showId);
      
      if (show) {
        const alternatives = this.getAlternativePerformers(performer, [lastAssignment.role as Role], show.id);
        if (alternatives.length > 0) {
          const showDate = this.formatDateForValidation(show.date, show.time);
          suggestions.push(`reassign ${lastAssignment.role} on ${showDate} to ${alternatives[0]}`);
        }
      }
    }
    
    if (suggestions.length === 0) {
      suggestions.push("redistribute some assignments to other cast members");
    }
    
    return suggestions.join(", ");
  }

  private getShowCounts(assignments: Assignment[], activeShows?: Show[]): Record<string, number> {
    const showsToCheck = activeShows || this.shows.filter(show => show.status === "show");
    const counts: Record<string, number> = {};
    
    // Initialize all cast members
    this.castMembers.forEach(member => {
      counts[member.name] = 0;
    });

    // Count shows per performer (only active shows, only stage roles)
    const showPerformers = new Map<string, Set<string>>();
    assignments.forEach(assignment => {
      // Only count if the show is in our active shows list and it's not an OFF assignment
      if (assignment.role !== "OFF" && showsToCheck.some(show => show.id === assignment.showId)) {
        if (!showPerformers.has(assignment.showId)) {
          showPerformers.set(assignment.showId, new Set());
        }
        showPerformers.get(assignment.showId)!.add(assignment.performer);
      }
    });

    // Count unique shows per performer
    for (const [, performers] of showPerformers) {
      for (const performer of performers) {
        counts[performer]++;
      }
    }

    return counts;
  }
}
