import type { Show, DayStatus } from "~backend/scheduler/types";
import { shortDate, dowShort, fmtTime } from "../format";

/** "remove" isn't a status — it drops the column out of the week entirely. */
type StatusChoice = DayStatus | "remove";

interface GridHeadProps {
  shows: Show[];
  assignedShowIds: Set<string>;
  onStatusChange: (showId: string, status: DayStatus) => void;
  onRemove: (showId: string) => void;
}

export function GridHead({ shows, assignedShowIds, onStatusChange, onRemove }: GridHeadProps) {
  const choose = (show: Show, next: StatusChoice, el: HTMLSelectElement) => {
    const revert = () => {
      el.value = show.status;
    };

    if (next === show.status) return;

    if (next === "remove") {
      const day = `${dowShort(show.date)} ${shortDate(show.date)}`;
      if (confirm(`Remove ${day} from the schedule? The day and any cast on it are discarded.`)) {
        onRemove(show.id);
      } else {
        revert();
      }
      return;
    }

    const losesCast = show.status === "show" && assignedShowIds.has(show.id);
    if (losesCast && !confirm("This clears the cast assignments for this day. Continue?")) {
      revert();
      return;
    }

    onStatusChange(show.id, next);
  };

  return (
    <thead>
      <tr>
        <th className="row-label">Date</th>
        {shows.map((s) => (
          <th key={s.id}>
            <div className="show-day">{dowShort(s.date)}</div>
            <div className="show-date">{shortDate(s.date)}</div>
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
        {shows.map((s) => (
          <th key={s.id}>
            <select
              className={`status-select is-${s.status}`}
              value={s.status}
              aria-label={`Status for ${dowShort(s.date)} ${shortDate(s.date)}`}
              onChange={(e) => choose(s, e.target.value as StatusChoice, e.currentTarget)}
            >
              <option value="show">Show</option>
              <option value="travel">Travel Day</option>
              <option value="dayoff">Day Off</option>
              <option value="remove">Remove Day…</option>
            </select>
          </th>
        ))}
      </tr>
    </thead>
  );
}
