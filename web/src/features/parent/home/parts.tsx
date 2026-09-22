"use client";

/*
 * Small pieces shared by the wired parent screens (PM-001…PM-020): the
 * loading / error / empty states in the pack's own classes, the child gate
 * that keeps siblings' records apart, and date helpers.
 */

import { useRouter } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import { useParent, type Child } from "@/components/parent/ParentShell";
import { parentRoute } from "@/lib/parentScreens";
import { useSession } from "@/lib/useSession";

export const childPath = (childId: number, suffix = "") => `/api/v1/parent/me/children/${childId}${suffix}`;

export function PmLoading({ what = "Loading…" }: { what?: string }) {
  return (
    <div className="panel soft" aria-busy="true">
      <p className="muted">{what}</p>
    </div>
  );
}

export function PmError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="panel soft" role="alert">
      <p className="bad">{children}</p>
    </div>
  );
}

export function PmEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="panel soft">
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

/**
 * Renders `render(childId, child)` for the child picked in the child bar.
 * The subtree is keyed on the child, so switching child remounts it and no
 * request state from one sibling is ever shown for another.
 */
export function ChildScoped({ render }: { render: (childId: number, child: Child) => ReactNode }) {
  const { child, childId, loading, error, children } = useParent();
  const signedIn = useSession()?.user.role === "parent";
  // Signed-out visitors are being sent to sign-in by ParentShell; show nothing misleading meanwhile.
  if (!signedIn) return <PmLoading />;
  if (error) return <PmError>{error}</PmError>;
  if (loading && !child) return <PmLoading />;
  if (!loading && children.length === 0) {
    return (
      <>
        <PmEmpty title="No child linked yet">
          Your child’s school links your account to your child. Once they have, their records appear here.
        </PmEmpty>
        <ActionLink secondary href={parentRoute(4)}>
          How linking works
        </ActionLink>
      </>
    );
  }
  if (!child || childId === null) return <PmLoading />;
  return <Fragment key={childId}>{render(childId, child)}</Fragment>;
}

/** Today in the viewer's time zone, as YYYY-MM-DD. */
export function todayIso(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-09-24" -> "24 Sep". */
export function shortDate(v: string | null | undefined): string {
  if (!v) return "—";
  const [, m, d] = v.slice(0, 10).split("-").map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : v;
}

/** "2026-09-24" -> "24 September 2026". */
export function longDate(v: string | null | undefined): string {
  if (!v) return "—";
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS_LONG[m - 1]} ${y}` : v;
}

/** A from–to date range, collapsed when it is one day. */
export function dateRange(from: string, to: string): string {
  if (from === to) return longDate(from);
  const [fy, fm] = from.split("-");
  const [ty, tm] = to.split("-");
  if (fy === ty && fm === tm) return `${Number(from.slice(8, 10))}–${longDate(to)}`;
  return `${shortDate(from)} – ${longDate(to)}`;
}

/** "13:05:00" -> "1:05 PM"; `bare` drops the AM/PM. */
export function clock(v: string | null | undefined, bare = false): string {
  if (!v) return "—";
  const [h, m] = v.split(":").map(Number);
  if (Number.isNaN(h)) return v;
  const hh = h % 12 || 12;
  return `${hh}:${String(m || 0).padStart(2, "0")}${bare ? "" : h < 12 ? " AM" : " PM"}`;
}

/** Days from today to a YYYY-MM-DD date (negative when past). */
export function daysUntil(v: string): number {
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  const t = new Date();
  const today = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
}

/** "Due today" / "Due tomorrow" / "Due 28 Sep" / "Was due 20 Sep". */
export function dueLabel(v: string): string {
  const n = daysUntil(v);
  if (n === 0) return "Due today";
  if (n === 1) return "Due tomorrow";
  if (n < 0) return `Was due ${shortDate(v)}`;
  return `Due ${shortDate(v)}`;
}

export function Chevron() {
  return (
    <span className="v-icon neutral mini">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </span>
  );
}

/** The school the parent belongs to, from the caller's branding. */
export type Branding = { school_id: number; name: string; code: string | null; logo_url?: string | null; address?: string | null };
export const BRANDING_PATH = "/api/v1/branding/me";

/** The pack's full-width `.action` button that navigates (an <a> would lose the button styling). */
export function ActionLink({ href, secondary, children }: { href: string; secondary?: boolean; children: ReactNode }) {
  const router = useRouter();
  return (
    <button type="button" className={secondary ? "action secondary" : "action"} onClick={() => router.push(href)}>
      {children}
    </button>
  );
}

/** Notice categories as the parent app names them (the API's `category`). */
export const NOTICE_CATEGORIES = [
  ["attendance", "Attendance"],
  ["homework", "Homework"],
  ["fees", "Fees"],
  ["exams", "Exams"],
  ["events", "Events"],
  ["general", "School updates"],
] as const;

export const categoryLabel = (c: string | null | undefined) => NOTICE_CATEGORIES.find(([k]) => k === c)?.[1] ?? "School updates";

/** Where a notice leads: its own link, and only ever to a screen inside the parent app. */
export function noticeTarget(link: string | null | undefined): string | null {
  return link && /^\/parent\/[\w\-/?=&.%]*$/.test(link) ? link : null;
}
