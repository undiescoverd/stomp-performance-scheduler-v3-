import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Show } from "~backend/scheduler/types";
import { TBC, isKnownTime } from "~backend/scheduler/time";
import { dowShort, shortDate } from "../format";
import { useSettings } from "@/providers/SettingsProvider";

interface TimeEditorProps {
  /** The show whose Show/Call times are being edited (status === "show"). */
  show: Show;
  /** The time cell this popover hangs under. */
  anchor: HTMLElement | null;
  onClose: () => void;
  /** Returns false when the new time collides with the other show on the day. */
  onShowChange: (showId: string, field: "time" | "callTime", value: string) => boolean;
}

const GUTTER = 8;
const POPOVER_WIDTH = 244;

interface TimeFieldProps {
  label: string;
  /** The committed value: "HH:MM", or TBC when the time isn't set yet. */
  value: string;
  /**
   * When to write. The show time commits on blur or Enter so a half-typed "0" —
   * which `<input type="time">` reports as a whole change — never lands in the
   * grid or the sort. The call time is not parsed by anything, so it commits live.
   */
  commitOn: "blur" | "change";
  onCommit: (value: string) => void;
}

/**
 * A time and its TBC escape hatch.
 *
 * The native picker stays: it is the only good time UX on desktop and mobile, and
 * a plain text box would throw it away. TBC therefore lives beside it as a toggle
 * rather than as a magic string typed into the field.
 */
function TimeField({ label, value, commitOn, onCommit }: TimeFieldProps) {
  const [tbc, setTbc] = useState(!isKnownTime(value));
  const input = useRef<HTMLInputElement>(null);

  const toggle = () => {
    if (tbc) {
      // Off: hand the field back to the picker. The value stays TBC until a real
      // time is picked, so nothing is silently invented on the user's behalf.
      setTbc(false);
      requestAnimationFrame(() => input.current?.focus());
      return;
    }
    setTbc(true);
    if (input.current) input.current.value = "";
    onCommit(TBC);
  };

  // An empty picker is a cleared field, which commits as TBC rather than "".
  const commit = (next: string) => {
    if (!next) setTbc(true);
    onCommit(next);
  };

  return (
    <label>
      <span className="day-editor-time-label">
        {label}
        <button
          type="button"
          className="day-editor-tbc"
          aria-pressed={tbc}
          aria-label={`${label} time to be confirmed`}
          onClick={toggle}
        >
          TBC
        </button>
      </span>
      <input
        ref={input}
        type="time"
        disabled={tbc}
        defaultValue={isKnownTime(value) ? value : ""}
        onChange={commitOn === "change" ? (e) => commit(e.target.value) : undefined}
        onBlur={commitOn === "blur" ? (e) => commit(e.target.value) : undefined}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

/**
 * Edits a show's Show and Call times. Opened from either time cell in the header
 * and anchored to whichever was clicked. Rendered through a portal because a
 * <div> cannot sit inside a <thead>, and positioned from a viewport rect because
 * `offsetTop` on a table cell measures from the table rather than any positioned
 * ancestor — the same pattern as DayEditor.
 */
export function TimeEditor({ show, anchor, onClose, onShowChange }: TimeEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [rejected, setRejected] = useState(false);
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

  const changeTime = (field: "time" | "callTime", value: string) => {
    const accepted = onShowChange(show.id, field, value);
    if (field === "time") setRejected(!accepted);
  };

  return createPortal(
    <div className="time-editor day-editor" ref={ref} role="dialog" aria-label={`Edit times for ${dayLabel}`} style={pos}>
      <header className="day-editor-head">
        <span>{dayLabel}</span>
        <span className="day-editor-city">Times</span>
      </header>

      <div className="day-editor-times">
        <TimeField
          key={`${show.id}-time`}
          label="Show"
          value={show.time}
          commitOn="blur"
          onCommit={(v) => changeTime("time", v)}
        />
        <TimeField
          key={`${show.id}-call`}
          label="Call"
          value={show.callTime}
          commitOn="change"
          onCommit={(v) => changeTime("callTime", v)}
        />
      </div>
      {rejected ? (
        <p className="day-editor-warn">
          The other show on {dayLabel} already starts then. Pick a different time.
        </p>
      ) : null}
    </div>,
    document.body,
  );
}
