"use client";

import { CalendarDays, ChevronLeft, ChevronRight, Printer, Search } from "lucide-react";
import { ReactNode, useMemo, useState } from "react";

import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

import {
  DAY_NAMES,
  TimetableGrid,
  activeDays,
  addDays,
  fmtDate,
  mondayOf,
  type GridLayout,
} from "./TimetableGrid";
import { SubjectIcon } from "./subjectStyle";
import type { GridCell, Period } from "./types";

export type SideItem = {
  key: string | number;
  title: string;
  subtitle?: string | null;
  count: number;
  /** Subject rows get a subject icon; others get an initial avatar. */
  subject?: { name: string; code: string };
  onClick?: () => void;
};

export type SideTab = { key: string; label: string; items: SideItem[] };

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-surface-border bg-surface-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition",
            value === o.value
              ? "bg-brand-500/15 text-brand-600 shadow-sm"
              : "text-ink-muted hover:text-ink"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export { Segmented };

/** Grid card (title, week navigation, Week/Day/List, print) + side panel. */
export function TimetableFrame({
  title,
  subtitle,
  badge,
  actions,
  periods,
  cells,
  editable,
  onCellClick,
  sideTabs,
}: {
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  periods: Period[];
  cells: Map<number, GridCell>;
  editable?: boolean;
  onCellClick?: (period: Period, cell?: GridCell) => void;
  sideTabs: SideTab[];
}) {
  const [layout, setLayout] = useState<GridLayout>("week");
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const days = useMemo(() => activeDays(periods), [periods]);
  const todayIso = ((new Date().getDay() + 6) % 7) + 1;
  const [day, setDay] = useState(todayIso);
  const shownDay = days.includes(day) ? day : days[0];

  const [tab, setTab] = useState(sideTabs[0]?.key);
  const [query, setQuery] = useState("");
  const activeTab = sideTabs.find((t) => t.key === tab) ?? sideTabs[0];
  const items = (activeTab?.items ?? []).filter((i) =>
    `${i.title} ${i.subtitle ?? ""}`.toLowerCase().includes(query.toLowerCase())
  );

  const rangeStart = addDays(weekStart, days[0] - 1);
  const rangeEnd = addDays(weekStart, days[days.length - 1] - 1);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_17rem] print:block">
      <Card className="min-w-0 print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold italic tracking-tight text-ink">{title}</h2>
              {badge}
            </div>
            {subtitle && <div className="mt-0.5 text-sm text-ink-muted">{subtitle}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {actions}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 pb-2 pt-3 print:hidden">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setWeekStart((w) => addDays(w, -7))}
            className="rounded-lg border border-surface-border p-2 text-ink-muted hover:bg-surface-hover"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(mondayOf(new Date()))}
            title="Back to this week"
            className="inline-flex items-center gap-2 rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink hover:bg-surface-hover"
          >
            <CalendarDays className="h-4 w-4 text-ink-muted" />
            {fmtDate(rangeStart, true)} – {fmtDate(rangeEnd, true)}
          </button>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setWeekStart((w) => addDays(w, 7))}
            className="rounded-lg border border-surface-border p-2 text-ink-muted hover:bg-surface-hover"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Segmented
              value={layout}
              onChange={setLayout}
              options={[
                { value: "week", label: "Week" },
                { value: "day", label: "Day" },
                { value: "list", label: "List" },
              ]}
            />
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-surface-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-hover"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
          </div>
        </div>

        {layout === "day" && (
          <div className="flex flex-wrap gap-1 px-5 pb-2 print:hidden">
            {days.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDay(d)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium",
                  d === shownDay
                    ? "bg-brand-500/15 text-brand-600"
                    : "text-ink-muted hover:bg-surface-hover"
                )}
              >
                {DAY_NAMES[d - 1].slice(0, 3)}
              </button>
            ))}
          </div>
        )}

        <div className="px-3 pb-4">
          <TimetableGrid
            periods={periods}
            cells={cells}
            layout={layout}
            weekStart={weekStart}
            day={shownDay}
            editable={editable}
            onCellClick={onCellClick}
          />
        </div>
      </Card>

      <Card className="h-fit p-3 print:hidden">
        <div className="flex gap-1 rounded-lg bg-surface-subtle p-1">
          {sideTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition",
                activeTab?.key === t.key
                  ? "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm"
                  : "text-ink-muted hover:text-ink"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 rounded-lg border border-surface-border bg-surface-subtle px-3 py-2">
          <Search className="h-4 w-4 text-ink-subtle" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${activeTab?.label.toLowerCase() ?? ""}…`}
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
          />
        </label>
        <ul className="mt-2 max-h-[60vh] divide-y divide-surface-border overflow-y-auto">
          {items.map((i) => {
            const body = (
              <>
                {i.subject ? (
                  <SubjectIcon name={i.subject.name} code={i.subject.code} className="h-9 w-9" />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-semibold text-brand-600">
                    {i.title.charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{i.title}</div>
                  <div className="truncate text-xs text-ink-muted">
                    {i.count} class{i.count === 1 ? "" : "es"}
                    {i.subtitle ? ` · ${i.subtitle}` : ""}
                  </div>
                </div>
              </>
            );
            return (
              <li key={i.key}>
                {i.onClick ? (
                  <button
                    type="button"
                    onClick={i.onClick}
                    className="flex w-full items-center gap-3 rounded-md px-1 py-2 text-left hover:bg-surface-hover"
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-1 py-2">{body}</div>
                )}
              </li>
            );
          })}
          {items.length === 0 && (
            <li className="px-1 py-6 text-center text-sm text-ink-subtle">Nothing here yet.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
