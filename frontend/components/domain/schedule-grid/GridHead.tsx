import { useEffect, useRef, useState } from "react";
import type { Show, DayStatus } from "~backend/scheduler/types";
import { isKnownTime } from "~backend/scheduler/time";
import { shortDate, dowShort, fmtTime, isoDate } from "../format";
import { useSettings } from "@/providers/SettingsProvider";
import { citySegments, resolveCities, type Column } from "../week";
import { DayEditor } from "./DayEditor";

/** "remove" isn't a status — it drops the column out of the week entirely. */
type StatusChoice = DayStatus | "remove";

interface GridHeadProps {
  columns: Column[];
  assignedShowIds: Set<string>;
  /** The schedule's own city, used by any column that doesn't name one. */
  location: string;
  week: string;
  onStatusChange: (showId: string, status: DayStatus) => void;
  onRemove: (showId: string) => void;
  onShowChange: (showId: string, field: "time" | "callTime", value: string) => boolean;
  onAddShowToDate: (date: string) => void;
  onRestoreDate: (date: string) => void;
  onSetDestination: (travelShowId: string, city: string) => void;
  onSetCompanyRedDay: (showId: string, on: boolean) => void;
}

const columnKey = (column: Column) => column.show?.id ?? `empty-${column.date}`;

export function GridHead({
  columns,
  assignedShowIds,
  location,
  week,
  onStatusChange,
  onRemove,
  onShowChange,
  onAddShowToDate,
  onRestoreDate,
  onSetDestination,
  onSetCompanyRedDay,
}: GridHeadProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const anchors = useRef(new Map<string, HTMLElement>());
  const { dateStyle } = useSettings();

  // The editor is positioned from a viewport rect, so a scroll or resize would
  // leave it stranded beside its column.
  useEffect(() => {
    if (!openKey) return;
    const close = () => setOpenKey(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [openKey]);

  // No confirm() here: every shaping edit is snapshotted and Undo brings the
  // cast back. Destroying work behind a modal is worse than letting it be undone.
  const choose = (show: Show, next: StatusChoice) => {
    if (next === show.status) return;
    setOpenKey(null);
    if (next === "remove") onRemove(show.id);
    else onStatusChange(show.id, next);
  };

  const cities = resolveCities(columns, location);
  const segments = citySegments(columns, location);
  const openIndex = columns.findIndex((c) => columnKey(c) === openKey);
  const openColumn = openIndex >= 0 ? columns[openIndex] : null;

  const showsOnDate = (date: string) =>
    columns.filter((c) => c.date === date && c.show?.status === "show").length;

  // The other day off currently holding the company RED day, if any — so the
  // editor can say "Wednesday holds it; ticking moves it here" instead of just
  // unchecking the box with no explanation.
  const companyRedColumn = columns.find((c) => c.show?.isCompanyRedDay && c.show.id !== openColumn?.show?.id);
  const otherCompanyRedDayLabel = companyRedColumn
    ? `${dowShort(companyRedColumn.date)} ${shortDate(companyRedColumn.date, dateStyle)}`
    : null;

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
        {columns.map((column) => {
          const key = columnKey(column);
          const label = `${dowShort(column.date)} ${shortDate(column.date, dateStyle)}`;
          return (
            <th
              key={key}
              ref={(el) => {
                if (el) anchors.current.set(key, el);
                else anchors.current.delete(key);
              }}
            >
              <button
                type="button"
                className={`day-head${openKey === key ? " is-open" : ""}${column.show ? "" : " is-empty"}`}
                aria-label={`Edit ${label}`}
                aria-expanded={openKey === key}
                onClick={() => setOpenKey((cur) => (cur === key ? null : key))}
              >
                <div className="show-day">{dowShort(column.date)}</div>
                <div className="show-date">{shortDate(column.date, dateStyle)}</div>
              </button>
            </th>
          );
        })}
      </tr>

      <tr>
        <th className="row-label">Status</th>
        {columns.map((column) => {
          const key = columnKey(column);
          if (!column.show) {
            return (
              <th key={key}>
                <button type="button" className="status-restore" onClick={() => onRestoreDate(column.date)}>
                  Restore
                </button>
              </th>
            );
          }
          const show = column.show;
          return (
            <th key={key}>
              <select
                className={`status-select is-${show.status}`}
                value={show.status}
                aria-label={`Status for ${dowShort(show.date)} ${shortDate(show.date, dateStyle)}`}
                onChange={(e) => choose(show, e.target.value as StatusChoice)}
              >
                <option value="show">Show</option>
                <option value="travel">Travel Day</option>
                <option value="dayoff">Day Off</option>
                <option value="remove">Remove Day…</option>
              </select>
            </th>
          );
        })}
      </tr>

      {/*
        Show and Call are two labelled rows of equal weight, directly above the
        cast they govern — the shape of the printed call sheet. Stacked inside
        the day-header button they were a bright time over a faint one, and the
        call time read as an afterthought. A column that isn't a show leaves
        these cells empty: the merged cell in the body already says TRAVEL or
        DAY OFF, and repeating it here would just be noise.
      */}
      {(["time", "callTime"] as const).map((field) => (
        <tr key={field}>
          <th className="row-label">{field === "time" ? "Show" : "Call"}</th>
          {columns.map((column) => {
            const value = column.show?.status === "show" ? column.show[field] : null;
            if (value === null) return <th key={columnKey(column)} />;
            const known = isKnownTime(value);
            return (
              <th key={columnKey(column)} className={`time-cell${known ? "" : " is-tbc"}`}>
                {known ? fmtTime(value) : <span className="tbc-chip">TBC</span>}
              </th>
            );
          })}
        </tr>
      ))}

      {openColumn ? (
        <DayEditor
          date={openColumn.date}
          show={openColumn.show}
          anchor={anchors.current.get(openKey!) ?? null}
          city={cities[openIndex] ?? location}
          destination={cities[openIndex + 1] ?? ""}
          canAddShow={showsOnDate(isoDate(openColumn.date)) === 1}
          onClose={() => setOpenKey(null)}
          onShowChange={onShowChange}
          onAddShowToDate={onAddShowToDate}
          onRestoreDate={onRestoreDate}
          onSetDestination={onSetDestination}
          onSetCompanyRedDay={onSetCompanyRedDay}
          otherCompanyRedDayLabel={otherCompanyRedDayLabel}
        />
      ) : null}
    </thead>
  );
}
