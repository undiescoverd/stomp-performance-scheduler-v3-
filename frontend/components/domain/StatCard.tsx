export type StatTone = "accent" | "green" | "pink" | "red" | "amber";
export type DeltaKind = "up" | "down" | "flat";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  tone?: StatTone;
  delta?: React.ReactNode;
  deltaKind?: DeltaKind;
}

export function StatCard({ label, value, icon, tone = "accent", delta, deltaKind = "flat" }: StatCardProps) {
  return (
    <div className="stat">
      <div className={`stat-ico ${tone}`}>{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-val">{value}</div>
      {delta != null ? <div className={`stat-delta ${deltaKind}`}>{delta}</div> : null}
    </div>
  );
}
