import { useState } from "react";
import { Plus, Map } from "lucide-react";
import type { TourWithWeeks } from "~backend/scheduler/tour_types";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/shell/PageHeader";
import { StatCard } from "@/components/domain/StatCard";
import { TourFolder } from "@/components/domain/tours/TourFolder";
import { CreateTourWizard } from "@/components/domain/tours/CreateTourWizard";
import { useTours, weekStatus, type TourWeekView } from "@/hooks/useTours";

export function ToursScreen() {
  const { tours, isLoading, error, createTour, deleteTour, deleteWeek } = useTours();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [deleteTourTarget, setDeleteTourTarget] = useState<TourWithWeeks | null>(null);
  const [deleteWeekTarget, setDeleteWeekTarget] = useState<{ tour: TourWithWeeks; week: TourWeekView } | null>(null);

  const totalWeeks = tours.reduce((n, t) => n + t.weeks.length, 0);
  const readyWeeks = tours.reduce((n, t) => n + t.weeks.filter((w) => weekStatus(w) === "ready").length, 0);
  const pendingWeeks = totalWeeks - readyWeeks;

  return (
    <>
      <PageHeader
        eyebrow="Multi-week scheduling"
        title="Tours"
        lead="Build 1–12 weeks of schedules at once. Configure week venues and bulk-generate every assignment with RED-day fairness."
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setWizardOpen(true)}>
            <Plus /> Create Tour Segment
          </button>
        }
      />

      <section className="stats mt-24">
        <StatCard label="Tour Segments" value={tours.length} tone="accent" icon={<Map />} delta={`${totalWeeks} weeks total`} />
        <StatCard label="Weeks Ready" value={readyWeeks} tone="green" icon={<Map />} deltaKind="up" delta="auto-assigned" />
        <StatCard label="Pending" value={pendingWeeks} tone="amber" icon={<Map />} delta="awaiting shows" />
        <StatCard
          label="Total Shows"
          value={tours.reduce((n, t) => n + t.weeks.reduce((m, w) => m + w.showCount, 0), 0)}
          tone="pink"
          icon={<Map />}
          delta="across all tours"
        />
      </section>

      <section className="mt-32">
        <div className="section-head">
          <h2 className="h1">Tour Segments</h2>
          <div className="kicker">A week row opens its schedule in the editor</div>
        </div>

        {isLoading ? (
          <div className="card empty">
            <p className="text-muted">Loading tours…</p>
          </div>
        ) : error ? (
          <div className="card empty">
            <div className="h3">Couldn't load tours</div>
            <p className="text-muted">{error.message}</p>
          </div>
        ) : tours.length === 0 ? (
          <div className="card empty">
            <Map />
            <div className="h2">No tours yet</div>
            <p className="text-muted" style={{ maxWidth: "44ch" }}>
              Create a tour segment to bulk-generate a run of weekly schedules — each week lands in the editor, fully
              assigned.
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => setWizardOpen(true)}>
              <Plus /> Create your first tour
            </button>
          </div>
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            {tours.map((t, i) => (
              <TourFolder
                key={t.id}
                tour={t}
                defaultOpen={i === 0}
                onDeleteTour={setDeleteTourTarget}
                onDeleteWeek={(tour, week) => setDeleteWeekTarget({ tour, week })}
              />
            ))}
          </div>
        )}
      </section>

      <CreateTourWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreate={(req) => {
          createTour.mutate(req);
          setWizardOpen(false);
        }}
        isSubmitting={createTour.isPending}
      />

      {/* Hard destructive confirm: no update endpoint exists, so restructuring a
          tour means delete + recreate. Deleting cascades to every week schedule. */}
      <AlertDialog open={!!deleteTourTarget} onOpenChange={(o) => !o && setDeleteTourTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deleteTourTarget?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the tour and all {deleteTourTarget?.weeks.length ?? 0} of its week schedules.
              This cannot be undone — to change the structure, delete and recreate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTourTarget) deleteTour.mutate(deleteTourTarget.id);
                setDeleteTourTarget(null);
              }}
            >
              Delete tour & {deleteTourTarget?.weeks.length ?? 0} weeks
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteWeekTarget} onOpenChange={(o) => !o && setDeleteWeekTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove the {deleteWeekTarget?.week.locationCity} week?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the {deleteWeekTarget?.week.locationCity} week schedule from this tour. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteWeekTarget) deleteWeek.mutate({ tourId: deleteWeekTarget.tour.id, weekId: deleteWeekTarget.week.id });
                setDeleteWeekTarget(null);
              }}
            >
              Remove week
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
