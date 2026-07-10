import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, CalendarRange, Map, Users, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { FEATURE_FLAGS } from "@/config/features";

interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: React.ReactNode;
  /** active when the path starts with this prefix (defaults to exact `to`) */
  matchPrefix?: string;
  badge?: string;
  enabled?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "Dashboard", to: "/", icon: <LayoutDashboard />, matchPrefix: "/" },
  {
    id: "editor",
    label: "Schedule Editor",
    to: "/schedule/new",
    icon: <CalendarRange />,
    matchPrefix: "/schedule",
  },
  {
    id: "tours",
    label: "Tours",
    to: "/tours",
    icon: <Map />,
    matchPrefix: "/tours",
    enabled: FEATURE_FLAGS.MULTI_COUNTRY_TOURS,
  },
  { id: "company", label: "Company", to: "/company", icon: <Users />, matchPrefix: "/company" },
];

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Sidebar({ open, onNavigate }: { open?: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  const displayName =
    user && (user.firstName || user.lastName)
      ? [user.firstName, user.lastName].filter(Boolean).join(" ")
      : user?.email ?? "STOMP Team";

  const isActive = (item: NavItem) => {
    const prefix = item.matchPrefix ?? item.to;
    if (prefix === "/") return pathname === "/";
    return pathname === prefix || pathname.startsWith(prefix + "/") || pathname === item.to;
  };

  return (
    <aside className={open ? "sidebar open" : "sidebar"} aria-label="Primary">
      <div className="brand">
        <div className="brand-mark">S</div>
        <div>
          <div className="brand-name">STOMP Scheduler</div>
          <div className="brand-sub">v3 &middot; Production</div>
        </div>
      </div>

      <nav className="nav" aria-label="Primary navigation">
        <div className="nav-section">Scheduling</div>
        {NAV_ITEMS.filter((it) => it.enabled !== false).map((it) => (
          <NavLink
            key={it.id}
            to={it.to}
            onClick={onNavigate}
            className={`nav-item${isActive(it) ? " active" : ""}`}
          >
            {it.icon}
            <span>{it.label}</span>
            {it.badge ? <span className="nav-badge">{it.badge}</span> : null}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="avatar">{initials(displayName)}</div>
        <div className="foot-meta grow">
          <div className="foot-name">{displayName}</div>
          <div className="foot-role">Production Manager</div>
        </div>
        {isAuthenticated ? (
          <button
            type="button"
            className="icon-btn"
            style={{ color: "var(--chrome-muted)" }}
            aria-label="Sign out"
            title="Sign out"
            onClick={() => logout()}
          >
            <LogOut />
          </button>
        ) : null}
      </div>
    </aside>
  );
}
