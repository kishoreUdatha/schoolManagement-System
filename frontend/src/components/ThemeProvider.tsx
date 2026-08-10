"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";

export type ThemeMode = "dark" | "light" | "system";

const STORAGE_KEY = "sms.theme";

type ThemeCtx = {
  mode: ThemeMode;
  resolved: "dark" | "light";
  setMode: (m: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeCtx | null>(null);

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return { mode: "system", resolved: "light", setMode: () => {} };
  }
  return ctx;
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(mode: ThemeMode): "dark" | "light" {
  if (typeof document === "undefined") return "light";
  const resolved = mode === "system" ? (systemPrefersDark() ? "dark" : "light") : mode;
  const root = document.documentElement;
  if (resolved === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  return resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [resolved, setResolved] = useState<"dark" | "light">("light");

  // Hydrate from storage on mount
  useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) || "system";
    setModeState(saved);
    setResolved(applyTheme(saved));
  }, []);

  // Re-apply when mode changes
  useEffect(() => {
    setResolved(applyTheme(mode));
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  // Listen to OS preference if we're in 'system' mode
  useEffect(() => {
    if (mode !== "system" || typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => setResolved(applyTheme("system"));
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const value: ThemeCtx = {
    mode,
    resolved,
    setMode: (m) => setModeState(m),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Inline boot script — applies the saved theme BEFORE React hydration to
 * prevent a flash of the wrong theme on every page load. Drop this into the
 * <head> of the root layout via `dangerouslySetInnerHTML`.
 */
export const THEME_BOOT_SCRIPT = `
(function() {
  try {
    var saved = localStorage.getItem('${STORAGE_KEY}') || 'system';
    var dark = saved === 'dark' || (saved === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    var c = document.documentElement.classList;
    if (dark) c.add('dark'); else c.remove('dark');
  } catch (e) {}
})();
`;
