"use client";

/*
 * Small pieces the self-service screens (NEW-090 to NEW-096) share: a role
 * gate, page-head buttons that talk to the live component under them, a
 * labelled field and a few date helpers. Kept here rather than in
 * src/components, which other modules own.
 */

import { useEffect, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Loading } from "@/components/ui/states";
import type { Role } from "@/lib/session";
import { useHydrated, useSession } from "@/lib/useSession";

import { ask } from "@/lib/dialog";
/** A plain panel with one line of text, for the wrong role or an empty setup. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <section className="panel">
      <div className="panel-pad">
        <p className="muted">{children}</p>
      </div>
    </section>
  );
}

/**
 * Renders the screen only for the roles its portal serves, so another role
 * sees a sentence instead of a string of 403s.
 */
export function RoleGate({ roles, message, children }: { roles: Role[]; message: string; children: ReactNode }) {
  const s = useSession();
  const hydrated = useHydrated();
  if (!hydrated || !s) return <Loading />;
  if (!roles.includes(s.user.role)) return <Note>{message}</Note>;
  return <>{children}</>;
}

const EVENT = "self:page-action";

/**
 * A page-head button. The page is a server component, so the button
 * announces itself and the live component on the page answers. Shown only
 * to the roles that can use it.
 */
export function PageAction({ name, icon, roles, children }: { name: string; icon: IconName; roles: Role[]; children: string }) {
  const s = useSession();
  if (!s || !roles.includes(s.user.role)) return null;
  return (
    <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new CustomEvent(EVENT, { detail: name }))}>
      <Icon name={icon} className="sm" />
      {children}
    </button>
  );
}

/** Run `fn` when the page-head button called `name` is pressed. */
export function usePageAction(name: string, fn: () => void) {
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent).detail === name) fn();
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [name, fn]);
}

/** The mock's `.field`: a label over its control. */
export function Field({ label, required = false, full = false, children }: { label: string; required?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {label}
        {required ? <span className="req">*</span> : null}
      </span>
      {children}
    </label>
  );
}

/** Label/value rows in the mock's `.kv` list. */
export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A date as YYYY-MM-DD in the viewer's time zone (not UTC). */
export function isoDay(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The Monday of the week `d` falls in, as YYYY-MM-DD. */
export function mondayOf(d = new Date()): string {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return isoDay(m);
}

/** YYYY-MM-DD plus n days. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDay(new Date(y, m - 1, d + n));
}

/** "2026-09" -> "September 2026". */
export function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** A time of day from an ISO timestamp: "08:42 AM". */
export function clock(v: string | null | undefined): string {
  if (!v) return "—";
  const t = new Date(v);
  if (Number.isNaN(t.getTime())) return "—";
  return t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
}

/** Weekday of a YYYY-MM-DD date: "Mon". */
export function weekday(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { weekday: "short" });
}

/** "12.00" -> "12", "1.50" -> "1.5". */
export function num(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : String(Math.round(n * 100) / 100);
}

export const confirmed = async (message: string) => typeof window !== "undefined" && (await ask(message));
