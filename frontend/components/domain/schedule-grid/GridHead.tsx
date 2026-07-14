import { useEffect, useRef, useState } from "react";
import type { Show, DayStatus } from "~backend/scheduler/types";
import { isKnownTime } from "~backend/scheduler/time";
import { shortDate, dowShort, fmtTime, isoDate } from "../format";
import { useSettings } from "@/providers/SettingsProvider";
import { citySegments, resolveCities, type Column } from "../week";
import { DayEditor } from "./DayEditor";
import { TimeEditor } from "./TimeEditor";
import { StatusDetailEditor } from "./StatusDetailEditor";

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
/** Cell identity for a time popover anchor: `${showId}::time` / `${showId}::call`. */
const timeCellKey = (showId: string, field: "time" | "callTime") => `${showId}::${field}`;

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
  // Three mutually-exclusive header popovers: the day-of-week editor (add/remove),
  // the time editor, and the travel/RED status-detail editor. Opening one closes
  // the others.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [openTimeKey, setOpenTimeKey] = useState<string | null>(null);
  const [openDetailKey, setOpenDetailKey] = useState<string | null>(null);
  const anchors = useRef(new Map<string, HTMLElement>());
  const timeAnchors = useRef(new Map<string, HTMLElement>());
  const statusAnchors = useRef(new Map<string, HTMLElement>());
  const { dateStyle } = useSettings();

  // Every editor is positioned from a viewport rect, so a scroll or resize would
  // leave it stranded beside its column.
  useEffect(() => {
    if (!openKey && !openTimeKey && !openDetailKey) return;
    const close = () => {
      setOpenKey(null);
      setOpenTimeKey(null);
      setOpenDetailKey(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [openKey, openTimeKey, openDetailKey]);

  const openDay = (key: string) => {
    setOpenTimeKey(null);
    setOpenDetailKey(null);
    setOpenKey((cur) => (cur === key ? null : key));
  };
  const openTimeCell = (cellKey: string) => {
    setOpenKey(null);
    setOpenDetailKey(null);
    setOpenTimeKey((cur) => (cur === cellKey ? null : cellKey));
  };
  const openDetail = (cellKey: string) => {
    setOpenKey(null);
    setOpenTimeKey(null);
    setOpenDetailKey((cur) => (cur === cellKey ? null : cellKey));
  };

  // No confirm() on a status change: every shaping edit is snapshotted and Undo
  // brings the cast back. Destroying work behind a modal is worse than an undo.
  // Travel days and days off carry a detail (destination / company RED day), so
  // switching to one auto-opens its detail popover; any other status closes it.
  const choose = (show: Show, next: DayStatus) => {
    if (next === show.status) return;
    onStatusChange(show.id, next);
    // Changing status resets the header popovers, then opens the detail for the
    // statuses that carry one — never leaving two open on the same cell.
    setOpenKey(null);
    setOpenTimeKey(null);
    setOpenDetailKey(next === "travel" || next === "dayoff" ? show.id : null);
  };

  const cities = resolveCities(columns, location);
  const segments = citySegments(columns, location);
  const openIndex = columns.findIndex((c) => columnKey(c) === openKey);
  const openColumn = openIndex >= 0 ? columns[openIndex] : null;

  const openTimeShowId = openTimeKey?.split("::")[0] ?? null;
  const openTimeColumn = openTimeShowId ? columns.find((c) => c.show?.id === openTimeShowId) : null;

  const openDetailIndex = columns.findIndex((c) => c.show?.id === openDetailKey);
  const openDetailColumn = openDetailIndex >= 0 ? columns[openDetailIndex] : null;

  const showsOnDate = (date: string) =>
    columns.filter((c) => c.date === date && c.show?.status === "show").length;

  // The single day off currently holding the company RED day, if any — so a
  // different day off can say "moves it from Wed 23" instead of just offering an
  // unexplained checkbox.
  const companyRedColumn = columns.find((c) => c.show?.isCompanyRedDay) ?? null;
  const companyRedLabel = companyRedColumn
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
            {/* `week` is now an optional free-text label (default ""). Render it
                verbatim only when set — the old `Week {week}` doubled a stored
                "Week 31" into "WEEK WEEK 31". */}
            {week ? <div className="city-week">{week}</div> : null}
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
                onClick={() => openDay(key)}
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
          const hasDetail = show.status === "travel" || show.status === "dayoff";
          return (
            <th key={key} className="status-cell">
              {/* The select and its detail trigger share one compact row so the
                  Status row never grows; the flex lives on this inner wrapper
                  rather than the <th>, which must stay a table cell. */}
              <div className="status-cell-row">
                <select
                  className={`status-select is-${show.status}`}
                  value={show.status}
                  aria-label={`Status for ${dowShort(show.date)} ${shortDate(show.date, dateStyle)}`}
                  onChange={(e) => choose(show, e.target.value as DayStatus)}
                >
                  <option value="show">Show</option>
                  <option value="travel">Travel Day</option>
                  <option value="dayoff">Day Off</option>
                </select>

                {/* The detail (travel destination / company RED day) lives in a
                    popover anchored to this trigger, off the row entirely. */}
                {hasDetail ? (
                  <button
                    type="button"
                    className={`status-detail-trigger${openDetailKey === show.id ? " is-open" : ""}`}
                    ref={(el) => {
                      if (el) statusAnchors.current.set(key, el);
                      else statusAnchors.current.delete(key);
                    }}
                    aria-label={show.status === "travel" ? "Set travel destination" : "Company RED day"}
                    aria-expanded={openDetailKey === show.id}
                    onClick={() => openDetail(key)}
                  >
                    {show.status === "travel" ? "✈" : <span className="status-detail-dot" />}
                  </button>
                ) : null}
              </div>
            </th>
          );
        })}
      </tr>

      {/*
        Show and Call are two labelled rows of equal weight, directly above the
        cast they govern — the shape of the printed call sheet. Each time cell is
        a button: clicking either the Show or the Call cell opens the same time
        popover (both fields), anchored to the clicked cell. A column that isn't a
        show leaves these cells empty: the merged cell in the body already says
        TRAVEL or DAY OFF, and repeating it here would just be noise.
      */}
      {(["time", "callTime"] as const).map((field) => (
        <tr key={field}>
          <th className="row-label">{field === "time" ? "Show" : "Call"}</th>
          {columns.map((column) => {
            const show = column.show;
            if (!show || show.status !== "show") return <th key={columnKey(column)} />;
            const value = show[field];
            const known = isKnownTime(value);
            const cellKey = timeCellKey(show.id, field);
            return (
              <th
                key={columnKey(column)}
                ref={(el) => {
                  if (el) timeAnchors.current.set(cellKey, el);
                  else timeAnchors.current.delete(cellKey);
                }}
                className={`time-cell${known ? "" : " is-tbc"}`}
              >
                <button
                  type="button"
                  className={`time-cell-btn${openTimeKey === cellKey ? " is-open" : ""}`}
                  aria-label={`Edit ${field === "time" ? "show" : "call"} time`}
                  aria-expanded={openTimeKey === cellKey}
                  onClick={() => openTimeCell(cellKey)}
                >
                  {known ? fmtTime(value) : <span className="tbc-chip">TBC</span>}
                </button>
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
          canAddShow={showsOnDate(isoDate(openColumn.date)) === 1}
          onClose={() => setOpenKey(null)}
          onAddShowToDate={onAddShowToDate}
          onRemove={onRemove}
          onRestoreDate={onRestoreDate}
        />
      ) : null}

      {openTimeKey && openTimeColumn?.show ? (
        <TimeEditor
          key={openTimeColumn.show.id}
          show={openTimeColumn.show}
          anchor={timeAnchors.current.get(openTimeKey) ?? null}
          onClose={() => setOpenTimeKey(null)}
          onShowChange={onShowChange}
        />
      ) : null}

      {openDetailKey && openDetailColumn?.show ? (
        <StatusDetailEditor
          key={openDetailColumn.show.id}
          show={openDetailColumn.show}
          anchor={statusAnchors.current.get(openDetailKey) ?? null}
          onClose={() => setOpenDetailKey(null)}
          destination={cities[openDetailIndex + 1] ?? ""}
          onSetDestination={onSetDestination}
          onSetCompanyRedDay={onSetCompanyRedDay}
          companyRedLabel={companyRedLabel}
          otherHoldsCompanyRed={
            companyRedColumn != null && companyRedColumn.show!.id !== openDetailColumn.show.id
          }
        />
      ) : null}
    </thead>
  );
}
