import { useEffect, useState } from "react";
import type { BulkCreateRequest, TourWeek } from "~backend/scheduler/tour_types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberStepper } from "@/components/ui/number-stepper";
import { useCompany } from "@/hooks/useCompany";
import { parseLocalDate, isoDate } from "@/components/domain/format";
import { mondayOf, nextMondayFrom } from "@/components/domain/week";

interface CreateTourWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (req: BulkCreateRequest) => void;
  isSubmitting?: boolean;
}

function addDays(iso: string, n: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(
    // build a clean YYYY-MM-DD from the local date
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
  );
}

type TravelDay = NonNullable<TourWeek["travelDay"]>;

/**
 * How many of the standard week's 8 shows a travel day costs. Mirrors the
 * backend's baseSchedule in scheduler/tours.ts: Mon-Sat with matinees on
 * Wednesday and Saturday, Sunday already dark.
 */
const SHOWS_LOST: Record<TravelDay, number> = {
  none: 0,
  monday: 1,
  tuesday: 1,
  wednesday: 2,
  thursday: 1,
  friday: 1,
  saturday: 2,
  sunday: 0,
};

const TRAVEL_DAYS: { value: TravelDay; label: string }[] = [
  { value: "none", label: "No travel day" },
  { value: "monday", label: "Travel Monday" },
  { value: "tuesday", label: "Travel Tuesday" },
  { value: "wednesday", label: "Travel Wednesday" },
  { value: "thursday", label: "Travel Thursday" },
  { value: "friday", label: "Travel Friday" },
  { value: "saturday", label: "Travel Saturday" },
  { value: "sunday", label: "Travel Sunday" },
];

/** Today as a local YYYY-MM-DD. `isoDate` reads UTC getters, which would slip a
 *  day either side of midnight for a genuinely local `new Date()`. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function weekNumberOf(iso: string): number {
  const d = parseLocalDate(iso);
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  return Math.ceil((days + start.getDay() + 1) / 7);
}

export function CreateTourWizard({ open, onOpenChange, onCreate, isSubmitting }: CreateTourWizardProps) {
  const { currentCompany } = useCompany();
  const [tourName, setTourName] = useState("");
  const [segmentName, setSegmentName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [weekCount, setWeekCount] = useState(4);
  const [cities, setCities] = useState<string[]>(["", "", "", ""]);
  const [travelDays, setTravelDays] = useState<TravelDay[]>(["none", "none", "none", "none"]);

  useEffect(() => {
    if (!open) return;
    setTourName("");
    setSegmentName("");
    setStartDate(nextMondayFrom(todayIso()));
    setWeekCount(4);
    setCities(["", "", "", ""]);
    setTravelDays(["none", "none", "none", "none"]);
  }, [open]);

  // Clamping lives in NumberStepper, which only ever emits an in-range integer.
  const setCount = (n: number) => {
    setWeekCount(n);
    setCities((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push("");
      return next;
    });
    setTravelDays((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push("none");
      return next;
    });
  };

  const castMemberIds = currentCompany.map((m) => m.id);
  const canSave =
    tourName.trim().length > 0 &&
    segmentName.trim().length > 0 &&
    startDate.length > 0 &&
    cities.slice(0, weekCount).every((c) => c.trim().length > 0) &&
    castMemberIds.length > 0;

  const submit = () => {
    if (!canSave) return;
    const weeks: TourWeek[] = Array.from({ length: weekCount }, (_, i) => {
      const wStart = addDays(startDate, 7 * i);
      const wEnd = addDays(startDate, 7 * i + 6);
      return {
        weekNumber: weekNumberOf(wStart),
        startDate: wStart,
        endDate: wEnd,
        locationCity: cities[i].trim(),
        isStandard: true,
        travelDay: travelDays[i] ?? "none",
      };
    });
    onCreate({ tourName: tourName.trim(), segmentName: segmentName.trim(), castMemberIds, weeks });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl" style={{ maxHeight: "88vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle>Create tour segment</DialogTitle>
          <DialogDescription>
            Configure 1–12 weeks. Each is bulk-generated with role assignments and RED-day fairness for the{" "}
            {castMemberIds.length} active cast. Set a travel day here to drop that day's shows, or shape any week in
            detail later in its editor.
          </DialogDescription>
        </DialogHeader>

        <div className="stack" style={{ gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="stack" style={{ gap: 6 }}>
              <Label htmlFor="tour-name">Tour name</Label>
              <Input id="tour-name" value={tourName} onChange={(e) => setTourName(e.target.value)} placeholder="European Autumn Tour" />
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <Label htmlFor="segment-name">Segment</Label>
              <Input id="segment-name" value={segmentName} onChange={(e) => setSegmentName(e.target.value)} placeholder="UK & Ireland" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="stack" style={{ gap: 6 }}>
              <Label htmlFor="start-date">Week 1 start (Mon)</Label>
              {/* Snap to the Monday of the picked week: the backend lays the
                  standard Mon–Sat show template as fixed offsets from this
                  date, so a mid-week start would put every show (and the
                  travel-day removal) on the wrong day of the week. */}
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value ? mondayOf(e.target.value) : "")}
              />
            </div>
            <div className="stack" style={{ gap: 6 }}>
              <Label htmlFor="week-count">Weeks (1–12)</Label>
              <NumberStepper id="week-count" value={weekCount} onChange={setCount} min={1} max={12} />
            </div>
          </div>

          <div className="stack" style={{ gap: 8 }}>
            <Label>Venue and travel day per week</Label>
            {/* Fixed height, not max-height: the week list scrolls inside itself so
                going 1 -> 12 weeks never shoves the footer down the screen. */}
            <div
              className="stack"
              style={{ gap: 8, height: 244, overflowY: "auto", paddingRight: 4 }}
            >
            {Array.from({ length: weekCount }).map((_, i) => {
              const travelDay = travelDays[i] ?? "none";
              const shows = 8 - SHOWS_LOST[travelDay];
              return (
                <div key={i} className="row" style={{ gap: 10, minHeight: 36, flexShrink: 0 }}>
                  <span className="week-num" style={{ width: 44 }}>
                    W{startDate ? weekNumberOf(addDays(startDate, 7 * i)) : i + 1}
                  </span>
                  <Input
                    value={cities[i] ?? ""}
                    onChange={(e) =>
                      setCities((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value;
                        return next;
                      })
                    }
                    placeholder={`City for week ${i + 1}`}
                  />
                  <select
                    className="travel-select"
                    value={travelDay}
                    aria-label={`Travel day for week ${i + 1}`}
                    onChange={(e) =>
                      setTravelDays((prev) => {
                        const next = [...prev];
                        next[i] = e.target.value as TravelDay;
                        return next;
                      })
                    }
                  >
                    {TRAVEL_DAYS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <span className="week-shows">
                    {shows} show{shows === 1 ? "" : "s"}
                  </span>
                </div>
              );
            })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <button className="btn btn-ghost btn-sm" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={!canSave || isSubmitting}>
            {isSubmitting ? "Generating…" : `Create ${weekCount} week${weekCount === 1 ? "" : "s"}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
