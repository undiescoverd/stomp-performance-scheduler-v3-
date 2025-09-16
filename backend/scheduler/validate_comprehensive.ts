import { api } from "encore.dev/api";
import { Show, Assignment } from "./types";
import { SchedulingAlgorithm, ConstraintResult } from "./algorithm";

export interface ValidateComprehensiveRequest {
  shows: Show[];
  assignments: Assignment[];
}

export interface ValidationIssue {
  type: "error" | "warning" | "info";
  category: "role_eligibility" | "consecutive_shows" | "load_balancing" | "special_days" | "completeness" | "conflicts";
  message: string;
  performer?: string;
  showId?: string;
  role?: string;
  severity: "critical" | "high" | "medium" | "low";
  suggestion?: string;
}

export interface LoadBalancingStats {
  performer: string;
  showCount: number;
  expectedRange: { min: number; max: number };
  status: "underutilized" | "optimal" | "overworked" | "critical";
  variance: number;
}

export interface ConsecutiveShowAnalysis {
  performer: string;
  maxConsecutive: number;
  sequences: Array<{
    startDate: string;
    endDate: string;
    count: number;
    severity: "ok" | "warning" | "critical";
  }>;
}

export interface ValidateComprehensiveResponse {
  isValid: boolean;
  overallScore: number; // 0-100, where 100 is perfect
  summary: {
    totalIssues: number;
    criticalErrors: number;
    warnings: number;
    completionPercentage: number;
  };
  issues: ValidationIssue[];
  loadBalancing: LoadBalancingStats[];
  consecutiveAnalysis: ConsecutiveShowAnalysis[];
  roleCompleteness: Array<{
    role: string;
    filledShows: number;
    totalShows: number;
    completionPercentage: number;
    missingShows: string[];
  }>;
  specialDayHandling: {
    travelDays: number;
    dayOffs: number;
    totalSpecialDays: number;
    impactOnScheduling: string;
  };
  recommendations: string[];
}

