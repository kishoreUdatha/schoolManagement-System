"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { api, errorText, type Paginated } from "@/lib/api";
import { useSession } from "@/lib/useSession";
import type { DayView, MyClasses, SchoolProfile, StudentHit } from "./types";

/* ---------- The school's day ---------- */

/** The backend's own fallback when a school has no timezone set. */
const DEFAULT_TZ = "Asia/Kolkata";

/** Today's "YYYY-MM-DD" in a time zone, whatever the viewer's clock says. */
export function todayIn(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }
}

/** "2026-09-21" plus n days, calendar arithmetic with no time zone involved. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a plain date. */
export function weekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Monday, 21 September 2026", as the mocks print a register's day. */
export function longDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DAYS[weekday(iso) % 7]}, ${d} ${MONTHS[m - 1]} ${y}`;
}

export const monthName = (m: number) => MONTHS[m - 1];

/** "08:30:00" -> "08:30 AM". */
export function clock(t: string | null | undefined): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

const cachedDay = new Map<string, Promise<string>>();

/**
 * Which day it is at the school. The server decides what "today" means for
 * attendance (`school_today`: the school's own time zone), so a register is
 * never marked for the wrong day because the viewer's laptop is elsewhere or
 * it is after 18:30 UTC.
 *
 * - School admin: the school profile carries the time zone.
 * - Teacher: no teacher endpoint returns the zone, so ask the register
 *   itself. The server marks a date editable only up to its own today, never
 *   beyond, so the latest editable day around our guess is the school's day.
 * - Everyone else: the backend's default zone.
 */
async function resolveSchoolDay(role: string | undefined): Promise<string> {
  if (role === "school_admin") {
    const p = await api.get<SchoolProfile>("/api/v1/school/profile");
    return todayIn(p.timezone || DEFAULT_TZ);
  }
  const guess = todayIn(DEFAULT_TZ);
  if (role === "teacher") {
    const mine = await api.get<MyClasses>("/api/v1/teacher/my-classes");
    const section = mine.class_teacher_of[0]?.section_id;
    if (!section) return guess;
    const editable = async (d: string) =>
      (await api.get<DayView>("/api/v1/teacher/attendance", { section_id: section, date: d })).is_editable;
    if (await editable(addDays(guess, 1))) return addDays(guess, 1);
    if (await editable(guess)) return guess;
    return addDays(guess, -1);
  }
  return guess;
}

/** The school's today, or null while it is being worked out. */
export function useSchoolDay(): string | null {
  const role = useSession()?.user.role;
  const [day, setDay] = useState<string | null>(null);
  useEffect(() => {
    if (!role) return;
    if (!cachedDay.has(role)) cachedDay.set(role, resolveSchoolDay(role).catch(() => todayIn(DEFAULT_TZ)));
    let live = true;
    cachedDay.get(role)!.then((d) => live && setDay(d));
    return () => {
      live = false;
    };
  }, [role]);
  return day;
}

/* ---------- Page-head buttons ---------- */

/**
 * The page head is drawn by the (server) page, the screen by a client
 * component. A head button announces itself with a window event and the
 * screen listens, so the buttons can stay exactly where the mock put them.
 */
export function PageAction({ event, icon, children, primary = false }: { event: string; icon: IconName; children: string; primary?: boolean }) {
  return (
    <button type="button" className={`btn ${primary ? "primary" : ""}`} onClick={() => window.dispatchEvent(new CustomEvent(event))}>
      <Icon name={icon} className="sm" />
      {children}
    </button>
  );
}

export function usePageAction(event: string, handler: () => void) {
  useEffect(() => {
    const f = () => handler();
    window.addEventListener(event, f);
    return () => window.removeEventListener(event, f);
  });
}

/* ---------- Modal, CSV, student search ---------- */

/** The mock's modal (.modal-backdrop / .modal). */
export function Modal({ open, title, onClose, children, footer }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="form-grid">{children}</div>
        <div className="actions row">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          {footer}
        </div>
      </div>
    </div>
  );
}

/** Fetch a CSV with the bearer token and hand it to the browser as a file. */
export async function downloadCsv(path: string, params: Record<string, string | number | null | undefined>, filename: string) {
  const text = await api.get<string>(path, params);
  const blob = new Blob([typeof text === "string" ? text : JSON.stringify(text)], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Search the school's students by name or admission number. */
export function StudentSearch({ value, onPick }: { value: StudentHit | null; onPick: (s: StudentHit | null) => void }) {
  const [typed, setTyped] = useState("");
  const [hits, setHits] = useState<StudentHit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (value || typed.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .get<Paginated<StudentHit>>("/api/v1/school/students", { search: typed.trim(), page_size: 8 })
        .then((r) => {
          setHits(r.items);
          setErr(null);
        })
        .catch((e) => setErr(errorText(e)));
    }, 300);
    return () => clearTimeout(t);
  }, [typed, value]);

  if (value)
    return (
      <div className="spread">
        <span>{`${value.full_name} · ${value.admission_no}`}</span>
        <button type="button" className="btn" onClick={() => onPick(null)}>
          Change
        </button>
      </div>
    );
  return (
    <div>
      <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type a name or admission number" aria-label="Find a student" />
      {err ? <small className="muted">{err}</small> : null}
      {hits.map((h) => (
        <button key={h.id} type="button" className="btn" style={{ display: "block", width: "100%", marginTop: 6, textAlign: "left" }} onClick={() => onPick(h)}>
          {`${h.full_name} · ${h.admission_no}`}
        </button>
      ))}
    </div>
  );
}

/** Label for an attendance status: "half_day" -> "Half day". */
export const statusLabel = (s: string | null | undefined) => (s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, " ") : "Not marked");

/** The mock's colour class for a status select / matrix symbol. */
export const statusClass = (s: string | null | undefined) => (s === "present" ? "present" : s === "absent" ? "absent" : s === "late" ? "late" : s ? "leave" : "");
