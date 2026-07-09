import { Link } from "react-router-dom";
import { Trash2, ChevronRight } from "lucide-react";
import { weekStatus, type TourWeekView } from "@/hooks/useTours";
import { shortDate, isoDate } from "../format";

interface TourWeekRowProps {
  week: TourWeekView;
  onDelete: (week: TourWeekView) => void;
}

/** A week row opens its schedule in the editor (week.id IS a schedule id).
 *  The delete control is a sibling of the link so it never triggers navigation. */
export function TourWeekRow({ week, onDelete }: TourWeekRowProps) {
  const status = weekStatus(week);
  // getTours doesn't persist a per-week start date, so only show one if real.
  const iso = isoDate(week.startDate);
  const hasDate = /^\d{4}-/.test(iso) && iso.slice(0, 4) >= "2000";
  return (
    <div className="week-row" style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <Link to={`/schedule/${week.id}`} className="row grow" style={{ gap: 14, minWidth: 0 }}>
        <div className="week-num">W{week.weekNumber}</div>
        <div className="week-info grow" style={{ minWidth: 0 }}>
          <div className="week-loc">{week.locationCity}</div>
          <div className="week-date">
            {week.showCount} show{week.showCount === 1 ? "" : "s"}
            {hasDate ? ` · ${shortDate(week.startDate)}` : ""}
          </div>
        </div>
        <span className={`tour-status st-${status}`}>{status}</span>
        <span className="pill pill-show">
          <span className="pill-dot" />
          {week.showCount} shows
        </span>
        <ChevronRight style={{ width: 16, height: 16, color: "var(--muted)" }} />
      </Link>
      <button
        className="btn btn-danger btn-sm btn-icon"
        title="Delete week"
        onClick={() => onDelete(week)}
      >
        <Trash2 />
      </button>
    </div>
  );
}
