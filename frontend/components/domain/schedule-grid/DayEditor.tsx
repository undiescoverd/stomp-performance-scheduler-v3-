import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Show } from "~backend/scheduler/types";
import { dowShort, isoDate, shortDate } from "../format";

interface DayEditorProps {
  show: Show;
  /** The column header this popover hangs under. */
  anchor: HTMLElement | null;
  /** The city this column belongs to. */
  city: string;
  /** For a travel day: the city being travelled to. */
  destination: string;
  canAddShow: boolean;
  onClose: () => void;
  onShowChange: (showId: string, field: "time" | "callTime", value: string) => boolean;
  onAddShowToDate: (date: string) => void;
  onSetDestination: (travelShowId: string, city: string) => void;
}

const GUTTER = 8;
const POPOVER_WIDTH = 244;

/**
 * Edits one day in place: status lives in the header select, everything else
 * lives here. Rendered through a portal because a <div> cannot sit inside a
 * <thead>, and positioned from a viewport rect because `offsetTop` on a table
 * cell measures from the table rather than from any positioned ancestor.
 */
export function DayEditor({
  show,
  anchor,
  city,
  destination,
  canAddShow,
  onClose,
  onShowChange,
  onAddShowToDate,
  onSetDestination,
}: DayEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [rejected, setRejected] = useState(false);

  useLayoutEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const maxLeft = window.innerWidth - POPOVER_WIDTH - GUTTER;
    setPos({ top: rect.bottom + 4, left: Math.max(GUTTER, Math.min(rect.left, maxLeft)) });
  }, [anchor, show.id]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [anchor, onClose]);

  if (!pos) return null;

  const dayLabel = `${dowShort(show.date)} ${shortDate(show.date)}`;

  const changeTime = (field: "time" | "callTime", value: string) => {
    const accepted = onShowChange(show.id, field, value);
    if (field === "time") setRejected(!accepted);
  };

  return createPortal(
    <div className="day-editor" ref={ref} role="dialog" aria-label={`Edit ${dayLabel}`} style={pos}>
      <header className="day-editor-head">
        <span>{dayLabel}</span>
        <span className="day-editor-city">{city}</span>
      </header>

      {show.status === "show" ? (
        <>
          <div className="day-editor-times">
            <label>
              Show
              <input
                type="time"
                defaultValue={show.time}
                onChange={(e) => changeTime("time", e.target.value)}
              />
            </label>
            <label>
              Call
              <input
                type="time"
                defaultValue={show.callTime}
                onChange={(e) => changeTime("callTime", e.target.value)}
              />
            </label>
          </div>
          {rejected ? (
            <p className="day-editor-warn">
              The other show on {dayLabel} already starts then. Pick a different time.
            </p>
          ) : null}
          {canAddShow ? (
            <button type="button" className="day-editor-action" onClick={() => onAddShowToDate(isoDate(show.date))}>
              + Add show to this day
            </button>
          ) : null}
        </>
      ) : null}

      {show.status === "travel" ? (
        <>
          <label className="day-editor-field">
            Travel to
            <input
              type="text"
              placeholder="City"
              defaultValue={destination}
              onBlur={(e) => onSetDestination(show.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
          </label>
          <p className="day-editor-note">
            This day stays with <b>{city}</b>, the city you're leaving. The divider falls after it.
          </p>
        </>
      ) : null}

      {show.status === "dayoff" ? <p className="day-editor-note">No shows. The company is dark.</p> : null}
    </div>,
    document.body,
  );
}
