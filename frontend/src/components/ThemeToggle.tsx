"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { ThemeMode, useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

const OPTIONS: { mode: ThemeMode; icon: typeof Moon; label: string }[] = [
  { mode: "light", icon: Sun, label: "Light" },
  { mode: "dark", icon: Moon, label: "Dark" },
  { mode: "system", icon: Monitor, label: "System" },
];

export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  return (
    <div className="flex items-center rounded-md border border-surface-border bg-surface-subtle p-0.5">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = mode === opt.mode;
        return (
          <button
            key={opt.mode}
            type="button"
            onClick={() => setMode(opt.mode)}
            title={opt.label}
            aria-label={opt.label}
            aria-pressed={active}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded transition-colors",
              active
                ? "bg-surface-raised text-ink shadow-sm"
                : "text-ink-subtle hover:text-ink"
            )}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}
