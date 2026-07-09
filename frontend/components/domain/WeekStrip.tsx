import type { Show } from "~backend/scheduler/types";
import { dowShort, dayNumber, fmtTime, isoDate } from "./format";

/** The mini day-by-day strip shown in the dashboard "current week" spotlight. */
export function WeekStrip({ shows }: { shows: Show[] }) {
  const byDate = new Map<string, Show[]>();
  for (const s of shows) {
    const key = isoDate(s.date);
    if (!key) continue;
    const list = byDate.get(key) ?? [];
    list.push(s);
    byDate.set(key, list);
  }
  const dates = [...byDate.keys()].sort();

  if (!dates.length) {
    return <p className="text-muted" style={{ fontSize: 13 }}>No shows scheduled this week.</p>;
  }

  return (
    <div className="row-wrap" style={{ gap: 10 }}>
      {dates.map((d) => {
        const list = byDate.get(d)!;
        const label = list.some((s) => s.status === "travel")
          ? "Travel"
          : list.some((s) => s.status === "show")
            ? list
                .filter((s) => s.status === "show")
                .map((s) => fmtTime(s.time))
                .join(" · ")
            : "Day off";
        return (
          <div
            key={d}
            style={{
              flex: 1,
              minWidth: 116,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 14,
            }}
          >
            <div className="kicker" style={{ fontSize: 10 }}>{dowShort(d)}</div>
            <div style={{ font: "600 22px/1 var(--font-display)", marginTop: 6 }}>{dayNumber(d)}</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--accent)", marginTop: 8 }}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}
