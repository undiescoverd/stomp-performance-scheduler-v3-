import { useEffect, useRef, useState } from "react";
import type { Show, DayStatus } from "~backend/scheduler/types";
import { shortDate, dowShort, fmtTime, isoDate } from "../format";
import { cityOf, citySegments, showsOnDate } from "../week";
import { DayEditor } from "./DayEditor";

/** "remove" isn't a status — it drops the column out of the week entirely. */
type StatusChoice = DayStatus | "remove";

interface GridHeadProps {
  shows: Show[];
  assignedShowIds: Set<string>;
  /** The schedule's own city, used by any column that doesn't name one. */
  location: string;
  week: string;
  onStatusChange: (showId: string, status: DayStatus) => void;
  onRemove: (showId: string) => void;
  onShowChange: (showId: string, field: "time" | "callTime", value: string) => boolean;
  onAddShowToDate: (date: string) => void;
  onSetDestination: (travelShowId: string, city: string) => void;
}

export function GridHead({
  shows,
  assignedShowIds,
  location,
  week,
  onStatusChange,
  onRemove,
  onShowChange,
  onAddShowToDate,
  onSetDestination,
}: GridHeadProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const anchors = useRef(new Map<string, HTMLElement>());

  // The popover is positioned from a viewport rect, so any scroll or resize
  // would leave it stranded beside its column.
  useEffect(() => {
    if (!openId) return;
    const close = () => setOpenId(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  const choose = (show: Show, next: StatusChoice, el: HTMLSelectElement) => {
    const revert = () => {
      el.value = show.status;
    };

    if (next === show.status) return;

    if (next === "remove") {
      const day = `${dowShort(show.date)} ${shortDate(show.date)}`;
      if (confirm(`Remove ${day} from the schedule? The day and any cast on it are discarded.`)) {
        setOpenId(null);
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

  const segments = citySegments(shows, location);
  const openShow = shows.find((s) => s.id === openId) ?? null;

  return (
    <thead>
      <tr className="masthead">
        <th className="row-label wordmark-cell">
          <span className="wordmark">STOMP</span>
        </th>
        {segments.map((seg, i) => (
          <th key={`${seg.city}-${i}`} className={`city-head${i > 0 ? " city-divider" : ""}`} colSpan={seg.span}>
            <div className="city-name">{seg.city}</div>
            <div className="city-week">Week {week || "—"}</div>
          </th>
        ))}
      </tr>

      <tr>
        <th className="row-label">Date</th>
        {shows.map((s) => {
          const label = `${dowShort(s.date)} ${shortDate(s.date)}`;
          return (
            <th
              key={s.id}
              ref={(el) => {
                if (el) anchors.current.set(s.id, el);
                else anchors.current.delete(s.id);
              }}
            >
              <button
                type="button"
                className={`day-head${openId === s.id ? " is-open" : ""}`}
                aria-label={`Edit ${label}`}
                aria-expanded={openId === s.id}
                onClick={() => setOpenId((cur) => (cur === s.id ? null : s.id))}
              >
                <div className="show-day">{dowShort(s.date)}</div>
                <div className="show-date">{shortDate(s.date)}</div>
                {s.status === "show" ? (
                  <>
                    <div className="show-time">{fmtTime(s.time)}</div>
                    <div className="show-call">call {fmtTime(s.callTime)}</div>
                  </>
                ) : null}
              </button>
            </th>
          );
        })}
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

      {openShow ? (
        <DayEditor
          show={openShow}
          anchor={anchors.current.get(openShow.id) ?? null}
          city={cityOf(openShow, location)}
          destination={destinationAfter(shows, openShow, location)}
          canAddShow={showsOnDate(shows, isoDate(openShow.date)).filter((s) => s.status === "show").length === 1}
          onClose={() => setOpenId(null)}
          onShowChange={onShowChange}
          onAddShowToDate={onAddShowToDate}
          onSetDestination={onSetDestination}
        />
      ) : null}
    </thead>
  );
}

/**
 * Where a travel day is heading: the city of the column after it. The travel day
 * keeps the city it's leaving, so its own `location` never holds the destination.
 */
function destinationAfter(shows: Show[], travel: Show, fallback: string): string {
  const next = shows[shows.findIndex((s) => s.id === travel.id) + 1];
  return next ? cityOf(next, fallback) : "";
}