// Provides comprehensive validation of schedule with detailed business logic analysis.
export const validateComprehensive = api<ValidateComprehensiveRequest, ValidateComprehensiveResponse>(
  { expose: true, method: "POST", path: "/schedules/validate-comprehensive" },
  async (req) => {
    // Get current cast members from company system
    const { getCastMembers } = await import("./cast_members");
    const castData = await getCastMembers();
    
    const algorithm = new SchedulingAlgorithm(req.shows, castData.castMembers);
    const basicValidation = algorithm.validateSchedule(req.assignments);
    
    const issues: ValidationIssue[] = [];
    const recommendations: string[] = [];
    
    // Filter active shows for analysis
    const activeShows = req.shows.filter(show => show.status === "show");
    const specialDays = req.shows.filter(show => show.status !== "show");
    
    // Helper function to format dates
    const formatDateForDisplay = (date: string, time: string): string => {
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
    };

    // Helper function to get alternative performers
    const getAlternativePerformers = (role: string, excludePerformer?: string, showId?: string): string[] => {
      const showAssignments = showId ? req.assignments.filter(a => a.showId === showId) : [];
      const assignedPerformers = new Set(showAssignments.map(a => a.performer));
      
      return castData.castMembers
        .filter(member => 
          member.eligibleRoles.includes(role as any) && 
          member.name !== excludePerformer &&
          (!showId || !assignedPerformers.has(member.name))
        )
        .map(member => member.name);
    };
    
    // 1. Role Eligibility Validation with specific suggestions
    const roleEligibilityIssues = validateRoleEligibilityWithSuggestions(req.assignments, castData.castMembers, activeShows, formatDateForDisplay, getAlternativePerformers);
    issues.push(...roleEligibilityIssues);
    
    // 2. Consecutive Shows Analysis with specific suggestions
    const consecutiveAnalysis = analyzeConsecutiveShows(req.assignments, activeShows, castData.castMembers, formatDateForDisplay, getAlternativePerformers);
    consecutiveAnalysis.forEach(analysis => {
      analysis.sequences.forEach(sequence => {
        if (sequence.severity === "critical") {
          const suggestions = getConsecutiveShowSuggestions(analysis.performer, sequence, req.assignments, activeShows, formatDateForDisplay, getAlternativePerformers);
          issues.push({
            type: "error",
            category: "consecutive_shows",
            message: `${analysis.performer} has ${sequence.count} consecutive shows from ${sequence.startDate} to ${sequence.endDate} (critical burnout risk)`,
            performer: analysis.performer,
            severity: "critical",
            suggestion: suggestions
          });
        } else if (sequence.severity === "warning") {
          const suggestions = getConsecutiveShowSuggestions(analysis.performer, sequence, req.assignments, activeShows, formatDateForDisplay, getAlternativePerformers);
          issues.push({
            type: "warning",
            category: "consecutive_shows",
            message: `${analysis.performer} has ${sequence.count} consecutive shows from ${sequence.startDate} to ${sequence.endDate}`,
            performer: analysis.performer,
            severity: "medium",
            suggestion: suggestions
          });
        }
      });
    });
    
    // 3. Load Balancing Analysis with specific suggestions
    const loadBalancing = analyzeLoadBalancing(req.assignments, activeShows, castData.castMembers);
    loadBalancing.forEach(stats => {
      if (stats.status === "critical") {
        const suggestions = getOverworkedSuggestions(stats.performer, req.assignments, activeShows, formatDateForDisplay, getAlternativePerformers);
        issues.push({
          type: "error",
          category: "load_balancing",
          message: `${stats.performer} has ${stats.showCount} shows (extremely overworked)`,
          performer: stats.performer,
          severity: "critical",
          suggestion: suggestions
        });
      } else if (stats.status === "overworked") {
        const suggestions = getOverworkedSuggestions(stats.performer, req.assignments, activeShows, formatDateForDisplay, getAlternativePerformers);
        issues.push({
          type: "warning",
          category: "load_balancing",
          message: `${stats.performer} has ${stats.showCount} shows (above optimal range)`,
          performer: stats.performer,
          severity: "high",
          suggestion: suggestions
        });
      } else if (stats.status === "underutilized") {
        const suggestions = getUnderutilizedSuggestions(stats.performer, req.assignments, activeShows, castData.castMembers, formatDateForDisplay);
        issues.push({
          type: "warning",
          category: "load_balancing",
          message: `${stats.performer} has only ${stats.showCount} shows (underutilized)`,
          performer: stats.performer,
          severity: "low",
          suggestion: suggestions
        });
      }
    });
    
    // 4. Role Completeness Analysis with specific suggestions
    const roleCompleteness = analyzeRoleCompleteness(req.assignments, activeShows);
    roleCompleteness.forEach(roleStats => {
      if (roleStats.completionPercentage < 100) {
        const severity = roleStats.completionPercentage < 50 ? "critical" : 
                        roleStats.completionPercentage < 80 ? "high" : "medium";
        
        const eligiblePerformers = castData.castMembers
          .filter(member => member.eligibleRoles.includes(roleStats.role as any))
          .map(member => member.name);
        
        let suggestion = `Assign ${roleStats.role} for remaining shows: ${roleStats.missingShows.join(", ")}`;
        if (eligiblePerformers.length > 0) {
          suggestion += `. Eligible performers: ${eligiblePerformers.slice(0, 3).join(", ")}${eligiblePerformers.length > 3 ? ` and ${eligiblePerformers.length - 3} others` : ""}`;
        }
        
        issues.push({
          type: roleStats.completionPercentage < 100 ? "error" : "warning",
          category: "completeness",
          message: `Role ${roleStats.role} is only ${roleStats.completionPercentage}% complete (${roleStats.filledShows}/${roleStats.totalShows} shows)`,
          role: roleStats.role,
          severity: severity as "critical" | "high" | "medium",
          suggestion: suggestion
        });
      }
    });
    
    // 5. Conflict Detection with specific suggestions
    const conflictIssues = detectConflictsWithSuggestions(req.assignments, activeShows, formatDateForDisplay, getAlternativePerformers);
    issues.push(...conflictIssues);
    
    // 6. Special Day Handling
    const specialDayHandling = analyzeSpecialDayHandling(specialDays, req.assignments);
    if (specialDayHandling.impactOnScheduling === "high") {
      issues.push({
        type: "info",
        category: "special_days",
        message: `${specialDayHandling.totalSpecialDays} special days may impact cast availability`,
        severity: "low",
        suggestion: "Ensure adequate cast coverage around travel and day-off periods"
      });
    }
    
    // 7. Generate Smart Recommendations
    const smartRecommendations = generateSmartRecommendations(issues, loadBalancing, consecutiveAnalysis, roleCompleteness, activeShows.length);
    recommendations.push(...smartRecommendations);
    
    // 8. Calculate Overall Score
    const completionPercentage = calculateCompletionPercentage(req.assignments, activeShows);
    const overallScore = calculateOverallScore(issues, completionPercentage, activeShows.length);
    
    // 9. Categorize Issues by Severity
    const criticalErrors = issues.filter(i => i.type === "error" && i.severity === "critical").length;
    const warnings = issues.filter(i => i.type === "warning").length;
    
    return {
      isValid: criticalErrors === 0 && completionPercentage === 100,
      overallScore,
      summary: {
        totalIssues: issues.length,
        criticalErrors,
        warnings,
        completionPercentage
      },
      issues,
      loadBalancing,
      consecutiveAnalysis,
      roleCompleteness,
      specialDayHandling,
      recommendations
    };
  }
);

