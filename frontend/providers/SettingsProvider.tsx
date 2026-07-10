import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import type { DateStyle } from "@/components/domain/format";

const STORAGE_KEY = "stomp-date-format";

const STYLES: DateStyle[] = ["dmy", "mdy", "iso", "short"];

interface SettingsContextValue {
  dateStyle: DateStyle;
  setDateStyle: (style: DateStyle) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

function readInitialDateStyle(): DateStyle {
  if (typeof window === "undefined") return "dmy";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return STYLES.includes(stored as DateStyle) ? (stored as DateStyle) : "dmy";
  } catch {
    return "dmy";
  }
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [dateStyle, setDateStyleState] = useState<DateStyle>(readInitialDateStyle);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, dateStyle);
    } catch {
      /* ignore write failures (private mode, etc.) */
    }
  }, [dateStyle]);

  const setDateStyle = useCallback((next: DateStyle) => setDateStyleState(next), []);

  return (
    <SettingsContext.Provider value={{ dateStyle, setDateStyle }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
