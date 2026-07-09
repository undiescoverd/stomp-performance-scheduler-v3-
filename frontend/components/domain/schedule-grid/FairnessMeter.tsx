interface FairnessMeterProps {
  covered: number;
  target: number;
  conflicts: number;
}

export function FairnessMeter({ covered, target, conflicts }: FairnessMeterProps) {
  const pct = target ? covered / target : 0;
  const cls = pct >= 1 ? "" : pct < 0.5 ? "bad" : "warn";
  return (
    <div className="fairness" style={{ minWidth: 260 }}>
      <div className="fairness-bar">
        <div className={`fairness-fill ${cls}`} style={{ width: `${Math.min(pct, 1) * 100}%` }} />
      </div>
      <div className="fairness-label">
        <b>{covered}</b> / {target} RED days
        {conflicts > 0 ? (
          <span style={{ color: "var(--red)" }}>
            {" "}· {conflicts} conflict{conflicts > 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
    </div>
  );
}
