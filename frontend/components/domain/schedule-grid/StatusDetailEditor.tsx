import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Show } from "~backend/scheduler/types";
import { dowShort, shortDate } from "../format";
import { useSettings } from "@/providers/SettingsProvider";

interface StatusDetailEditorProps {
  /** The show whose travel/day-off detail is being edited. */
  show: Show;
  /** The status control this popover hangs beside. */
  anchor: HTMLElement | null;
  onClose: () => void;
  /** The city being travelled to (the next column's city). */
  destination: string;
  onSetDestination: (travelShowId: string, city: string) => void;
  onSetCompanyRedDay: (showId: string, on: boolean) => void;
  /** The day currently holding the company RED day, if a different one does. */
  companyRedLabel: string | null;
  /** True when some other day off already holds the company RED day. */
  otherHoldsCompanyRed: boolean;
}

const GUTTER = 8;
const POPOVER_WIDTH = 244;

/**
 * Edits the detail a travel day or day off carries: the city being travelled to,
 * or whether a day off holds the whole company's RED day. Opened from the status
 * pill (auto-opens when the pill switches to Travel/Day Off, reopens from the icon
 * beside it). Rendered through a portal because a <div> cannot sit inside a
 * <thead>, and positioned from a viewport rect because `offsetTop` on a table cell
 * measures from the table rather than any positioned ancestor — the same pattern
 * as TimeEditor and DayEditor.
 */
export function StatusDetailEditor({
  show,
  anchor,
  onClose,
  destination,
  onSetDestination,
  onSetCompanyRedDay,
  companyRedLabel,
  otherHoldsCompanyRed,
}: StatusDetailEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const { dateStyle } = useSettings();

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

  const dayLabel = `${dowShort(show.date)} ${shortDate(show.date, dateStyle)}`;
  const isCompanyRedDay = show.isCompanyRedDay === true;

  return createPortal(
    <div
      className="status-detail-editor day-editor"
      ref={ref}
      role="dialog"
      aria-label={`${show.status === "travel" ? "Travel" : "Day off"} detail for ${dayLabel}`}
      style={pos}
    >
      <header className="day-editor-head">
        <span>{dayLabel}</span>
        <span className="day-editor-city">{show.status === "travel" ? "Travel" : "Day Off"}</span>
      </header>

      {show.status === "travel" ? (
        <>
          <label className="day-editor-field">
            <span>Travel to</span>
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
            Stays with the city you're leaving; the divider falls after it.
          </p>
        </>
      ) : null}

      {show.status === "dayoff" ? (
        <>
          <label className="day-editor-checkbox">
            <input
              type="checkbox"
              checked={isCompanyRedDay}
              onChange={(e) => onSetCompanyRedDay(show.id, e.target.checked)}
            />
            <span>Company RED day</span>
          </label>
          <p className="day-editor-note">
            {!isCompanyRedDay && otherHoldsCompanyRed
              ? `Moves it from ${companyRedLabel}.`
              : "The whole company shares this day off."}
          </p>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
