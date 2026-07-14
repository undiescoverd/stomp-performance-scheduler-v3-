import { Link } from "react-router-dom";
import { Trash2, ChevronRight } from "lucide-react";
import { weekStatus, type TourWeekView } from "@/hooks/useTours";
import { shortDate, isoDate } from "../format";
import { useSettings } from "@/providers/SettingsProvider";

interface TourWeekRowProps {
  week: TourWeekView;
  /** Position within the (date-sorted) segment — weeks are no longer numbered. */
  index: number;
  onDelete: (week: TourWeekView) => void;
}

/** A week row opens its schedule in the editor (week.id IS a schedule id).
 *  The delete control is a sibling of the link so it never triggers navigation. */
export function TourWeekRow({ week, index, onDelete }: TourWeekRowProps) {
  const status = weekStatus(week);
  const { dateStyle } = useSettings();
  // week.startDate is derived from the week's shows_data; only render one if real.
  const iso = isoDate(week.startDate);
  const hasDate = /^\d{4}-/.test(iso) && iso.slice(0, 4) >= "2000";
  return (
    <div className="week-row" style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <Link to={`/schedule/${week.id}`} className="row grow" style={{ gap: 14, minWidth: 0 }}>
        <div className="week-num">W{index + 1}</div>
        <div className="week-info grow" style={{ minWidth: 0 }}>
          <div className="week-loc">{week.locationCity}</div>
          <div className="week-date">
            {week.showCount} show{week.showCount === 1 ? "" : "s"}
            {hasDate ? ` · ${shortDate(week.startDate, dateStyle)}` : ""}
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
