"use client";

import { useEffect, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { api, ApiError } from "@/lib/api";
import { session } from "@/lib/session";

/*
 * Small helpers for the Academics screens SCR-101 to SCR-109. Page-head
 * buttons live in the (server) page, so they talk to the live component
 * through a window event instead of the preview's data-* hooks.
 */

const EVENT = "academics:action";

/** A page-head button that asks the live component on the page to act. */
export function PageAction({ action, icon, children, primary = false }: { action: string; icon: IconName; children: string; primary?: boolean }) {
  return (
    <button type="button" className={`btn ${primary ? "primary" : ""}`} onClick={() => window.dispatchEvent(new CustomEvent(EVENT, { detail: action }))}>
      <Icon name={icon} className="sm" />
      {children}
    </button>
  );
}

/** Run `fn` when a PageAction with this name is pressed. */
export function usePageAction(action: string, fn: () => void) {
  useEffect(() => {
    const on = (e: Event) => {
      if ((e as CustomEvent).detail === action) fn();
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [action, fn]);
}

/** The mock's modal, opened by the component that owns it. */
export function Dialog({ title, open, onClose, children, wide = false }: { title: string; open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop show" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: wide ? 720 : 560, maxHeight: "90vh", overflow: "auto" }}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** Download rows as a CSV file named `name`. */
export function downloadCsv(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Authenticated fetch for what `api` cannot send: multipart bodies and file downloads. */
async function raw(method: string, path: string, body?: FormData, retried = false): Promise<Response> {
  const token = session.get()?.access;
  const res = await fetch(path, { method, body, headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (res.status === 401 && !retried) {
    // A cheap authenticated GET lets `api` refresh the token, then try once more.
    await api.get("/api/v1/school/syllabus").catch(() => undefined);
    return raw(method, path, body, true);
  }
  if (!res.ok) {
    let msg = `The server could not complete that (${res.status}).`;
    try {
      const d = (await res.json()) as { detail?: unknown };
      if (typeof d.detail === "string") msg = d.detail;
      else if (Array.isArray(d.detail)) msg = d.detail.map((x: { msg?: string }) => x.msg ?? "").filter(Boolean).join("; ") || msg;
    } catch {
      /* not JSON */
    }
    throw new ApiError(msg, res.status);
  }
  return res;
}

export async function postForm<T>(path: string, body: FormData): Promise<T> {
  const res = await raw("POST", path, body);
  return (await res.json()) as T;
}

/** Fetch an authenticated file and open it in a new tab. */
export async function openFile(path: string) {
  const res = await raw("GET", path);
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** "14:30:00" -> "02:30 PM". */
export function time12(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${String(((h + 11) % 12) + 1).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** Today in the viewer's time zone as YYYY-MM-DD. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
