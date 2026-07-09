import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import backend from "~backend/client";
import type { BulkCreateRequest, TourWithWeeks } from "~backend/scheduler/tour_types";
import { useToast } from "@/components/ui/use-toast";

export type TourWeekView = TourWithWeeks["weeks"][number];

/** Backend weeks carry no status; bulk-created weeks are auto-assigned on
 *  creation, so a week with shows is "ready", an empty one is "pending". */
export function weekStatus(week: TourWeekView): "ready" | "pending" {
  return week.showCount > 0 ? "ready" : "pending";
}

export function useTours() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ["tours"],
    queryFn: () => backend.scheduler.getTours({}),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tours"] });
    qc.invalidateQueries({ queryKey: ["schedules"] });
  };

  const createTour = useMutation({
    mutationFn: (req: BulkCreateRequest) => backend.scheduler.createTourBulk(req),
    onSuccess: (res) => {
      if (res.success) {
        invalidate();
        toast({ title: "Tour created", description: `${res.createdWeeks ?? 0} week(s) generated with RED-day fairness` });
      } else {
        toast({ title: "Couldn't create tour", description: res.errors?.[0] ?? "Unknown error", variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Couldn't create tour", variant: "destructive" }),
  });

  const deleteTour = useMutation({
    mutationFn: (id: string) => backend.scheduler.deleteTour({ id }),
    onSuccess: (res) => {
      invalidate();
      toast({
        title: "Tour deleted",
        description: res.deletedWeeks ? `${res.deletedWeeks} week schedule(s) removed` : undefined,
      });
    },
    onError: () => toast({ title: "Couldn't delete tour", variant: "destructive" }),
  });

  const deleteWeek = useMutation({
    mutationFn: (vars: { tourId: string; weekId: string }) => backend.scheduler.deleteTourWeek(vars),
    onSuccess: () => {
      invalidate();
      toast({ title: "Week removed" });
    },
    onError: () => toast({ title: "Couldn't remove week", variant: "destructive" }),
  });

  return {
    tours: query.data?.tours ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    createTour,
    deleteTour,
    deleteWeek,
  };
}
