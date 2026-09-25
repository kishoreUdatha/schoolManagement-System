"use client";

import { Coffee, Plus, Utensils } from "lucide-react";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

import { SubjectIcon, subjectStyle } from "./subjectStyle";
import type { GridCell, Period } from "./types";

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export type GridLayout = "week" | "day" | "list";

export function shortTime(t: string) {
  return t?.slice(0, 5) ?? "";
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday of the week containing `d`. */
export function mondayOf(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return addDays(x, -((x.getDay() + 6) % 7));
}

export function fmtDate(d: Date, withYear = false) {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

/** ISO days (1=Mon) that have at least one period; Mon–Fri when empty. */
export function activeDays(periods: Period[]) {
  const days = Array.from(new Set(periods.map((p) => p.day_of_week))).sort(
    (a, b) => a - b
  );
  return days.length ? days : [1, 2, 3, 4, 5];
}

function BreakIcon({ label }: { label: string }) {
  const Icon = /lunch/i.test(label) ? Utensils : Coffee;
  return <Icon className="h-4 w-4" />;
}

function CellCard({
  cell,
  period,
  showTime,
  editable,
  onClick,
}: {
  cell?: GridCell;
  period: Period;
  showTime: boolean;
  editable: boolean;
  onClick?: () => void;
}) {
  const time = showTime && (
    <div className="font-mono text-[10px] text-ink-subtle">
      {shortTime(period.start_time)}–{shortTime(period.end_time)}
    </div>
  );
  if (!cell) {
    if (!editable) {
      return (
        <div className="flex h-full min-h-[3.25rem] flex-col justify-center rounded-lg border border-dashed border-surface-border px-2.5 py-1.5 text-xs text-ink-subtle">
          {time}
          Free
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex h-full min-h-[3.25rem] w-full flex-col items-center justify-center rounded-lg border border-dashed border-brand-300/60 text-xs font-medium text-brand-600 transition hover:bg-brand-50 print:hidden"
      >
        {time}
        <span className="inline-flex items-center gap-1">
          <Plus className="h-3.5 w-3.5" /> Assign
        </span>
      </button>
    );
  }
  const style = subjectStyle(cell.subject_name, cell.subject_code);
  const Tag = editable ? "button" : "div";
  return (
    <Tag
      type={editable ? "button" : undefined}
      onClick={editable ? onClick : undefined}
      title={cell.notes ?? undefined}
      className={cn(
        "flex h-full min-h-[3.25rem] w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left",
        style.tone.card,
        editable && "transition hover:brightness-95 hover:shadow-sm"
      )}
    >
      <SubjectIcon name={cell.subject_name} code={cell.subject_code} />
      <div className="min-w-0">
        {time}
        <div className="truncate text-[13px] font-semibold text-ink">
          {cell.subject_name}
        </div>
        <div className="truncate text-xs text-ink-muted">
          {cell.subtitle ?? "No teacher"}
          {cell.draft && (
            <span className="ml-1 rounded bg-amber-500/15 px-1 text-[10px] font-medium uppercase text-amber-600">
              draft
            </span>
          )}
        </div>
      </div>
    </Tag>
  );
}

export function TimetableGrid({
  periods,
  cells,
  layout,
  weekStart,
  day,
  editable = false,
  onCellClick,
}: {
  periods: Period[];
  cells: Map<number, GridCell>;
  layout: GridLayout;
  weekStart: Date;
  /** ISO day shown in "day" layout. */
  day: number;
  editable?: boolean;
  onCellClick?: (period: Period, cell?: GridCell) => void;
}) {
  const days = useMemo(() => {
    const all = activeDays(periods);
    return layout === "day" ? all.filter((d) => d === day) : all;
  }, [periods, layout, day]);

  const byKey = useMemo(() => {
    const m = new Map<string, Period>();
    periods.forEach((p) => m.set(`${p.day_of_week}-${p.period_number}`, p));
    return m;
  }, [periods]);

  const rows = useMemo(
    () =>
      Array.from(new Set(periods.map((p) => p.period_number))).sort(
        (a, b) => a - b
      ),
    [periods]
  );

  const todayKey = new Date().toDateString();

  if (periods.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm text-ink-muted">
        No periods defined yet. The school admin sets up period timings under
        Academics → Periods.
      </div>
    );
  }

  if (layout === "list") {
    return (
      <div className="divide-y divide-surface-border">
        {days.map((d) => {
          const dayPeriods = periods
            .filter((p) => p.day_of_week === d)
            .sort((a, b) => a.period_number - b.period_number);
          return (
            <div key={d} className="px-4 py-3">
              <div className="mb-2 text-sm font-semibold text-ink">
                {DAY_NAMES[d - 1]}{" "}
                <span className="font-normal text-ink-subtle">
                  {fmtDate(addDays(weekStart, d - 1))}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-surface-border">
                  {dayPeriods.map((p) => {
                    const cell = cells.get(p.id);
                    return (
                      <tr key={p.id}>
                        <td className="w-32 py-1.5 font-mono text-xs text-ink-muted">
                          {shortTime(p.start_time)} – {shortTime(p.end_time)}
                        </td>
                        {p.is_break ? (
                          <td colSpan={2} className="py-1.5 text-xs italic text-ink-subtle">
                            {p.label ?? "Break"}
                          </td>
                        ) : (
                          <>
                            <td className="py-1.5">
                              {cell ? (
                                <span className="inline-flex items-center gap-2 font-medium text-ink">
                                  <SubjectIcon
                                    name={cell.subject_name}
                                    code={cell.subject_code}
                                    className="h-6 w-6"
                                  />
                                  {cell.subject_name}
                                </span>
                              ) : editable ? (
                                <button
                                  type="button"
                                  onClick={() => onCellClick?.(p)}
                                  className="text-xs font-medium text-brand-600 hover:underline"
                                >
                                  + Assign
                                </button>
                              ) : (
                                <span className="text-xs text-ink-subtle">Free</span>
                              )}
                            </td>
                            <td className="py-1.5 text-right text-xs text-ink-muted">
                              {cell?.subtitle}
                              {cell && editable && (
                                <button
                                  type="button"
                                  onClick={() => onCellClick?.(p, cell)}
                                  className="ml-3 font-medium text-brand-600 hover:underline print:hidden"
                                >
                                  Edit
                                </button>
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-1.5 text-sm">
        <thead>
          <tr>
            <th className="w-[6.5rem] rounded-lg bg-surface-subtle px-2 py-2 text-sm font-semibold text-ink">
              Time
            </th>
            {days.map((d) => {
              const date = addDays(weekStart, d - 1);
              const isToday = date.toDateString() === todayKey;
              return (
                <th
                  key={d}
                  className={cn(
                    "rounded-lg px-2 py-2 text-center",
                    isToday ? "bg-brand-500/10" : "bg-surface-subtle"
                  )}
                >
                  <div className={cn("text-sm font-semibold", isToday ? "text-brand-600" : "text-ink")}>
                    {DAY_NAMES[d - 1]}
                  </div>
                  <div className="text-xs font-normal text-ink-subtle">{fmtDate(date)}</div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((pn) => {
            const rowPeriods = days
              .map((d) => byKey.get(`${d}-${pn}`))
              .filter((p): p is Period => !!p);
            if (rowPeriods.length === 0) return null;
            const first = rowPeriods[0];
            // Times can differ by day (e.g. short Saturday); show them per cell then.
            const uniformTime = rowPeriods.every(
              (p) =>
                p.start_time === first.start_time && p.end_time === first.end_time
            );
            const allBreak = rowPeriods.every((p) => p.is_break);

            if (allBreak) {
              const label = first.label ?? "Break";
              return (
                <tr key={pn}>
                  <td className="rounded-lg bg-brand-500/5 px-1 py-2 text-center font-mono text-[11px] text-ink-muted">
                    {shortTime(first.start_time)} – {shortTime(first.end_time)}
                  </td>
                  <td
                    colSpan={days.length}
                    className="rounded-lg bg-brand-500/5 py-2 text-center text-sm font-medium text-ink-muted"
                  >
                    <span className="inline-flex items-center gap-2">
                      <BreakIcon label={label} />
                      {label}
                    </span>
                  </td>
                </tr>
              );
            }

            return (
              <tr key={pn}>
                <td className="px-1 py-1 text-center font-mono text-[11px] text-ink-muted">
                  {uniformTime
                    ? `${shortTime(first.start_time)} – ${shortTime(first.end_time)}`
                    : `P${pn}`}
                </td>
                {days.map((d) => {
                  const p = byKey.get(`${d}-${pn}`);
                  if (!p) {
                    return <td key={d} className="rounded-lg bg-surface-subtle/50" />;
                  }
                  if (p.is_break) {
                    return (
                      <td
                        key={d}
                        className="rounded-lg bg-brand-500/5 text-center text-xs text-ink-muted"
                      >
                        {p.label ?? "Break"}
                      </td>
                    );
                  }
                  const cell = cells.get(p.id);
                  return (
                    <td key={d} className="h-14 align-top">
                      <CellCard
                        cell={cell}
                        period={p}
                        showTime={!uniformTime}
                        editable={editable}
                        onClick={() => onCellClick?.(p, cell)}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
