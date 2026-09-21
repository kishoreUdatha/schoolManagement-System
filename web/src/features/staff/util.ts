"use client";

import { ApiError } from "@/lib/api";
import { session } from "@/lib/session";

/** Save the rows on screen as a CSV file (the mock's Export buttons). */
export function downloadCsv(name: string, columns: string[], rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [columns, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function authHeader(): Record<string, string> {
  const token = session.get()?.access;
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * Multipart upload. `api.post` always sends JSON, so file uploads go
 * through fetch here with the same bearer token.
 */
export async function uploadForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: authHeader(), body: form });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new ApiError(typeof detail === "string" ? detail : `The upload failed (${res.status}).`, res.status);
  }
  return body as T;
}

/** Open a stored file (it needs the bearer token, so a plain link will not do). */
export async function openFile(path: string) {
  const res = await fetch(path, { headers: authHeader() });
  if (!res.ok) throw new ApiError(res.status === 404 ? "The file was not found." : `Could not open the file (${res.status}).`, res.status);
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** "2026-09" for the month containing today. */
export function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
