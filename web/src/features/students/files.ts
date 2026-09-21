// File transfer for the Students screens: multipart uploads and authenticated
// downloads, which `api` (JSON only) does not cover. Kept here rather than in
// src/lib so the shared client stays as it is.

import { api, ApiError } from "@/lib/api";
import { session } from "@/lib/session";

async function send(method: string, path: string, body?: FormData, retried = false): Promise<Response> {
  const token = session.get()?.access;
  const res = await fetch(path, { method, body, headers: token ? { authorization: `Bearer ${token}` } : {} });
  if (res.status === 401 && !retried) {
    // A cheap authenticated GET lets the shared client refresh the token.
    await api.get("/api/v1/school/profile").catch(() => undefined);
    return send(method, path, body, true);
  }
  if (!res.ok) {
    let msg = `The server could not complete that (${res.status}).`;
    try {
      const j = await res.json();
      if (typeof j?.detail === "string") msg = j.detail;
      else if (Array.isArray(j?.detail)) msg = j.detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join("; ") || msg;
    } catch {
      /* not JSON */
    }
    throw new ApiError(msg, res.status);
  }
  return res;
}

/** POST a multipart form (document uploads). */
export async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await send("POST", path, form);
  return (await res.json()) as T;
}

/** Fetch a protected file and hand it to the browser as a download. */
export async function download(path: string, filename: string) {
  const res = await send("GET", path);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Save rows the screen already holds as a CSV file. */
export function saveCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
