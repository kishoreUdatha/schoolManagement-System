/*
 * File traffic the shared client does not carry: multipart uploads and
 * binary downloads (document files, certificate PDFs). `api` only sends
 * JSON and reads text, so these go through fetch with the same bearer
 * token. On a 401 we let `api` refresh the token (it signs the person out
 * when it cannot) and try once more.
 */

import { ApiError, api } from "@/lib/api";
import { PORTAL, session } from "@/lib/session";

function readable(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    const lines = detail.map((d: { loc?: unknown[]; msg?: string }) => {
      const field = Array.isArray(d.loc) ? String(d.loc.at(-1) ?? "") : "";
      return field ? `${field.replace(/_/g, " ")}: ${d.msg ?? "is not valid"}` : (d.msg ?? "");
    });
    if (lines.some(Boolean)) return lines.filter(Boolean).join("; ");
  }
  if (status === 403) return "You do not have access to this.";
  if (status === 404) return "Not found.";
  if (status === 413) return "The file is too large.";
  return `The server could not complete that (${status}).`;
}

async function send(method: string, path: string, body?: FormData, retried = false): Promise<Response> {
  const token = session.get()?.access;
  const res = await fetch(path, { method, headers: token ? { authorization: `Bearer ${token}` } : {}, body });
  if (res.status === 401 && token && !retried) {
    const role = session.get()?.user.role;
    if (role) {
      try {
        await api.get(`/api/v1/${PORTAL[role]}/auth/me`);
      } catch {
        /* api has already sent the person to sign in */
      }
    }
    return send(method, path, body, true);
  }
  if (!res.ok) {
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    throw new ApiError(readable(parsed, res.status), res.status);
  }
  return res;
}

/** Open an authenticated file in a new tab, or save it when a name is given. */
export async function openFile(path: string, filename?: string): Promise<void> {
  const res = await send("GET", path);
  const url = URL.createObjectURL(await res.blob());
  if (filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  } else {
    window.open(url, "_blank", "noopener");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** POST a multipart form and return the JSON the server sends back. */
export async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await send("POST", path, form);
  return (await res.json()) as T;
}

/** "PDF", "JPG" … for the file tile. */
export function fileKind(d: { content_type: string; original_name: string }): string {
  const ext = d.original_name.split(".").pop();
  if (ext && ext.length <= 4 && ext !== d.original_name) return ext.toUpperCase();
  return (d.content_type.split("/").pop() ?? "FILE").toUpperCase().slice(0, 4);
}

export function fileSize(n: number): string {
  return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.ceil(n / 1024))} KB`;
}

/** Whole days from today to an ISO date; negative once it has passed. */
export function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((then - today) / 86_400_000);
}
