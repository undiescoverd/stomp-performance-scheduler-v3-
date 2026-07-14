import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Show } from "~backend/scheduler/types";
import { dowShort, isoDate, shortDate } from "../format";
import { useSettings } from "@/providers/SettingsProvider";

interface DayEditorProps {
  date: string;
  /** Null when the week has emptied this date out. */
  show: Show | null;
  /** The column header this popover hangs under. */
  anchor: HTMLElement | null;
  /** The city this column belongs to. */
  city: string;
  canAddShow: boolean;
  onClose: () => void;
  onAddShowToDate: (date: string) => void;
  onRemove: (showId: string) => void;
  onRestoreDate: (date: string) => void;
}

const GUTTER = 8;
const POPOVER_WIDTH = 244;

/**
 * Shapes one day of the week: add a second show, drop the day out of the week,
 * or put an emptied day back. Times live in the header time cells (TimeEditor)
 * and status/travel/RED detail lives with the status pill — this popover is
 * purely add/remove. Rendered through a portal because a <div> cannot sit inside
 * a <thead>, and positioned from a viewport rect because `offsetTop` on a table
 * cell measures from the table rather than from any positioned ancestor.
 */
export function DayEditor({
  date,
  show,
  anchor,
  city,
  canAddShow,
  onClose,
  onAddShowToDate,
  onRemove,
  onRestoreDate,
}: DayEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const { dateStyle } = useSettings();

  useLayoutEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const maxLeft = window.innerWidth - POPOVER_WIDTH - GUTTER;
    setPos({ top: rect.bottom + 4, left: Math.max(GUTTER, Math.min(rect.left, maxLeft)) });
  }, [anchor, show?.id, date]);

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

  const dayLabel = `${dowShort(date)} ${shortDate(date, dateStyle)}`;

  return createPortal(
    <div className="day-editor" ref={ref} role="dialog" aria-label={`Edit ${dayLabel}`} style={pos}>
      <header className="day-editor-head">
        <span>{dayLabel}</span>
        <span className="day-editor-city">{city}</span>
      </header>

      {!show ? (
        <>
          <p className="day-editor-note">
            No show on this day. It keeps its column so the week still reads as a whole.
          </p>
          <button type="button" className="day-editor-action" onClick={() => onRestoreDate(isoDate(date))}>
            Restore this day
          </button>
        </>
      ) : (
        <>
          {show.status === "show" && canAddShow ? (
            <button type="button" className="day-editor-action" onClick={() => onAddShowToDate(isoDate(show.date))}>
              + Add show to this day
            </button>
          ) : null}
          {/* No confirm(): every shaping edit is snapshotted and Undo brings the
              day (and its cast) back. A modal here would be worse than an undo. */}
          <button type="button" className="day-editor-action is-danger" onClick={() => onRemove(show.id)}>
            Remove Day
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
