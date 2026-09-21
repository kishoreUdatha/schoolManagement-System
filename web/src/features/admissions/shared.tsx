"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";
import { api, ApiError } from "@/lib/api";
import { label } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { session } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import type { AcademicYear } from "@/features/students/types";
import type { Application } from "./types";

export const ENQ = "/api/v1/school/admissions/enquiries";
export const APPS = "/api/v1/school/admissions/applications";

/** Local "YYYY-MM-DD" for today (the API's dates are plain dates). */
export function todayIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Whole days from today to a plain date: negative is overdue. */
export function daysFromToday(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date();
  const a = Date.UTC(y, m - 1, d);
  const b = Date.UTC(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((a - b) / 86_400_000);
}

/** The class an application is for, by the school's class list or the free text. */
export const appClass = (a: Pick<Application, "class_name" | "applying_for_class">) => a.class_name ?? a.applying_for_class ?? "—";

/** "fee_pending" -> "Fee pending"; stage/status words for badges. */
export const statusLabel = (s: string) => label(s);

/** The school's academic years with the current one picked out. */
export function useYears() {
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const current = years.data?.find((y) => y.is_current) ?? years.data?.[0] ?? null;
  return { ...years, current };
}

/** Screens that change an application tell the others on the page to reload. */
const EVENT = "admissions:changed";
export const emitChange = () => window.dispatchEvent(new Event(EVENT));
export function useOnChange(fn: () => void) {
  useEffect(() => {
    window.addEventListener(EVENT, fn);
    return () => window.removeEventListener(EVENT, fn);
  }, [fn]);
}

/** Page-head buttons ask the screen to act (approve, complete verification…). */
const ACTION = "admissions:action";
export const emitAction = (name: string) => window.dispatchEvent(new CustomEvent(ACTION, { detail: name }));
export function useOnAction(name: string, fn: () => void) {
  useEffect(() => {
    const h = (e: Event) => {
      if ((e as CustomEvent).detail === name) fn();
    };
    window.addEventListener(ACTION, h);
    return () => window.removeEventListener(ACTION, h);
  }, [name, fn]);
}

/** A page-head button that fires a screen action. */
export function ActionButton({ name, icon = "check", children }: { name: string; icon?: IconName; children: string }) {
  return (
    <button type="button" className="btn primary" onClick={() => emitAction(name)}>
      <Icon name={icon} className="sm" />
      {children}
    </button>
  );
}

/** A page-head link that carries the current ?id= on to another screen. */
export function WithIdLink({ screen, icon = "arrow", fallback, children }: { screen: number; icon?: IconName; fallback: number; children: string }) {
  const id = useSearchParams().get("id");
  return (
    <Link href={id ? `${routeOf(screen)}?id=${id}` : routeOf(fallback)} className="btn primary">
      <Icon name={icon} className="sm" />
      {children}
    </Link>
  );
}

function authHeader(): Record<string, string> {
  const t = session.get()?.access;
  return t ? { authorization: `Bearer ${t}` } : {};
}

/** Open an uploaded application document (the file needs the bearer token). */
export async function openDocument(docId: number) {
  const win = window.open("", "_blank");
  const res = await fetch(`${APPS}/documents/${docId}/file`, { headers: authHeader() });
  if (!res.ok) {
    win?.close();
    throw new ApiError(res.status === 404 ? "The file is missing." : `The file could not be opened (${res.status}).`, res.status);
  }
  const url = URL.createObjectURL(await res.blob());
  if (win) win.location.href = url;
  else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** POST a document to an application as multipart form data. */
export async function uploadDocument(applicationId: number, file: File, category: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("category", category);
  const res = await fetch(`${APPS}/${applicationId}/documents`, { method: "POST", headers: authHeader(), body: form });
  if (!res.ok) {
    let msg = `The upload failed (${res.status}).`;
    try {
      const b = await res.json();
      if (typeof b?.detail === "string") msg = b.detail;
    } catch {
      /* keep the generic message */
    }
    throw new ApiError(msg, res.status);
  }
}

/** Download rows as a CSV file (the Export buttons). */
export function downloadCsv(name: string, columns: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [columns, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Bytes to "1.2 MB" / "480 KB". */
export function size(n: number): string {
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Everything an application needs but the list omits, fetched per row. */
export function useDetails(ids: number[]) {
  const key = ids.join(",");
  const [data, setData] = useState<Record<number, Application>>({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    if (!ids.length) {
      setData({});
      return;
    }
    Promise.all(
      ids.map((id) => api.get<Application>(`${APPS}/${id}`).catch(() => null)),
    ).then((list) => {
      if (!live) return;
      const m: Record<number, Application> = {};
      list.forEach((a) => a && (m[a.id] = a));
      setData(m);
    });
    return () => {
      live = false;
    };
    // key stands for ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  return { data, reload: () => setTick((t) => t + 1) };
}
