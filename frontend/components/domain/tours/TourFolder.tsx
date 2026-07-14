import { useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import type { TourWithWeeks } from "~backend/scheduler/tour_types";
import { weekStatus, type TourWeekView } from "@/hooks/useTours";
import { RouteTimeline } from "./RouteTimeline";
import { TourSummaryBar } from "./TourSummaryBar";
import { TourWeekRow } from "./TourWeekRow";
import { shortDate } from "../format";
import { useSettings } from "@/providers/SettingsProvider";

interface TourFolderProps {
  tour: TourWithWeeks;
  defaultOpen?: boolean;
  onDeleteTour: (tour: TourWithWeeks) => void;
  onDeleteWeek: (tour: TourWithWeeks, week: TourWeekView) => void;
}

export function TourFolder({ tour, defaultOpen, onDeleteTour, onDeleteWeek }: TourFolderProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  const { dateStyle } = useSettings();
  const weeks = tour.weeks;
  const ready = weeks.filter((w) => weekStatus(w) === "ready").length;
  const pct = weeks.length ? Math.round((ready / weeks.length) * 100) : 0;
  const totalShows = weeks.reduce((n, w) => n + w.showCount, 0);
  const castCount = tour.castMemberIds?.length ?? 0;

  return (
    <div className={`tour-folder${open ? " open" : ""}`}>
      <div
        className="tour-head"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          setOpen((o) => !o);
        }}
      >
        <ChevronRight className="tour-chevron" />
        <div className="grow">
          <div className="tour-name">
            {tour.name}
            {tour.segmentName ? ` — ${tour.segmentName}` : ""}
          </div>
          <div className="tour-sub">
            {weeks.length} week{weeks.length === 1 ? "" : "s"} · {shortDate(tour.startDate, dateStyle)} to{" "}
            {shortDate(tour.endDate, dateStyle)}
          </div>
          <div className="tour-progress">
            <div className={`tour-progress-fill${pct >= 80 ? "" : " warn"}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <span className="tour-pct">{pct}%</span>
        <span className="pill pill-accent">
          <span className="pill-dot" />
          {ready}/{weeks.length} ready
        </span>
        <button className="btn btn-ghost btn-sm btn-icon" title="Delete tour" onClick={() => onDeleteTour(tour)}>
          <Trash2 />
        </button>
      </div>

      <div className="tour-weeks">
        <RouteTimeline weeks={weeks} />
        <TourSummaryBar castCount={castCount} totalShows={totalShows} weekCount={weeks.length} />
        {weeks.map((w, i) => (
          <TourWeekRow key={w.id} week={w} index={i} onDelete={(week) => onDeleteWeek(tour, week)} />
        ))}
      </div>
    </div>
  );
}