function validateRoleEligibilityWithSuggestions(assignments: Assignment[], castMembers: any[], activeShows: Show[], formatDateForDisplay: Function, getAlternativePerformers: Function): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  
  assignments.forEach(assignment => {
    const show = activeShows.find(s => s.id === assignment.showId);
    if (!show) return;
    
    const showDate = formatDateForDisplay(show.date, show.time);
    const castMember = castMembers.find(m => m.name === assignment.performer);
    
    if (!castMember) {
      issues.push({
        type: "error",
        category: "role_eligibility",
        message: `Unknown performer: ${assignment.performer} assigned to ${assignment.role} on ${showDate}`,
        performer: assignment.performer,
        showId: assignment.showId,
        role: assignment.role,
        severity: "critical",
        suggestion: "Verify performer name in cast list or remove this assignment"
      });
    } else if (!castMember.eligibleRoles.includes(assignment.role)) {
      const alternatives = getAlternativePerformers(assignment.role, assignment.performer, assignment.showId);
      let suggestion = `${assignment.performer} cannot perform ${assignment.role}`;
      
      if (alternatives.length > 0) {
        suggestion += ` - replace with ${alternatives.slice(0, 2).join(" or ")}`;
      } else {
        suggestion += " - no eligible performers available for this role";
      }
      
      issues.push({
        type: "error",
        category: "role_eligibility",
        message: `${assignment.performer} is not eligible for role ${assignment.role} on ${showDate}`,
        performer: assignment.performer,
        showId: assignment.showId,
        role: assignment.role,
        severity: "critical",
        suggestion: suggestion
      });
    }
  });
  
  return issues;
}

