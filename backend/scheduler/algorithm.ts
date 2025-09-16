import { Role, Show, Assignment, CastMember, FEMALE_ONLY_ROLES } from "./types";

export interface AutoGenerateResult {
  success: boolean;
  assignments: Assignment[];
  errors?: string[];
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
    
    this.castMembers = castMembers || [];
    
    // Initialize empty assignments for all shows
    shows.forEach(show => {
      const showAssignment: ShowAssignment = {};
      const roles: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];
      roles.forEach(role => {
        showAssignment[role] = "";
      });
      this.assignments.set(show.id, showAssignment);
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
            return {
              success: true,
              assignments: finalAssignments,
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
        return {
          success: true,
          assignments: finalAssignments,
          errors: partialResult.errors,
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
    const roles: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];
    
    // Randomize role order to avoid patterns
    const shuffledRoles = this.shuffle(roles);

    // Get roles sorted by difficulty (fewest eligible performers first)
    const rolesByDifficulty = shuffledRoles.sort((a, b) => {
      const aEligible = this.castMembers.filter(member => member.eligibleRoles.includes(a)).length;
      const bEligible = this.castMembers.filter(member => member.eligibleRoles.includes(b)).length;
      return aEligible - bEligible;
    });

    for (const role of rolesByDifficulty) {
      const eligiblePerformers = this.castMembers
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
        })
        .sort((a, b) => {
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

      if (eligiblePerformers.length === 0) {
        return false; // No eligible performers for this role
      }

      // Assign the best performer
      showAssignment[role] = eligiblePerformers[0].name;
    }

    return true;
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

  // Assign RED days to OFF performers
  private assignRedDays(assignments: Assignment[]): Assignment[] {
    const allPerformers = this.castMembers.map(m => m.name);
    const showsByDate: Record<string, Show[]> = {};
    this.shows.filter(s => s.status === 'show').forEach(show => {
        if (!showsByDate[show.date]) showsByDate[show.date] = [];
        showsByDate[show.date].push(show);
    });

    const performerFullDaysOff: Record<string, string[]> = {};
    for (const performer of allPerformers) {
        performerFullDaysOff[performer] = [];
    }

    // Step 1 & 2: Identify full days off for each performer
    for (const date in showsByDate) {
        const showsOnThisDate = showsByDate[date];
        const showsOnThisDateIds = new Set(showsOnThisDate.map(s => s.id));

        for (const performer of allPerformers) {
            const performerShowsOnDate = assignments.filter(a => 
                a.performer === performer && showsOnThisDateIds.has(a.showId)
            );
            // If performer has no assignments on this date, it's a full day off
            if (performerShowsOnDate.length === 0) {
                performerFullDaysOff[performer].push(date);
            }
        }
    }

    // Step 3: Assign one RED day per performer
    const performerRedDays: Record<string, string> = {};
    for (const performer of allPerformers) {
        const fullDaysOff = performerFullDaysOff[performer];
        if (fullDaysOff.length > 0) {
            // Prioritize single-show days (weekdays)
            const sortedDaysOff = fullDaysOff.sort((a, b) => {
                const showsOnA = showsByDate[a]?.length || 99;
                const showsOnB = showsByDate[b]?.length || 99;
                return showsOnA - showsOnB;
            });
            performerRedDays[performer] = sortedDaysOff[0];
        }
    }

    // Step 4: Create final assignments including OFF and RED days
    const finalAssignments: Assignment[] = [];
    
    // Add stage assignments
    for (const assignment of assignments) {
        if (assignment.role !== 'OFF') {
            finalAssignments.push(assignment);
        }
    }

    // Add OFF assignments
    this.shows.filter(s => s.status === 'show').forEach(show => {
        const performersOnShow = new Set(finalAssignments.filter(a => a.showId === show.id).map(a => a.performer));
        const offPerformers = allPerformers.filter(p => !performersOnShow.has(p));

        offPerformers.forEach(performer => {
            const isRedDay = performerRedDays[performer] === show.date;
            finalAssignments.push({
                showId: show.id,
                role: 'OFF',
                performer: performer,
                isRedDay: isRedDay
            });
        });
    });

    return finalAssignments;
  }

  private clearAllAssignments(): void {
    this.clearCaches();
    
    const roles: Role[] = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];
    this.shows.forEach(show => {
      const showAssignment: ShowAssignment = {};
      roles.forEach(role => {
        showAssignment[role] = "";
      });
      this.assignments.set(show.id, showAssignment);
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
