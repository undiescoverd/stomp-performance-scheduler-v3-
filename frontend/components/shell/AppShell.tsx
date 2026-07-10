import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useIsMobile } from "@/hooks/useMediaQuery";

export function AppShell() {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);

  // Collapse any open mobile drawer when we cross into desktop layout.
  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  return (
    <div className="app">
      <Sidebar open={sidebarOpen} onNavigate={closeSidebar} />
      <div className={sidebarOpen ? "scrim show" : "scrim"} onClick={closeSidebar} />
      <div className="main">
        <Topbar onMenuClick={toggleSidebar} />
        <div className="content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
