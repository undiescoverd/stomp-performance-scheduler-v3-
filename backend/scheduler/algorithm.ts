import { Role, Show, Assignment, CastMember, FEMALE_ONLY_ROLES } from "./types";

export interface AutoGenerateResult {
  success: boolean;
  assignments: Assignment[];
  errors?: string[];
  warnings?: string[];
  dayOffStats?: Record<string, number>;
  generationId?: string;
  generatedAt?: string;
}

export interface ConstraintResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
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
  
  // Cached data structures for performance
  private _sortedActiveShows: Show[] | null = null;
  private _showIndexMap: Map<string, number> | null = null;
  private _performerShowCache: Map<string, PerformerShowData> | null = null;

  // Fisher-Yates shuffle for proper randomization
  private shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  constructor(shows: Show[], castMembers?: CastMember[]) {
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
  }

  // Clear caches when data changes
  private clearCaches(): void {
    this._sortedActiveShows = null;
    this._showIndexMap = null;
    this._performerShowCache = null;
  }

  // Get sorted active shows with caching
  private getSortedActiveShows(): Show[] {
    if (this._sortedActiveShows === null) {
      this._sortedActiveShows = this.shows
        .filter(show => show.status === "show")
        .sort((a, b) => {
          const dateTimeA = new Date(`${a.date}T${a.time}`);
          const dateTimeB = new Date(`${b.date}T${b.time}`);
          return dateTimeA.getTime() - dateTimeB.getTime();
        });
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

  private detectCompanyDayOff(): string | null {
    const dayOffShows = this.shows.filter(s => s.status === 'dayoff');
    if (dayOffShows.length === 0) return null;
    
    // Sort by date and return the earliest
    const sortedDayOffs = dayOffShows.sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    return sortedDayOffs[0].date;
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
    
    const companyDayOff = this.detectCompanyDayOff();
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
      if (companyDayOff) {
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
    const companyDayOff = this.detectCompanyDayOff();
    
    for (const [performer, daysOff] of Object.entries(performerDaysOff)) {
      performerDayOffCounts[performer] = daysOff.length;
      
      // Add company day off if it exists
      if (companyDayOff && !daysOff.includes(companyDayOff)) {
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

    // Check for back-to-back double days
    const dates = Object.keys(showsByDate).sort();
    for (let i = 0; i < dates.length - 1; i++) {
      const currentDate = dates[i];
      const nextDate = dates[i + 1];
      
      // Check if consecutive days
      const d1 = new Date(currentDate);
      const d2 = new Date(nextDate);
      const dayDiff = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
      
      if (dayDiff === 1) {
        // Check if both days have 2 shows (double days)
        if (showsByDate[currentDate].length === 2 && showsByDate[nextDate].length === 2) {
          return true; // Would create back-to-back double days
        }
      }
    }

    return false;
  }

  // FIXED: Check weekend 4-show rule (Friday-Sunday pattern) - keep existing logic
  private wouldViolateWeekendRule(performer: string, showId: string): boolean {
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

    const showsByWeekend: Record<string, Show[]> = {};

    for (const show of performerShows) {
        const showDate = new Date(show.date + 'T12:00:00Z');
        const dayOfWeek = showDate.getUTCDay(); // Sunday = 0, ..., Saturday = 6

        if (dayOfWeek >= 5 || dayOfWeek === 0) { // Friday, Saturday, or Sunday
            const mondayDate = new Date(showDate);
            const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
            mondayDate.setUTCDate(mondayDate.getUTCDate() + offset);
            const weekKey = mondayDate.toISOString().split('T')[0];

            if (!showsByWeekend[weekKey]) {
                showsByWeekend[weekKey] = [];
            }
            showsByWeekend[weekKey].push(show);
        }
    }

    for (const weekKey in showsByWeekend) {
        if (showsByWeekend[weekKey].length > 4) {
            return true;
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

  // NEW: Check if performer is eligible for role (including gender constraints)
  private isPerformerEligibleForRole(performer: string, role: Role): boolean {
    const castMember = this.castMembers.find(m => m.name === performer);
    if (!castMember) return false;
    
    // Check if performer can do this role
    if (!castMember.eligibleRoles.includes(role)) return false;
    
    // Check gender constraints for female-only roles
    if (FEMALE_ONLY_ROLES.includes(role)) {
      // For now, we'll use the existing cast member names to determine gender
      // In a real implementation, you'd have gender in the CastMember interface
      const femaleNames = ["MOLLY", "JASMINE", "SERENA"];
      if (!femaleNames.includes(performer)) return false;
    }
    
    return true;
  }

  public async autoGenerate(): Promise<AutoGenerateResult> {
    try {
      this.clearCaches();

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

      // Try multiple attempts to find a valid assignment with corrected constraints
      for (let attempt = 0; attempt < 100; attempt++) {
        this.clearAllAssignments();
        
        if (this.generateScheduleAttempt()) {
          const assignments = this.convertToAssignments();
          const validation = this.validateSchedule(assignments);
          
          // Check for critical errors (exactly 8 on stage, correct number off)
          const hasCriticalErrors = validation.errors.some(error => 
            error.includes("exactly 8") || error.includes("needs exactly") || 
            error.includes("multiple roles") || error.includes("not eligible") ||
            error.includes("exceeds maximum of 6 consecutive") ||
            error.includes("back-to-back double days") ||
            error.includes("shows over a weekend") || error.includes("exceeds maximum of 4")
          );
          
          if (!hasCriticalErrors) {
            // Add RED day assignments
            const finalAssignments = this.assignRedDays(assignments);
            
            // Add fairness validation
            const { warnings, performerDayOffCounts } = this.validateDayOffFairness(finalAssignments);
            
            return {
              success: true,
              assignments: finalAssignments,
              warnings: warnings,
              dayOffStats: performerDayOffCounts,
              generationId: Date.now().toString(36) + Math.random().toString(36).substring(2),
              generatedAt: new Date().toISOString()
            };
          }
        }
      }

      // If we couldn't find a complete solution, try a partial one with very relaxed constraints
      this.clearAllAssignments();
      const partialResult = this.generatePartialSchedule();
      
      if (partialResult.success || partialResult.assignments.length > 0) {
        const finalAssignments = this.assignRedDays(partialResult.assignments);
        
        // Add fairness validation for partial results too
        const { warnings, performerDayOffCounts } = this.validateDayOffFairness(finalAssignments);
        
        return {
          success: true,
          assignments: finalAssignments,
          errors: partialResult.errors,
          warnings: warnings,
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
        // Fallback to old logic if new logic fails
        // Fallback to old logic when fair selection provides insufficient candidates
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
      const offMembers = this.selectOffMembersOld(showId);
      this.offAssignments.get(showId)!.length = 0;
      this.offAssignments.get(showId)!.push(...offMembers);
    }
    
    return true;
  }

  // Helper methods for the new assignRolesForShow structure

  private getEligiblePerformers(role: Role, showId: string): CastMember[] {
    return this.castMembers
      .filter(member => member.eligibleRoles.includes(role))
      .filter(member => {
        // CHECK 1: Not already assigned to this show
        if (this.isPerformerAssignedToShow(member.name, showId)) {
          return false;
        }
        
        // CHECK 2: Won't create consecutive show violation (max 6)
        if (!this.canAssignPerformerToShow(member.name, showId)) {
          return false;
        }
        
        // CHECK 3: Won't create weekend 4-show violation
        if (this.wouldViolateWeekendRule(member.name, showId)) {
          return false;
        }
        
        // CHECK 4: Won't create back-to-back double days violation
        if (this.wouldViolateBackToBackDoubleDays(member.name, showId)) {
          return false;
        }
        
        // CHECK 5: Haven't exceeded weekly limit (max 6 shows)
        if (this.hasExceededWeeklyLimit(member.name)) {
          return false;
        }
        
        // CHECK 6: Gender constraints for female-only roles
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

  // Assign RED days to OFF performers with company day off handling
  private assignRedDays(assignments: Assignment[]): Assignment[] {
    const companyDayOff = this.detectCompanyDayOff();
    const allPerformers = this.castMembers.map(m => m.name);
    
    // If there's a company day off, handle it differently
    if (companyDayOff) {
      const companyDayOffShowIds = this.shows
        .filter(s => s.date === companyDayOff && s.status === 'dayoff')
        .map(s => s.id);
      
      // Mark all performers as RED on the company day off
      const finalAssignments: Assignment[] = [...assignments];
      
      // Add RED day assignments for company day off
      for (const showId of companyDayOffShowIds) {
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
        if (a.role === 'OFF' && !companyDayOffShowIds.includes(a.showId)) {
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
        // Sort by preference: weekdays first, then by number of shows (fewer preferred)
        const sortedDaysOff = naturalDaysOff.sort((a, b) => {
          const aIsWeekend = this.isWeekend(a);
          const bIsWeekend = this.isWeekend(b);
          
          // Prefer weekdays over weekends
          if (aIsWeekend !== bIsWeekend) {
            return aIsWeekend ? 1 : -1;
          }
          
          // Then prefer days with fewer shows
          const showsOnA = showsByDate[a]?.length || 99;
          const showsOnB = showsByDate[b]?.length || 99;
          return showsOnA - showsOnB;
        });
        
        performerRedDays[performer] = sortedDaysOff[0];
      }
    }
    
    // For performers without natural days off, create forced RED days
    const performersWithoutRedDays = allPerformers.filter(p => !performerRedDays[p]);
    
    for (const performer of performersWithoutRedDays) {
      // Find the best day to give them off (prefer weekdays, avoid back-to-back double days)
      let bestDate = availableDates[0];
      let bestScore = -1;
      
      for (const date of availableDates) {
        // Skip if this date is already assigned as RED day to this performer
        if (performerRedDays[performer]) continue;
        
        const isWeekend = this.isWeekend(date);
        const isBackToBackDouble = this.isBackToBackDoubleDay(date);
        const showsOnDate = showsByDate[date];
        
        // Calculate score (higher is better)
        let score = 0;
        if (!isWeekend) score += 10; // Strongly prefer weekdays
        if (!isBackToBackDouble) score += 5; // Avoid back-to-back double days when possible
        score += (3 - showsOnDate.length); // Prefer days with fewer shows
        
        if (score > bestScore) {
          bestScore = score;
          bestDate = date;
        }
      }
      
      // Assign this performer to their RED day
      performerRedDays[performer] = bestDate;
      
      // Remove this performer from all shows on their RED day
      const showsOnRedDate = showsByDate[bestDate];
      for (const show of showsOnRedDate) {
        const existingAssignmentIndex = finalAssignments.findIndex(a => 
          a.showId === show.id && a.performer === performer
        );
        if (existingAssignmentIndex !== -1) {
          // Remove the assignment to create the day off
          finalAssignments.splice(existingAssignmentIndex, 1);
        }
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

  // Helper method to determine if a date is a weekend
  private isWeekend(date: string): boolean {
    const dayOfWeek = new Date(date).getDay();
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
      this.roles.forEach(role => {
        showAssignment[role] = "";
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
    if (this._performerShowCache !== null) {
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

  // Optimized check for consecutive shows
  private areShowsConsecutive(show1: Show, show2: Show): boolean {
    try {
      const date1 = new Date(`${show1.date}T${show1.time}`);
      const date2 = new Date(`${show2.date}T${show2.time}`);
      const daysDiff = Math.floor((date2.getTime() - date1.getTime()) / (1000 * 60 * 60 * 24));
      return daysDiff <= 2; // Allow up to 2 days gap
    } catch (error) {
      return false;
    }
  }

  public validateSchedule(assignments: Assignment[]): ConstraintResult {
    const errors: string[] = [];
    const warnings: string[] = [];

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
      
      // CRITICAL: Check if exactly 8 performers per show
      const uniquePerformers = new Set(stageAssignments.map(a => a.performer));
      if (uniquePerformers.size !== 8) {
        if (uniquePerformers.size < 8) {
          const missingCount = 8 - uniquePerformers.size;
          errors.push(`Show ${showDate}: Missing ${missingCount} performer${missingCount > 1 ? 's' : ''} - must have exactly 8 on stage`);
        } else {
          errors.push(`Show ${showDate}: Has ${uniquePerformers.size} performers but can only have 8 - remove duplicate assignments`);
        }
      }

      // Check if all roles are filled
      const filledRoles = new Set(stageAssignments.map(a => a.role));
      if (filledRoles.size !== 8) {
        if (filledRoles.size < 8) {
          const missingRoles = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"]
            .filter(role => !filledRoles.has(role as Role));
          errors.push(`Show ${showDate}: Missing roles: ${missingRoles.join(", ")} - assign performers to these roles`);
        }
      }

      // Check role eligibility with gender constraints
      for (const assignment of stageAssignments) {
        const castMember = this.castMembers.find(m => m.name === assignment.performer);
        if (!castMember) {
          errors.push(`Show ${showDate}: Unknown performer "${assignment.performer}" assigned to ${assignment.role}`);
        } else if (!castMember.eligibleRoles.includes(assignment.role as Role)) {
          errors.push(`Show ${showDate}: ${assignment.performer} cannot perform ${assignment.role} - not in eligible roles`);
        } else if (FEMALE_ONLY_ROLES.includes(assignment.role as Role)) {
          // Check gender constraint for female-only roles
          const femaleNames = ["MOLLY", "JASMINE", "SERENA"];
          if (!femaleNames.includes(assignment.performer)) {
            errors.push(`Show ${showDate}: ${assignment.performer} cannot perform ${assignment.role} - role requires female performer`);
          }
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
          errors.push(`Show ${showDate}: ${performer} assigned to multiple roles (${roles.join(", ")}) - each performer can only have one role per show`);
        }
      }
    }

    // CRITICAL: Use optimized consecutive shows analysis (max 6, not 3)
    const performerData = this.analyzeConsecutiveShows(assignments);
    for (const [memberName, data] of performerData) {
      for (const sequence of data.sequences) {
        if (sequence.count > 6) {
          errors.push(`${memberName} has ${sequence.count} consecutive shows (${sequence.startDate} to ${sequence.endDate}) - exceeds maximum of 6 consecutive shows`);
        }
      }
    }

    // NEW: Validate back-to-back double days rule
    for (const member of this.castMembers) {
      const performerShows = assignments
        .filter(a => a.performer === member.name && a.role !== 'OFF')
        .map(a => activeShows.find(s => s.id === a.showId))
        .filter((s): s is Show => s !== undefined);

      const showsByDate: Record<string, Show[]> = {};
      performerShows.forEach(show => {
        if (!showsByDate[show.date]) showsByDate[show.date] = [];
        showsByDate[show.date].push(show);
      });

      const dates = Object.keys(showsByDate).sort();
      for (let i = 0; i < dates.length - 1; i++) {
        if (showsByDate[dates[i]].length === 2 && showsByDate[dates[i + 1]].length === 2) {
          const d1 = new Date(dates[i]);
          const d2 = new Date(dates[i + 1]);
          if ((d2.getTime() - d1.getTime()) === 86400000) { // Consecutive days
            errors.push(`${member.name} has 4 shows across 2 consecutive days (${dates[i]} and ${dates[i + 1]}) - violates back-to-back double days rule`);
          }
        }
      }
    }

    // Weekend Rule Validation
    for (const member of this.castMembers) {
        const performerShows = assignments
            .filter(a => a.performer === member.name && a.role !== 'OFF')
            .map(a => activeShows.find(s => s.id === a.showId))
            .filter((s): s is Show => s !== undefined);

        const showsByWeekend: Record<string, Show[]> = {};
        for (const show of performerShows) {
            const showDate = new Date(show.date + 'T12:00:00Z');
            const dayOfWeek = showDate.getUTCDay();
            if (dayOfWeek >= 5 || dayOfWeek === 0) { // Fri, Sat, Sun
                const mondayDate = new Date(showDate);
                const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
                mondayDate.setUTCDate(mondayDate.getUTCDate() + offset);
                const weekKey = mondayDate.toISOString().split('T')[0];
                if (!showsByWeekend[weekKey]) showsByWeekend[weekKey] = [];
                showsByWeekend[weekKey].push(show);
            }
        }

        for (const weekKey in showsByWeekend) {
            if (showsByWeekend[weekKey].length > 4) {
                errors.push(`${member.name} has ${showsByWeekend[weekKey].length} shows over a weekend (Fri-Sun) - exceeds maximum of 4.`);
            }
        }
    }

    // RED Day Validation
    const performerRedDays: Record<string, string[]> = {};
    this.castMembers.forEach(m => performerRedDays[m.name] = []);

    const offAssignments = assignments.filter(a => a.role === 'OFF' && a.isRedDay);
    offAssignments.forEach(a => {
        const show = activeShows.find(s => s.id === a.showId);
        if (show) {
            if (!performerRedDays[a.performer].includes(show.date)) {
                performerRedDays[a.performer].push(show.date);
            }
        }
    });

    for (const performer in performerRedDays) {
        if (performerRedDays[performer].length > 1) {
            errors.push(`${performer} has more than one RED day assigned.`);
        }
        if (this.castMembers.some(m => m.name === performer) && performerRedDays[performer].length === 0) {
            warnings.push(`${performer} does not have a RED day assigned.`);
        }

        for (const redDate of performerRedDays[performer]) {
            const showsOnRedDate = activeShows.filter(s => s.date === redDate);
            const assignmentsOnRedDate = assignments.filter(a => a.performer === performer && showsOnRedDate.some(s => s.id === a.showId));
            const isFullDayOff = assignmentsOnRedDate.every(a => a.role === 'OFF');
            if (!isFullDayOff) {
                errors.push(`${performer} has a RED day on ${redDate} but is also assigned to a role on that day.`);
            }
        }
    }

    // Check show distribution with specific suggestions
    const showCounts = this.getShowCounts(assignments, activeShows);
    const averageShows = activeShows.length > 0 ? activeShows.length / this.castMembers.length : 0;
    
    for (const [performer, count] of Object.entries(showCounts)) {
      if (count < 2 && count > 0 && activeShows.length >= 4) {
        warnings.push(`${performer} only has ${count} show${count === 1 ? '' : 's'} (underutilized)`);
      } else if (count > Math.ceil(averageShows * 1.5) && activeShows.length > 4) {
        warnings.push(`${performer} has ${count} shows (potentially overworked)`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  private formatDateForValidation(date: string, time: string): string {
    try {
      const dateObj = new Date(date);
      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
      const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
