/*
 * What the shared client cannot carry: multipart uploads (import files) and
 * authenticated CSV downloads (audit log, exports). `api` sends JSON only,
 * so these use fetch with the same bearer token. On a 401 a GET through
 * `api` refreshes the token (or sends the person to sign in); then one retry.
 */

import { ApiError, api } from "@/lib/api";
import { PORTAL, session } from "@/lib/session";

type Params = Record<string, string | number | boolean | null | undefined>;

function withQuery(path: string, params?: Params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

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
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* plain text */
    }
    throw new ApiError(readable(parsed, res.status), res.status);
  }
  return res;
}

/** Save an authenticated file (a CSV export) under the given name. */
export async function download(path: string, filename: string, params?: Params): Promise<void> {
  const res = await send("GET", withQuery(path, params));
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** POST a multipart form and return the JSON the server sends back. */
export async function upload<T>(path: string, form: FormData): Promise<T> {
  const res = await send("POST", path, form);
  return (await res.json()) as T;
}