function analyzeConsecutiveShows(assignments: Assignment[], activeShows: Show[], castMembers: any[], formatDateForDisplay: Function, getAlternativePerformers: Function): ConsecutiveShowAnalysis[] {
  const analysis: ConsecutiveShowAnalysis[] = [];
  
  castMembers.forEach(member => {
    const memberShows = new Set<string>();
    assignments.forEach(assignment => {
      if (assignment.performer === member.name) {
        memberShows.add(assignment.showId);
      }
    });
    
    if (memberShows.size === 0) {
      analysis.push({
        performer: member.name,
        maxConsecutive: 0,
        sequences: []
      });
      return;
    }
    
    // Sort shows by date and time
    const sortedShows = [...activeShows]
      .filter(show => memberShows.has(show.id))
      .sort((a, b) => {
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        return a.time.localeCompare(b.time);
      });
    
    const sequences: Array<{
      startDate: string;
      endDate: string;
      count: number;
      severity: "ok" | "warning" | "critical";
      showIds: string[];
    }> = [];
    
    let currentSequence: { startDate: string; endDate: string; count: number; showIds: string[]; severity?: "ok" | "warning" | "critical" } | null = null;
    let maxConsecutive = 0;
    let lastShowDate: Date | null = null;
    
    sortedShows.forEach((show, index) => {
      const showDate = new Date(`${show.date}T${show.time}`);
      
      if (lastShowDate) {
        const daysDiff = Math.floor((showDate.getTime() - lastShowDate.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysDiff <= 2) { // Consider consecutive if within 2 days
          if (currentSequence) {
            currentSequence.count++;
            currentSequence.endDate = formatDateForDisplay(show.date, show.time);
            currentSequence.showIds.push(show.id);
          } else {
            // Start new sequence
            const prevShow = sortedShows[index - 1];
            currentSequence = {
              startDate: formatDateForDisplay(prevShow?.date || show.date, prevShow?.time || show.time),
              endDate: formatDateForDisplay(show.date, show.time),
              count: 2,
              showIds: [prevShow?.id || show.id, show.id]
            };
          }
        } else {
          // End current sequence
          if (currentSequence && currentSequence.count >= 3) {
            const seq = currentSequence as { startDate: string; endDate: string; count: number; showIds: string[] };
            const severity = seq.count >= 6 ? "critical" : "ok";
            sequences.push({ 
              startDate: seq.startDate,
              endDate: seq.endDate,
              count: seq.count,
              showIds: seq.showIds,
              severity 
            });
            maxConsecutive = Math.max(maxConsecutive, seq.count);
          }
          currentSequence = null;
        }
      }
      
      lastShowDate = showDate;
    });
    
    // Handle final sequence
    if (currentSequence && (currentSequence as any).count >= 3) {
      const seq = currentSequence as { startDate: string; endDate: string; count: number; showIds: string[] };
      const severity = seq.count >= 6 ? "critical" : "ok";
      sequences.push({ 
        startDate: seq.startDate,
        endDate: seq.endDate,
        count: seq.count,
        showIds: seq.showIds,
        severity 
      });
      maxConsecutive = Math.max(maxConsecutive, seq.count);
    }
    
    analysis.push({
      performer: member.name,
      maxConsecutive,
      sequences: sequences.map(seq => ({
        startDate: seq.startDate,
        endDate: seq.endDate,
        count: seq.count,
        severity: seq.severity
      }))
    });
  });
  
  return analysis;
}

function getConsecutiveShowSuggestions(performer: string, sequence: any, assignments: Assignment[], activeShows: Show[], formatDateForDisplay: Function, getAlternativePerformers: Function): string {
  const suggestions: string[] = [];
  
  // Find assignments for this performer in the sequence period
  const performerAssignments = assignments.filter(a => a.performer === performer);
  const sequenceShows = activeShows.filter(show => {
    const showDate = new Date(`${show.date}T${show.time}`);
    const sequenceStart = new Date(sequence.startDate);
    const sequenceEnd = new Date(sequence.endDate);
    return showDate >= sequenceStart && showDate <= sequenceEnd;
  });
  
  if (sequenceShows.length >= 3) {
    // Suggest replacing in the middle of the sequence
    const middleIndex = Math.floor(sequenceShows.length / 2);
    const middleShow = sequenceShows[middleIndex];
    const assignment = performerAssignments.find(a => a.showId === middleShow.id);
    
    if (assignment) {
      const alternatives = getAlternativePerformers(assignment.role, performer, middleShow.id);
      if (alternatives.length > 0) {
        const showDate = formatDateForDisplay(middleShow.date, middleShow.time);
        suggestions.push(`Replace ${performer} with ${alternatives[0]} for ${assignment.role} on ${showDate}`);
      }
    }
  }
  
  // Suggest general break
  if (suggestions.length === 0) {
    suggestions.push(`Give ${performer} a break by reassigning 1-2 shows in this sequence to other cast members`);
  }
  
  return suggestions.join(". ");
}

function getOverworkedSuggestions(performer: string, assignments: Assignment[], activeShows: Show[], formatDateForDisplay: Function, getAlternativePerformers: Function): string {
  const suggestions: string[] = [];
  
  // Find this performer's assignments and suggest redistributing recent ones
  const performerAssignments = assignments.filter(a => a.performer === performer);
  
  if (performerAssignments.length > 2) {
    // Sort by show date to get most recent assignments
    const sortedAssignments = performerAssignments.map(assignment => {
      const show = activeShows.find(s => s.id === assignment.showId);
      return { assignment, show };
    }).filter(item => item.show)
      .sort((a, b) => {
        const dateA = new Date(`${a.show!.date}T${a.show!.time}`);
        const dateB = new Date(`${b.show!.date}T${b.show!.time}`);
        return dateB.getTime() - dateA.getTime(); // Most recent first
      });
    
    // Suggest redistributing 1-2 recent assignments
    for (let i = 0; i < Math.min(2, sortedAssignments.length); i++) {
      const { assignment, show } = sortedAssignments[i];
      const alternatives = getAlternativePerformers(assignment.role, performer, assignment.showId);
      
      if (alternatives.length > 0 && show) {
        const showDate = formatDateForDisplay(show.date, show.time);
        suggestions.push(`reassign ${assignment.role} on ${showDate} to ${alternatives[0]}`);
        break; // Only suggest one specific change to avoid overwhelming
      }
    }
  }
  
  if (suggestions.length === 0) {
    suggestions.push(`Consider redistributing 2-3 of ${performer}'s assignments to other cast members`);
  }
  
  return suggestions.join(", ");
}

function getUnderutilizedSuggestions(performer: string, assignments: Assignment[], activeShows: Show[], castMembers: any[], formatDateForDisplay: Function): string {
  const suggestions: string[] = [];
  
  // Find shows where this performer is not assigned but could be
  const performerMember = castMembers.find(m => m.name === performer);
  if (!performerMember) return "verify performer availability";
  
  const assignedShowIds = new Set(assignments.filter(a => a.performer === performer).map(a => a.showId));
  const unassignedShows = activeShows.filter(show => !assignedShowIds.has(show.id));
  
  if (unassignedShows.length > 0) {
    // Look for roles this performer could fill in unassigned shows
    for (const show of unassignedShows.slice(0, 2)) { // Check first 2 shows
      const showAssignments = assignments.filter(a => a.showId === show.id);
      const unfilledRoles = performerMember.eligibleRoles.filter((role: string) => 
        !showAssignments.some(a => a.role === role)
      );
      
      if (unfilledRoles.length > 0) {
        const showDate = formatDateForDisplay(show.date, show.time);
        suggestions.push(`assign ${performer} to ${unfilledRoles[0]} role on ${showDate}`);
        break;
      }
    }
  }
  
  if (suggestions.length === 0) {
    suggestions.push(`Look for opportunities to assign ${performer} to additional shows where they can perform eligible roles`);
  }
  
  return suggestions.join(", ");
}

function analyzeLoadBalancing(assignments: Assignment[], activeShows: Show[], castMembers: any[]): LoadBalancingStats[] {
  const stats: LoadBalancingStats[] = [];
  
  // Calculate show counts per performer
  const showCounts: Record<string, number> = {};
  castMembers.forEach(member => {
    showCounts[member.name] = 0;
  });
  
  const showPerformers = new Map<string, Set<string>>();
  assignments.forEach(assignment => {
    if (activeShows.some(show => show.id === assignment.showId)) {
      if (!showPerformers.has(assignment.showId)) {
        showPerformers.set(assignment.showId, new Set());
      }
      showPerformers.get(assignment.showId)!.add(assignment.performer);
    }
  });
  
  for (const [, performers] of showPerformers) {
    for (const performer of performers) {
      if (showCounts.hasOwnProperty(performer)) {
        showCounts[performer]++;
      }
    }
  }
  
  // Calculate expected range
  const totalShows = activeShows.length;
  const totalPerformers = castMembers.length;
  const averageShows = totalShows > 0 ? totalShows / totalPerformers : 0;
  const expectedMin = Math.max(0, Math.floor(averageShows * 0.7));
  const expectedMax = Math.ceil(averageShows * 1.3);
  
  castMembers.forEach(member => {
    const count = showCounts[member.name] || 0;
    const variance = Math.abs(count - averageShows);
    
    let status: "underutilized" | "optimal" | "overworked" | "critical";
    if (count === 0 || count < expectedMin) {
      status = "underutilized";
    } else if (count > expectedMax * 1.5) {
      status = "critical";
    } else if (count > expectedMax) {
      status = "overworked";
    } else {
      status = "optimal";
    }
    
    stats.push({
      performer: member.name,
      showCount: count,
      expectedRange: { min: expectedMin, max: expectedMax },
      status,
      variance
    });
  });
  
  return stats;
}

function analyzeRoleCompleteness(assignments: Assignment[], activeShows: Show[]) {
  const roles = ["Sarge", "Potato", "Mozzie", "Ringo", "Particle", "Bin", "Cornish", "Who"];
  
  return roles.map(role => {
    const roleAssignments = assignments.filter(a => 
      a.role === role && activeShows.some(show => show.id === a.showId)
    );
    
    const filledShows = roleAssignments.length;
    const totalShows = activeShows.length;
    const completionPercentage = totalShows > 0 ? Math.round((filledShows / totalShows) * 100) : 100;
    
    const assignedShowIds = new Set(roleAssignments.map(a => a.showId));
    const missingShows = activeShows
      .filter(show => !assignedShowIds.has(show.id))
      .map(show => {
        try {
          const date = new Date(show.date);
          const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
          const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return `${dayName} ${monthDay}`;
        } catch {
          return show.date;
        }
      });
    
    return {
      role,
      filledShows,
      totalShows,
      completionPercentage,
      missingShows
    };
  });
}

function detectConflictsWithSuggestions(assignments: Assignment[], activeShows: Show[], formatDateForDisplay: Function, getAlternativePerformers: Function): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  
  // Group assignments by show
  const showAssignments = new Map<string, Assignment[]>();
  assignments.forEach(assignment => {
    if (activeShows.some(show => show.id === assignment.showId)) {
      if (!showAssignments.has(assignment.showId)) {
        showAssignments.set(assignment.showId, []);
      }
      showAssignments.get(assignment.showId)!.push(assignment);
    }
  });
  
  // Check for duplicate performers in same show
  for (const [showId, showAssigns] of showAssignments) {
    const show = activeShows.find(s => s.id === showId);
    if (!show) continue;
    
    const showDate = formatDateForDisplay(show.date, show.time);
    const performerCounts = new Map<string, Assignment[]>();
    
    showAssigns.forEach(assignment => {
      if (!performerCounts.has(assignment.performer)) {
        performerCounts.set(assignment.performer, []);
      }
      performerCounts.get(assignment.performer)!.push(assignment);
    });
    
    for (const [performer, duplicateAssignments] of performerCounts) {
      if (duplicateAssignments.length > 1) {
        const roles = duplicateAssignments.map(a => a.role);
        
        // Suggest alternatives for one of the roles
        const roleToReassign = roles[1]; // Suggest reassigning the second role
        const alternatives = getAlternativePerformers(roleToReassign, performer, showId);
        
        let suggestion = `${performer} is assigned to multiple roles (${roles.join(", ")})`;
        if (alternatives.length > 0) {
          suggestion += ` - reassign ${roleToReassign} to ${alternatives[0]}`;
        } else {
          suggestion += " - reassign one role to another available performer";
        }
        
        issues.push({
          type: "error",
          category: "conflicts",
          message: `${performer} is assigned multiple roles in show on ${showDate}`,
          performer,
          showId,
          severity: "critical",
          suggestion: suggestion
        });
      }
    }
  }
  
  return issues;
}

