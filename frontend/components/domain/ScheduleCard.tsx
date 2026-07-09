import { Link } from "react-router-dom";
import { MapPin, CalendarDays, Clock } from "lucide-react";
import type { Schedule } from "~backend/scheduler/types";
import { SchedulePill } from "./SchedulePill";
import { splitLocation, dateRange, relTime, weekLabel } from "./format";

export function ScheduleCard({ schedule }: { schedule: Schedule }) {
  const [city, venue] = splitLocation(schedule.location);
  const showCount = schedule.shows.filter((s) => s.status === "show").length;
  const travel = schedule.shows.filter((s) => s.status === "travel").length;
  const off = schedule.shows.filter((s) => s.status === "dayoff").length;
  const complete = showCount === schedule.shows.length && schedule.shows.length > 0;

  return (
    <Link to={`/schedule/${schedule.id}`} className="sched-card">
      <div className="sched-card-head">
        <div>
          <div className="sched-loc">{city}</div>
          <div className="sched-week">{weekLabel(schedule.week).toUpperCase()}</div>
        </div>
        <SchedulePill variant={complete ? "show" : "accent"}>{showCount} shows</SchedulePill>
      </div>

      <div className="sched-meta">
        <div className="sched-meta-row">
          <MapPin />
          <b>{venue || city}</b>
        </div>
        <div className="sched-meta-row">
          <CalendarDays />
          <span>{dateRange(schedule.shows)}</span>
        </div>
        <div className="sched-meta-row">
          <Clock />
          <span>Updated {relTime(schedule.updatedAt)}</span>
        </div>
      </div>

      <div className="legend-row" style={{ paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <SchedulePill variant="show" dot>{showCount} Show</SchedulePill>
        {travel > 0 ? <SchedulePill variant="travel" dot>{travel} Travel</SchedulePill> : null}
        {off > 0 ? <SchedulePill variant="off" dot>{off} Off</SchedulePill> : null}
      </div>
    </Link>
  );
}
