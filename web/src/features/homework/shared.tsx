"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { api } from "@/lib/api";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useHydrated, useSession } from "@/lib/useSession";
import type { Child, Homework, StudentMe, Submission } from "./types";

/** Today in the viewer's time zone, as the API's YYYY-MM-DD. */
export function todayIso(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

/** Whole days from today to a YYYY-MM-DD date (negative when past). */
export function daysUntil(d: string): number {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = todayIso().split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, day) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

/** "25 Sep" for the compact event rows. */
export function shortDate(d: string | null | undefined): string {
  if (!d) return "—";
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [, m, day] = d.slice(0, 10).split("-").map(Number);
  return `${day} ${M[m - 1]}`;
}

/** The teacher's view of a piece of work: closed, still open after the due date, or live. */
export function teacherState(isClosed: boolean, isPastDue: boolean, due: string): string {
  if (isClosed) return "Closed";
  if (isPastDue) return "Open (late)";
  return daysUntil(due) <= 3 ? "Due soon" : "Published";
}

/** The learner's view: what they handed in decides, then the dates. */
export function learnerState(h: Homework, s: Submission | null | undefined): string {
  if (s?.status === "approved") return "Marked";
  if (s?.status === "rejected") return "Returned";
  if (s) return "Submitted";
  if (h.is_closed) return "Closed";
  if (h.is_past_due) return "Overdue";
  return daysUntil(h.due_date) <= 3 ? "Due soon" : "Assigned";
}

/** GET several paths at once (one per row), keyed by path; a failed one is null. */
export function useEach<T>(paths: string[]) {
  const key = paths.join("|");
  const [data, setData] = useState<Record<string, T | null>>({});
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const list = key ? key.split("|") : [];
    if (!list.length) {
      setData({});
      return;
    }
    setLoading(true);
    Promise.all(list.map((p) => api.get<T>(p).then((d) => [p, d] as const, () => [p, null] as const))).then((r) => {
      if (!live) return;
      setData(Object.fromEntries(r));
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [key, tick]);
  // Still loading until every path asked for has an answer.
  const pending = loading || paths.some((p) => !(p in data));
  return { data, loading: pending, reload: () => setTick((t) => t + 1) };
}

/**
 * Whose homework: a signed-in student sees their own (student portal);
 * a parent picks one of their children (?child=, parent portal). Both
 * portals return the same homework and submission shapes.
 */
export function useLearner() {
  const hydrated = useHydrated();
  const role = useSession()?.user.role;
  const params = useSearchParams();
  const isParent = role === "parent";
  const isStudent = role === "student";
  const children = useApi<Child[]>(isParent ? "/api/v1/parent/me/children" : null);
  const me = useApi<StudentMe>(isStudent ? "/api/v1/student/me" : null);
  const [childId, setChildId] = useState<number | null>(params.get("child") ? Number(params.get("child")) : null);

  useEffect(() => {
    if (isParent && childId === null && children.data?.length) setChildId(children.data[0].id);
  }, [isParent, childId, children.data]);

  const child = children.data?.find((c) => c.id === childId);
  const base = isStudent ? "/api/v1/student/homework" : isParent && childId ? `/api/v1/parent/me/children/${childId}/homework` : null;
  const who = isStudent
    ? me.data && { name: me.data.full_name, sub: `${[me.data.class_name, me.data.section_name].filter(Boolean).join(" ")} · ${me.data.admission_no}` }
    : child && { name: child.full_name, sub: `${child.section_label ?? ""} · ${child.admission_no}` };
  return {
    hydrated,
    role,
    /** Signed in as someone with no homework of their own to see. */
    wrongRole: hydrated && Boolean(role) && !isParent && !isStudent,
    isParent,
    children: children.data ?? [],
    childId,
    setChildId,
    base,
    who,
    /** Query string that keeps the chosen child on the next screen. */
    childQuery: isParent && childId ? `&child=${childId}` : "",
    error: children.error ?? me.error,
  };
}

/** A parent's child picker, sized for the filter bar. */
export function ChildPicker({ learner }: { learner: ReturnType<typeof useLearner> }) {
  if (!learner.isParent) return null;
  return (
    <select aria-label="Child" value={learner.childId ?? ""} onChange={(e) => learner.setChildId(Number(e.target.value))}>
      {learner.children.map((c) => (
        <option key={c.id} value={c.id}>
          {c.full_name}
        </option>
      ))}
    </select>
  );
}

/** A page-head link that carries the current ?id= (and ?child=) to another screen. */
export function WithIdLink({ screen, icon, children, primary = true, fallback }: { screen: number; icon: IconName; children: string; primary?: boolean; fallback?: number }) {
  const p = useSearchParams();
  const id = p.get("id");
  const child = p.get("child");
  const href = id ? `${routeOf(screen)}?id=${id}${child ? `&child=${child}` : ""}` : routeOf(fallback ?? screen);
  return (
    <Link href={href} className={`btn ${primary ? "primary" : ""}`}>
      <Icon name={icon} className="sm" />
      {children}
    </Link>
  );
}

/** Save the rows on screen as a CSV file. */
export function downloadCsv(name: string, columns: string[], rows: string[][]) {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const text = [columns, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** The attachment is a link (the API stores a URL, there is no upload), shown as the mock's document card. */
export function LinkCard({ url, title, note }: { url: string; title?: string; note?: string }) {
  const name = title ?? decodeURIComponent(url.split("?")[0].split("/").filter(Boolean).pop() ?? url);
  const ext = (name.split(".").pop() ?? "").toUpperCase();
  return (
    <div className="document-card">
      <div className={`file-icon ${ext === "PDF" ? "pdf" : ""}`}>{ext.length && ext.length <= 4 ? ext : "URL"}</div>
      <div className="document-info">
        <h4>{name}</h4>
        <p>{note ?? url}</p>
      </div>
      <a className="btn" href={url} target="_blank" rel="noreferrer">
        Open
      </a>
    </div>
  );
}
