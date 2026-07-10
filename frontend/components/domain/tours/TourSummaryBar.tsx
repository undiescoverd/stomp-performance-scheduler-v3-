import { Users, PlayCircle, CalendarDays, ShieldCheck } from "lucide-react";

interface TourSummaryBarProps {
  castCount: number;
  totalShows: number;
  weekCount: number;
}

export function TourSummaryBar({ castCount, totalShows, weekCount }: TourSummaryBarProps) {
  return (
    <div className="tour-summary">
      <div className="sum-item">
        <Users />
        <b>{castCount}</b> cast
      </div>
      <div className="sum-item">
        <PlayCircle />
        <b>{totalShows}</b> shows
      </div>
      <div className="sum-item">
        <CalendarDays />
        <b>{weekCount}</b> week{weekCount === 1 ? "" : "s"}
      </div>
      <div className="sum-item">
        <ShieldCheck />
        RED-day <b>fairness</b>
      </div>
    </div>
  );
}
