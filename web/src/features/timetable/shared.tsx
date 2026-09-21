"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { useApi } from "@/lib/useApi";
import type { AcademicYear, SchoolClass } from "./types";

export const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_NAME = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "13:15:00" -> "01:15", as the mock prints its schedule. */
export function hhmm(t: string | null | undefined): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const span = (a: string, b: string) => `${hhmm(a)}–${hhmm(b)}`;

/** Today as YYYY-MM-DD in the viewer's time zone. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ISO weekday (1 = Monday) of today, a weekend falling back to Monday. */
export function schoolWeekday(): number {
  const js = new Date().getDay();
  const iso = js === 0 ? 7 : js;
  return iso > 5 ? 1 : iso;
}

/** "Week of 21–25 September" for the current week (Monday to the last day shown). */
export function weekLabel(lastDay = 5): string {
  const now = new Date();
  const iso = now.getDay() === 0 ? 7 : now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (iso - 1));
  const end = new Date(mon);
  end.setDate(mon.getDate() + lastDay - 1);
  return mon.getMonth() === end.getMonth()
    ? `Week of ${mon.getDate()}–${end.getDate()} ${MONTHS[mon.getMonth()]}`
    : `Week of ${mon.getDate()} ${MONTHS[mon.getMonth()].slice(0, 3)} – ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)}`;
}

/** The school's years, the chosen one (current by default) and its classes. */
export function useYearClasses() {
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const [yearId, setYearId] = useState<number | null>(null);
  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const year = years.data?.find((y) => y.id === yearId);
  return { years, yearId, setYearId, year, classes };
}

/** Class then section, cascading; `preset` (a section id) picks both. */
export function useSectionPick(classes: SchoolClass[] | null, preset: number | null) {
  const [classId, setClassId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState<number | null>(null);
  useEffect(() => {
    // Keep the choice while it is still in the list (a new year brings new classes).
    if (!classes || (classId !== null && classes.some((c) => c.id === classId))) return;
    const owner = preset ? classes.find((c) => c.sections.some((s) => s.id === preset)) : undefined;
    const first = owner ?? classes.find((c) => c.sections.length > 0);
    if (!first) {
      setClassId(null);
      setSectionId(null);
      return;
    }
    setClassId(first.id);
    setSectionId(owner ? preset : first.sections[0].id);
  }, [classes, preset, classId]);
  const cls = classes?.find((c) => c.id === classId) ?? null;
  const section = cls?.sections.find((s) => s.id === sectionId) ?? null;
  return {
    classId,
    sectionId,
    cls,
    section,
    pickClass(id: number | null) {
      setClassId(id);
      const c = classes?.find((x) => x.id === id);
      setSectionId(c?.sections[0]?.id ?? null);
    },
    setSectionId,
  };
}

/** A dialog in the mock's `.modal` style. */
export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { maxWidth: 760 } : undefined}>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

/**
 * A page-head button that asks the screen's live component to act. The page
 * is a server component, so the two talk through a window event.
 */
export function HeadButton({ event, icon = "check", children }: { event: string; icon?: IconName; children: string }) {
  return (
    <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new Event(event))}>
      <Icon name={icon} className="sm" />
      {children}
    </button>
  );
}

export function useHeadEvent(event: string, fn: () => void) {
  useEffect(() => {
    window.addEventListener(event, fn);
    return () => window.removeEventListener(event, fn);
  }, [event, fn]);
}

export function PrintButton() {
  return (
    <button type="button" className="btn primary" onClick={() => window.print()}>
      <Icon name="check" className="sm" />
      Print timetable
    </button>
  );
}

/** A green/blue "notice" tip after a save. */
export function Notice({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="tip" role="status">
      <Icon name="check" className="sm" />
      <span>{children}</span>
    </div>
  );
}

const TONES = ["", "mint", "lilac", "peach"];
export const toneOf = (key: string | number) => {
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
};

type Slot = { day_of_week: number; period_number: number; start_time: string; end_time: string; label: string | null; is_break: boolean };

/**
 * The mock's `.schedule-grid`: one row per period number, one column per
 * day. A number that is a break on every day becomes the full-width break
 * strip. `cell` draws what sits in a day's slot (the slot may be missing).
 */
export function WeekGrid<P extends Slot>({ slots, cell, empty }: { slots: P[]; cell: (day: number, slot: P | undefined, n: number) => ReactNode; empty: ReactNode }) {
  const { days, numbers, at } = useMemo(() => {
    const m = new Map<string, P>();
    slots.forEach((p) => m.set(`${p.day_of_week}-${p.period_number}`, p));
    const used = new Set(slots.map((p) => p.day_of_week));
    const last = Math.max(5, ...Array.from(used));
    return {
      days: Array.from({ length: last }, (_, i) => i + 1),
      numbers: Array.from(new Set(slots.map((p) => p.period_number))).sort((a, b) => a - b),
      at: (d: number, n: number) => m.get(`${d}-${n}`),
    };
  }, [slots]);

  if (!numbers.length) return <div className="panel-pad muted">{empty}</div>;

  return (
    <div className="schedule-grid" style={days.length !== 5 ? { gridTemplateColumns: `90px repeat(${days.length},minmax(0,1fr))` } : undefined}>
      <div className="schedule-header">PERIOD</div>
      {days.map((d) => (
        <div className="schedule-header" key={d}>
          {DAY_NAME[d]}
        </div>
      ))}
      {numbers.map((n) => {
        const row = days.map((d) => at(d, n));
        const any = row.find(Boolean)!;
        if (row.every((p) => !p || p.is_break)) {
          return (
            <div className="schedule-break" key={n}>
              {`${(any.label ?? "Break").toUpperCase()} · ${span(any.start_time, any.end_time)}`}
            </div>
          );
        }
        return (
          <div key={n} style={{ display: "contents" }}>
            <div className="schedule-time">
              <strong>{any.label ?? `Period ${n}`}</strong>
              <br />
              {span(any.start_time, any.end_time)}
            </div>
            {days.map((d, i) => (
              <div className="schedule-cell" key={d}>
                {cell(d, row[i], n)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** A lesson tile, as the mock draws one; a button only when it does something. */
export function Lesson({ tone, title, lines, onClick }: { tone: string; title: string; lines: (string | null | undefined)[]; onClick?: () => void }) {
  const body = (
    <>
      <strong>{title}</strong>
      {lines.filter(Boolean).map((l, i) => (
        <small key={i}>{l}</small>
      ))}
    </>
  );
  return onClick ? (
    <button type="button" className={`lesson ${tone}`} style={{ width: "100%", textAlign: "left", border: "0" }} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={`lesson ${tone}`}>{body}</div>
  );
}
