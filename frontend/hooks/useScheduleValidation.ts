import { useMutation } from "@tanstack/react-query";
import backend from "~backend/client";
import type { Show, Assignment } from "~backend/scheduler/types";

/**
 * Thin wrapper over the backend `validate` endpoint — the authoritative,
 * override-aware verdict (errors[]/warnings[]). Fatigue-issue placement and the
 * ⚑ gating are computed client-side (see schedule-grid/logic.ts); this stays the
 * source of truth for pass/fail.
 */
export function useScheduleValidation() {
  const mutation = useMutation({
    mutationFn: (vars: { shows: Show[]; assignments: Assignment[] }) =>
      backend.scheduler.validate(vars),
  });

  return {
    runValidation: (shows: Show[], assignments: Assignment[]) => mutation.mutate({ shows, assignments }),
    result: mutation.data ?? null,
    isValidating: mutation.isPending,
    hasRun: mutation.isSuccess || mutation.isError,
  };
}
