import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Users, TrendingUp } from 'lucide-react';
import type { Show, Assignment, CastMember } from '~backend/scheduler/types';

interface ScheduleAnalyticsProps {
  shows: Show[];
  assignments: Assignment[];
  castMembers: CastMember[];
}

export function ScheduleAnalytics({ shows, assignments, castMembers }: ScheduleAnalyticsProps) {
  // Calculate show counts per performer
  const getShowCounts = (): Record<string, number> => {
    const counts: Record<string, number> = {};
    
    // Initialize all cast members
    castMembers.forEach(member => {
      counts[member.name] = 0;
    });

    // Count unique shows per performer
    const showPerformers = new Map<string, Set<string>>();
    assignments.forEach(assignment => {
      if (!showPerformers.has(assignment.showId)) {
        showPerformers.set(assignment.showId, new Set());
      }
      showPerformers.get(assignment.showId)!.add(assignment.performer);
    });

    // Count shows per performer
    for (const [, performers] of showPerformers) {
      for (const performer of performers) {
        if (counts.hasOwnProperty(performer)) {
          counts[performer]++;
        }
      }
    }

    return counts;
  };

  // Check for consecutive shows
  const getConsecutiveWarnings = (): { performer: string; count: number }[] => {
    const warnings: { performer: string; count: number }[] = [];
    
    castMembers.forEach(member => {
      const memberShows = new Set<string>();
      assignments.forEach(assignment => {
        if (assignment.performer === member.name) {
          memberShows.add(assignment.showId);
        }
      });

      let maxConsecutive = 0;
      let currentConsecutive = 0;

      for (const show of shows) {
        if (memberShows.has(show.id)) {
          currentConsecutive++;
          maxConsecutive = Math.max(maxConsecutive, currentConsecutive);
        } else {
          currentConsecutive = 0;
        }
      }

      if (maxConsecutive >= 6) {
        warnings.push({ performer: member.name, count: maxConsecutive });
      }
    });

    return warnings;
  };

  // Get assignment completion
  const getAssignmentStats = () => {
    const totalSlots = shows.length * 8; // 8 roles per show
    const filledSlots = assignments.length;
    const completionPercentage = totalSlots > 0 ? Math.round((filledSlots / totalSlots) * 100) : 0;
    
    return {
      totalSlots,
      filledSlots,
      completionPercentage
    };
  };

  const showCounts = getShowCounts();
  const consecutiveWarnings = getConsecutiveWarnings();
  const assignmentStats = getAssignmentStats();

  const getShowCountStatus = (count: number) => {
    if (count < 3) return { label: 'Low', variant: 'secondary' as const, color: 'text-yellow-600' };
    if (count > 7) return { label: 'High', variant: 'destructive' as const, color: 'text-red-600' };
    return { label: 'Good', variant: 'default' as const, color: 'text-green-600' };
  };

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Schedule Completion</p>
                <p className="text-2xl font-bold">{assignmentStats.completionPercentage}%</p>
                <p className="text-xs text-gray-500">
                  {assignmentStats.filledSlots} / {assignmentStats.totalSlots} slots filled
                </p>
              </div>
            </div>
            <Progress value={assignmentStats.completionPercentage} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm text-gray-600">Total Shows</p>
                <p className="text-2xl font-bold">{shows.length}</p>
                <p className="text-xs text-gray-500">
                  {shows.length * 8} performer slots needed
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600">Warnings</p>
                <p className="text-2xl font-bold">{consecutiveWarnings.length}</p>
                <p className="text-xs text-gray-500">
                  Consecutive show concerns
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warnings */}
      {consecutiveWarnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Consecutive Show Warnings:</strong> The following performers have 6+ consecutive shows, which may lead to burnout:
            <div className="mt-2 space-x-2">
              {consecutiveWarnings.map(warning => (
                <Badge key={warning.performer} variant="destructive">
                  {warning.performer}: {warning.count} consecutive
                </Badge>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Show Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Show Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {Object.entries(showCounts).map(([performer, count]) => {
              const status = getShowCountStatus(count);
              return (
                <div key={performer} className="text-center p-2 bg-gray-50 rounded-lg">
                  <div className="font-medium text-xs">{performer}</div>
                  <div className="text-lg font-bold">{count}</div>
                  <Badge variant={status.variant} className="text-xs">
                    {status.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