function analyzeSpecialDayHandling(specialDays: Show[], assignments: Assignment[]) {
  const travelDays = specialDays.filter(day => day.status === "travel").length;
  const dayOffs = specialDays.filter(day => day.status === "dayoff").length;
  const totalSpecialDays = specialDays.length;
  
  // Check for assignments on special days (which shouldn't happen)
  const specialDayAssignments = assignments.filter(assignment =>
    specialDays.some(day => day.id === assignment.showId)
  );
  
  let impactOnScheduling = "low";
  if (totalSpecialDays > 3) {
    impactOnScheduling = "high";
  } else if (totalSpecialDays > 1) {
    impactOnScheduling = "medium";
  }
  
  return {
    travelDays,
    dayOffs,
    totalSpecialDays,
    impactOnScheduling,
    invalidAssignments: specialDayAssignments.length
  };
}

function generateSmartRecommendations(issues: ValidationIssue[], loadBalancing: LoadBalancingStats[], consecutiveAnalysis: ConsecutiveShowAnalysis[], roleCompleteness: any[], totalShows: number): string[] {
  const recommendations: string[] = [];
  
  // Priority 1: Critical issues
  const criticalIssues = issues.filter(i => i.severity === "critical");
  if (criticalIssues.length > 0) {
    recommendations.push(`⚠️ Address ${criticalIssues.length} critical issue${criticalIssues.length > 1 ? 's' : ''} first - these prevent the schedule from being valid`);
  }
  
  // Priority 2: Load balancing
  const overworkedCount = loadBalancing.filter(lb => lb.status === "overworked" || lb.status === "critical").length;
  const underutilizedCount = loadBalancing.filter(lb => lb.status === "underutilized").length;
  
  if (overworkedCount > 0 && underutilizedCount > 0) {
    recommendations.push(`⚖️ Balance workload: ${overworkedCount} performer${overworkedCount > 1 ? 's' : ''} overworked, ${underutilizedCount} underutilized - redistribute assignments between them`);
  } else if (overworkedCount > 0) {
    recommendations.push(`📉 Reduce workload for ${overworkedCount} overworked performer${overworkedCount > 1 ? 's' : ''} to prevent burnout`);
  }
  
  // Priority 3: Consecutive shows
  const consecutiveWarnings = consecutiveAnalysis.filter(ca => ca.sequences.some(s => s.severity !== "ok")).length;
  if (consecutiveWarnings > 0) {
    recommendations.push(`🔄 Break up consecutive show sequences for ${consecutiveWarnings} performer${consecutiveWarnings > 1 ? 's' : ''} to maintain performance quality`);
  }
  
  // Priority 4: Completion
  const incompleteRoles = roleCompleteness.filter(rc => rc.completionPercentage < 100).length;
  if (incompleteRoles > 0) {
    recommendations.push(`✅ Complete role assignments: ${incompleteRoles} role${incompleteRoles > 1 ? 's' : ''} still need${incompleteRoles === 1 ? 's' : ''} performers assigned`);
  }
  
  // General recommendations based on schedule size
  if (totalShows >= 8) {
    recommendations.push(`📋 For ${totalShows} shows, consider creating a backup plan for performer substitutions`);
  }
  
  if (recommendations.length === 0) {
    recommendations.push("🎭 Schedule looks good! All major constraints are satisfied.");
  }
  
  return recommendations;
}

function calculateCompletionPercentage(assignments: Assignment[], activeShows: Show[]): number {
  const totalSlots = activeShows.length * 8; // 8 roles per show
  const filledSlots = assignments.filter(assignment =>
    activeShows.some(show => show.id === assignment.showId)
  ).length;
  
  return totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 100;
}

function calculateOverallScore(issues: ValidationIssue[], completionPercentage: number, totalShows: number): number {
  let score = 100;
  
  // Deduct points for issues
  issues.forEach(issue => {
    switch (issue.severity) {
      case "critical":
        score -= 20;
        break;
      case "high":
        score -= 10;
        break;
      case "medium":
        score -= 5;
        break;
      case "low":
        score -= 2;
        break;
    }
  });
  
  // Factor in completion percentage
  score = score * (completionPercentage / 100);
  
  // Bonus for complete schedules
  if (completionPercentage === 100 && issues.filter(i => i.type === "error").length === 0) {
    score = Math.min(100, score + 10);
  }
  
  return Math.max(0, Math.round(score));
}
