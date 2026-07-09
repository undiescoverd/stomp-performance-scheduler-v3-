import type { Show, DayStatus } from "~backend/scheduler/types";
import { shortDate, dowShort, fmtTime } from "../format";

const STATUS_META: Record<DayStatus, { label: string; cls: string }> = {
  show: { label: "Show", cls: "pill-show" },
  travel: { label: "Travel", cls: "pill-travel" },
  dayoff: { label: "Day Off", cls: "pill-off" },
};

export function GridHead({ shows }: { shows: Show[] }) {
  return (
    <thead>
      <tr>
        <th className="row-label">Date</th>
        {shows.map((s) => (
          <th key={s.id}>
            <div className="show-date">{shortDate(s.date)}</div>
            <div className="show-day">{dowShort(s.date)}</div>
            {s.status === "show" ? (
              <>
                <div className="show-time">{fmtTime(s.time)}</div>
                <div className="show-call">call {fmtTime(s.callTime)}</div>
              </>
            ) : null}
          </th>
        ))}
      </tr>
      <tr>
        <th className="row-label">Status</th>
        {shows.map((s) => {
          const meta = STATUS_META[s.status];
          return (
            <th key={s.id}>
              <span className={`pill ${meta.cls}`}>
                <span className="pill-dot" />
                {meta.label}
              </span>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
