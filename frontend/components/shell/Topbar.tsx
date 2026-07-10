import { useState } from "react";
import { Menu, Settings } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Crumbs, crumbsForPath, type Crumb } from "./Crumbs";
import { SettingsDialog } from "./SettingsDialog";
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
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="topbar">
      <button className="menu-btn" aria-label="Toggle menu" onClick={onMenuClick}>
        <Menu />
      </button>
      <Crumbs items={trail} />
      <div className="topbar-spacer" />
      <div className="topbar-actions">
        {actions}
        <button
          type="button"
          className="icon-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          title="Settings"
        >
          <Settings />
        </button>
        <ThemeToggle />
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
}
