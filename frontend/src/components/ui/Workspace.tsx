"use client";

import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** The pieces every BrightCampus screen is assembled from.
 *
 *  Taken from the mock's own markup and stylesheet rather than from a
 *  screenshot: `screens/SCR-055_Student_Directory.html` and `assets/
 *  styles.css`. A page that uses these is the mock's layout by construction,
 *  which is the only way 296 of them stay consistent with each other.
 *
 *  Only what was missing is here. The mock's .panel is Card and its
 *  .page-head is PageHeader — 275 files and 171 pages already call those,
 *  so they were corrected in place rather than duplicated under new names.
 *
 *  The mock's class names are kept in the comments so a screen can be read
 *  beside the HTML it came from.
 */

/* ── .stat-strip / .stat ────────────────────────────────────────────────── */

export type Stat = {
  label: string;
  value: ReactNode;
  note?: string;
  icon?: LucideIcon;
};

/** One card, the figures divided by rules — not four cards.
 *
 *  The distinction matters more than it looks: four cards say "four things",
 *  one strip says "one summary of this screen", which is what it is.
 */
export function StatStrip({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <div
      className={cn(
        "mb-[22px] grid grid-cols-1 gap-y-4 rounded-panel border border-surface-border bg-surface-raised px-[5px] py-[21px] sm:grid-cols-2",
        stats.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3",
        className
      )}
    >
      {stats.map((s, i) => {
        const Icon = s.icon;
        return (
          <div
            key={`${s.label}-${i}`}
            className={cn(
              "relative px-[21px]",
              // The rule belongs between figures, never after the last one
              // and never where the grid has already wrapped.
              i < stats.length - 1 && "sm:border-r sm:border-surface-border",
              stats.length >= 4 && i === 1 && "sm:border-r-0 lg:border-r"
            )}
          >
            <div className="text-[11px] font-bold text-ink-muted">{s.label}</div>
            <div className="my-[5px] text-[28px] font-extrabold leading-[1.4] tracking-[-1px] text-ink [font-variant-numeric:tabular-nums]">
              {s.value}
            </div>
            {s.note && <div className="text-[10px] text-ink-subtle">{s.note}</div>}
            {Icon && (
              <span className="absolute right-5 top-[3px] grid h-[31px] w-[31px] place-items-center rounded-input bg-surface-soft text-brand-600">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── .filterbar / .searchbox ────────────────────────────────────────────── */

/** The row above a table: search first and widest, then the narrowing. */
export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="mb-[18px] flex flex-wrap items-center gap-2.5">{children}</div>;
}

export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
  label = "Search records",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="flex h-[41px] min-w-[200px] flex-1 items-center gap-2 rounded-control border border-surface-control bg-surface-raised px-3 text-ink-subtle focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-300">
      <SearchIcon />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="w-full border-0 bg-transparent text-[12px] text-ink outline-none placeholder:text-ink-subtle"
      />
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

/* ── .table-footer ───────────────────────────────── */

/** The line under a table: what you are looking at, and how to see more. */
export function PanelFooter({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-surface-border px-[22px] py-[15px] text-[10px] text-ink-muted">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

/* ── row furniture ──────────────────────────────────────────────────────── */

/** Initials in a tinted square. The mock varies the tint per person, which
 *  is decoration — the name is right beside it, so the colour carries
 *  nothing and is picked from the name only to stop a column of identical
 *  blue squares. */
const AVATAR_TINTS = [
  "bg-brand-50 text-brand-600",
  "bg-success-bg text-success",
  "bg-warning-bg text-warning",
  "bg-danger-bg text-danger",
  "bg-surface-soft text-ink-muted",
];

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-[33px] w-[33px] shrink-0 place-items-center rounded-[11px] text-[10px] font-extrabold",
        AVATAR_TINTS[hash % AVATAR_TINTS.length],
        className
      )}
    >
      {initials}
    </span>
  );
}

/** A name over the thing that identifies it — the mock's `.person` cell. */
export function PersonCell({ name, sub }: { name: string; sub?: string | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={name} />
      <div className="min-w-0">
        <div className="truncate text-[12px] font-extrabold text-ink">{name}</div>
        {sub && <div className="truncate text-[11px] text-ink-subtle">{sub}</div>}
      </div>
    </div>
  );
}

/** `.bar-track` — a proportion you read at a glance, with the number beside
 *  it because a bar on its own is not a figure. */
export function MiniBar({ percent, className }: { percent: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="h-1.5 w-[70px] shrink-0 overflow-hidden rounded-[5px] bg-surface-subtle">
        <i className="block h-full rounded-[5px] bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-ink-muted [font-variant-numeric:tabular-nums]">
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}
