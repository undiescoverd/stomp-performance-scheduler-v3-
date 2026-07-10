export type PillVariant = "show" | "travel" | "off" | "red" | "accent";

interface SchedulePillProps {
  variant: PillVariant;
  children: React.ReactNode;
  /** render the leading status dot */
  dot?: boolean;
}

export function SchedulePill({ variant, children, dot = false }: SchedulePillProps) {
  return (
    <span className={`pill pill-${variant}`}>
      {dot ? <span className="pill-dot" /> : null}
      {children}
    </span>
  );
}
