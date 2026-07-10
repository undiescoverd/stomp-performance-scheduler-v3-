import { useQuery } from "@tanstack/react-query";
import { backend } from "~backend/client";
import type { Schedule } from "~backend/scheduler/types";

export interface FairnessSummary {
  covered: number;
  target: number;
  pct: number;
  hasAssignments: boolean;
}

/** RED-day coverage computed client-side from already-loaded assignments
 *  (cheap — no per-schedule validateComprehensive fan-out on mount). */
function redCoverage(schedule: Schedule, target: number): FairnessSummary {
  const red = new Set(schedule.assignments.filter((a) => a.isRedDay).map((a) => a.performer));
  const t = target || 12;
  return {
    covered: red.size,
    target: t,
    pct: t ? Math.round((red.size / t) * 100) : 0,
    hasAssignments: schedule.assignments.length > 0,
  };
}

export function useDashboardStats() {
  const schedulesQ = useQuery({
    queryKey: ["schedules"],
    queryFn: () => backend.scheduler.list(),
  });
  const castQ = useQuery({
    queryKey: ["cast-members"],
    queryFn: () => backend.scheduler.getCastMembers(),
  });

  const schedules = schedulesQ.data?.schedules ?? [];
  const castMembers = castQ.data?.castMembers ?? [];
  const roles = castQ.data?.roles ?? [];

  // list() returns newest-first; the first entry is the "current week" spotlight.
  const spotlight = schedules[0];
  const totalShows = schedules.reduce(
    (n, s) => n + s.shows.filter((x) => x.status === "show").length,
    0,
  );
  const venues = new Set(schedules.map((s) => s.location)).size;

  return {
    schedules,
    spotlight,
    isLoading: schedulesQ.isLoading,
    error: schedulesQ.error as Error | null,
    refetch: schedulesQ.refetch,
    stats: {
      activeSchedules: schedules.length,
      totalShows,
      venues,
      activeCast: castMembers.length,
      roles: roles.length,
      fairness: spotlight ? redCoverage(spotlight, castMembers.length) : null,
    },
  };
}
