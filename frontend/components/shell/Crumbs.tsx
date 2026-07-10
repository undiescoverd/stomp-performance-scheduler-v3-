import { Link } from "react-router-dom";

export interface Crumb {
  label: string;
  to?: string;
}

export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="row" style={{ gap: 8 }}>
            {i > 0 ? <span className="sep">/</span> : null}
            {last ? (
              <b aria-current="page">{c.label}</b>
            ) : c.to ? (
              <Link to={c.to}>{c.label}</Link>
            ) : (
              <span>{c.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

/** Route-derived default breadcrumb trail. Screens can pass richer crumbs. */
export function crumbsForPath(pathname: string): Crumb[] {
  if (pathname === "/") return [{ label: "Scheduling" }, { label: "Dashboard" }];
  if (pathname.startsWith("/schedule"))
    return [{ label: "Scheduling", to: "/" }, { label: "Schedule Editor" }];
  if (pathname.startsWith("/company")) return [{ label: "Company" }];
  if (pathname.startsWith("/tours")) return [{ label: "Tours" }];
  return [{ label: "Scheduling", to: "/" }];
}
