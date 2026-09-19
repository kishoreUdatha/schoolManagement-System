"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorBox } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export type CalendarItem = {
  type: "event" | "holiday" | "exam" | "ptm" | "ptm_slot";
  id: number;
  title: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  detail: string | null;
  is_draft: boolean;
  is_cancelled: boolean;
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const typeStyle: Record<CalendarItem["type"], { dot: string; label: string; tone: "brand" | "amber" | "rose" | "emerald" | "neutral" }> = {
  event: { dot: "bg-brand-500", label: "Event", tone: "brand" },
  holiday: { dot: "bg-emerald-500", label: "Holiday", tone: "emerald" },
  exam: { dot: "bg-rose-500", label: "Exam", tone: "rose" },
  ptm: { dot: "bg-amber-500", label: "PT meeting", tone: "amber" },
  ptm_slot: { dot: "bg-amber-300", label: "My meeting", tone: "amber" },
};

export function hhmm(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Month grid + agenda for the combined calendar feed. `feed` is
 * /api/v1/school/calendar (any staff) or /api/v1/parent/me/calendar. */
export function CalendarFeed({ feed }: { feed: string }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const first = new Date(ym.y, ym.m, 1);
  const last = new Date(ym.y, ym.m + 1, 0);

  useEffect(() => {
    api
      .get<CalendarItem[]>(feed, { params: { start: iso(first), end: iso(last) } })
      .then((r) => {
        setItems(r.data);
        setError(null);
      })
      .catch((e) => setError(apiError(e)));
    setPicked(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, ym.y, ym.m]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const it of items) {
      const d = new Date(it.start_date + "T00:00:00");
      const end = new Date(it.end_date + "T00:00:00");
      for (; d <= end; d.setDate(d.getDate() + 1)) {
        const k = iso(d);
        map.set(k, [...(map.get(k) ?? []), it]);
      }
    }
    return map;
  }, [items]);

  const cells: (string | null)[] = [];
  for (let i = 0; i < (first.getDay() + 6) % 7; i++) cells.push(null);
  for (let d = 1; d <= last.getDate(); d++) cells.push(iso(new Date(ym.y, ym.m, d)));
  while (cells.length % 7) cells.push(null);

  const today = iso(now);
  const agenda = picked ? byDate.get(picked) ?? [] : items;
  const shift = (n: number) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-40 text-center text-lg font-semibold text-ink">
          {MONTHS[ym.m]} {ym.y}
        </div>
        <Button size="sm" variant="secondary" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}>
          Today
        </Button>
        <div className="ml-auto flex flex-wrap gap-3 text-xs text-ink-muted">
          {Object.values(typeStyle).map((s) => (
            <span key={s.label} className="flex items-center gap-1">
              <span className={cn("h-2 w-2 rounded-full", s.dot)} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-7 border-b border-surface-border text-center text-xs font-medium text-ink-subtle">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c, i) => {
            const list = c ? byDate.get(c) ?? [] : [];
            return (
              <button
                key={i}
                type="button"
                disabled={!c}
                onClick={() => c && setPicked(picked === c ? null : c)}
                className={cn(
                  "min-h-20 border-b border-r border-surface-border p-1 text-left align-top",
                  !c && "bg-surface-subtle/40",
                  c && "hover:bg-surface-subtle",
                  picked === c && "bg-brand-500/10"
                )}
              >
                {c && (
                  <>
                    <div className={cn("text-xs", c === today ? "font-bold text-brand-500" : "text-ink-subtle")}>
                      {Number(c.slice(8))}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {list.slice(0, 3).map((it) => (
                        <div
                          key={`${it.type}-${it.id}`}
                          className={cn("flex items-center gap-1 truncate text-[11px] text-ink", it.is_cancelled && "line-through opacity-60")}
                        >
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", typeStyle[it.type].dot)} />
                          <span className="truncate">{it.title}</span>
                        </div>
                      ))}
                      {list.length > 3 && <div className="text-[10px] text-ink-subtle">+{list.length - 3} more</div>}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <CardBody>
          <div className="mb-2 text-sm font-semibold text-ink">
            {picked ? `On ${new Date(picked + "T00:00:00").toDateString()}` : `All of ${MONTHS[ym.m]}`}
          </div>
          {agenda.length === 0 ? (
            <p className="text-sm text-ink-subtle">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y divide-surface-border">
              {agenda.map((it) => (
                <li key={`${it.type}-${it.id}`} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <Badge tone={typeStyle[it.type].tone}>{typeStyle[it.type].label}</Badge>
                  <span className={cn("font-medium text-ink", it.is_cancelled && "line-through")}>{it.title}</span>
                  {it.is_draft && <Badge>draft</Badge>}
                  {it.is_cancelled && <Badge tone="rose">cancelled</Badge>}
                  <span className="text-ink-muted">
                    {it.start_date}
                    {it.end_date !== it.start_date && ` to ${it.end_date}`}
                    {it.start_time && ` · ${hhmm(it.start_time)}`}
                    {it.end_time && `–${hhmm(it.end_time)}`}
                    {it.detail && ` · ${it.detail}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
