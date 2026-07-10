import type { Show } from "~backend/scheduler/types";
import { splitByCurtain, type GridAnalytics } from "./logic";

interface AnalyticsStripProps {
  analytics: GridAnalytics;
  shows: Show[];
  redTarget: number;
}

export function AnalyticsStrip({ analytics, shows, redTarget }: AnalyticsStripProps) {
  const { showCount, filled, totalSlots, coveragePct, conflicts, redCovered } = analytics;
  const { matinees, evenings } = splitByCurtain(shows);

  return (
    <section className="stats mt-24">
      <div className="stat">
        <div className="stat-label">Shows This Week</div>
        <div className="stat-val">{showCount}</div>
        <div className="stat-delta flat">
          {matinees} matinee{matinees === 1 ? "" : "s"} · {evenings} evening{evenings === 1 ? "" : "s"}
        </div>
      </div>
      <div className="stat">
        <div className="stat-label">Roles Filled</div>
        <div className="stat-val">
          {filled}/{totalSlots}
        </div>
        <div className={`stat-delta ${coveragePct === 100 ? "up" : "flat"}`}>{coveragePct}% coverage</div>
      </div>
      <div className="stat">
        <div className="stat-label">RED-day Coverage</div>
        <div className="stat-val">
          {redCovered}/{redTarget}
        </div>
        <div className={`stat-delta ${redCovered >= redTarget && redTarget > 0 ? "up" : "flat"}`}>
          {redCovered >= redTarget && redTarget > 0 ? "Fairness guaranteed" : "Assign RED days"}
        </div>
      </div>
      <div className="stat">
        <div className="stat-label">Conflicts</div>
        <div className="stat-val">{conflicts}</div>
        <div className={`stat-delta ${conflicts ? "down" : "up"}`}>
          {conflicts ? `${conflicts} double-assignment${conflicts > 1 ? "s" : ""}` : "No double-assignments"}
        </div>
      </div>
    </section>
  );
}
