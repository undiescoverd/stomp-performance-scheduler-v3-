import type { Show, TemplateSlot } from "~backend/scheduler/types";
import { isoDate } from "./format";
import { applyTemplate, dayDiffIso, weekStartOf } from "./week";

/**
 * The whole-week shape at a glance: seven Mon–Sun cells, each showing whether
 * that day is a travel day (✈), a single show (●), a double (●●) or off (—).
 * Shared across dashboard cards, tour rows, the template pickers, the save
 * dialog and the library — anywhere a week's shape needs to read in one line.
 *
 * Accepts either resolved `shows` (a real schedule/week) or template `slots`
 * (a shape not yet placed on a date); slots are laid onto a reference Monday so
 * both go through one rendering path.
 */

// 2024-01-01 is a Monday — a stable reference for laying template slots out.
const REFERENCE_MONDAY = "2024-01-01";

const DOW = ["M", "T", "W", "T", "F", "S", "S"];

type Kind = "travel" | "double" | "single" | "off" | "empty";

interface Cell {
  kind: Kind;
  companyRed: boolean;
}

function cellFor(list: Show[]): Cell {
  if (list.some((s) => s.status === "travel")) return { kind: "travel", companyRed: false };
  const shows = list.filter((s) => s.status === "show");
  if (shows.length >= 2) return { kind: "double", companyRed: false };
  if (shows.length === 1) return { kind: "single", companyRed: false };
  const companyRed = list.some((s) => s.status === "dayoff" && s.isCompanyRedDay);
  if (list.some((s) => s.status === "dayoff")) return { kind: "off", companyRed };
  return { kind: "empty", companyRed: false };
}

const GLYPH: Record<Kind, string> = {
  travel: "✈",
  double: "●●",
  single: "●",
  off: "—",
  empty: "·",
};

const COLOR: Record<Kind, string> = {
  travel: "var(--accent)",
  double: "var(--green)",
  single: "var(--green)",
  off: "var(--muted)",
  empty: "var(--border-2)",
};

const LABEL: Record<Kind, string> = {
  travel: "Travel",
  double: "Two shows",
  single: "One show",
  off: "Day off",
  empty: "—",
};

export function DayStrip({
  shows,
  slots,
  size = "md",
}: {
  shows?: Show[];
  slots?: TemplateSlot[];
  size?: "sm" | "md";
}) {
  const resolved = shows ?? (slots ? applyTemplate(slots, REFERENCE_MONDAY) : []);
  const start = weekStartOf(resolved);

  const byOffset = new Map<number, Show[]>();
  if (start) {
    for (const s of resolved) {
      const off = dayDiffIso(isoDate(s.date), start);
      if (off < 0 || off > 6) continue;
      const list = byOffset.get(off) ?? [];
      list.push(s);
      byOffset.set(off, list);
    }
  }

  const glyphSize = size === "sm" ? 11 : 13;
  const dowSize = size === "sm" ? 8 : 9;

  return (
    <div className="row" style={{ gap: size === "sm" ? 4 : 6, alignItems: "stretch" }}>
      {Array.from({ length: 7 }, (_, off) => {
        const cell = cellFor(byOffset.get(off) ?? []);
        const color = cell.companyRed ? "var(--red)" : COLOR[cell.kind];
        return (
          <div
            key={off}
            title={`${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][off]}: ${cell.companyRed ? "Company RED day off" : LABEL[cell.kind]}`}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: "center",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 7,
              padding: size === "sm" ? "3px 0" : "5px 0",
              lineHeight: 1.2,
            }}
          >
            <div style={{ fontSize: dowSize, color: "var(--muted)", letterSpacing: 0.3, fontWeight: 600 }}>
              {DOW[off]}
            </div>
            <div style={{ fontSize: glyphSize, color, fontWeight: 700 }}>
              {cell.companyRed ? "R" : GLYPH[cell.kind]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
