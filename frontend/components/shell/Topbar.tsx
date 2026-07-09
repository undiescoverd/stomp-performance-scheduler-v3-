import { Menu } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Crumbs, crumbsForPath, type Crumb } from "./Crumbs";
import { ThemeToggle } from "./ThemeToggle";

interface TopbarProps {
  onMenuClick: () => void;
  /** Optional breadcrumb override; falls back to a route-derived trail. */
  crumbs?: Crumb[];
  /** Screen-specific action controls, rendered left of the theme toggle. */
  actions?: React.ReactNode;
}

export function Topbar({ onMenuClick, crumbs, actions }: TopbarProps) {
  const { pathname } = useLocation();
  const trail = crumbs ?? crumbsForPath(pathname);

  return (
    <header className="topbar">
      <button className="menu-btn" aria-label="Toggle menu" onClick={onMenuClick}>
        <Menu />
      </button>
      <Crumbs items={trail} />
      <div className="topbar-spacer" />
      <div className="topbar-actions">
        {actions}
        <ThemeToggle />
      </div>
    </header>
  );
}
