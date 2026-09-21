/*
 * The one way screens talk to the backend. Adds the bearer token, refreshes
 * it once on a 401, and sends the person to sign in when that fails too.
 */

import { PORTAL, session } from "./session";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

function url(path: string, params?: Params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const qs = q.toString();
  return qs ? `${path}?${qs}` : path;
}

/** A readable message out of whatever FastAPI sent back. */
function message(body: unknown, status: number): string {
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
  return `The server could not complete that (${status}).`;
}

let refreshing: Promise<boolean> | null = null;

async function refresh(): Promise<boolean> {
  const s = session.get();
  if (!s) return false;
  refreshing ??= fetch(`/api/v1/${PORTAL[s.user.role]}/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: s.refresh }),
  })
    .then(async (r) => {
      if (!r.ok) return false;
      const d = await r.json();
      session.set({ access: d.access_token, refresh: d.refresh_token ?? s.refresh, user: d.user ?? s.user });
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function toSignIn() {
  session.clear();
  if (typeof window === "undefined" || window.location.pathname === "/welcome/sign-in") return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = `/welcome/sign-in?expired=1&next=${next}`;
}

/** Send once, refreshing the token and retrying on a 401. */
async function send(method: string, path: string, opts: { params?: Params; body?: unknown; form?: FormData } = {}, retried = false): Promise<Response> {
  const token = session.get()?.access;
  const res = await fetch(url(path, opts.params), {
    method,
    headers: {
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  if (res.status === 401 && token && !retried) {
    if (await refresh()) return send(method, path, opts, true);
    toSignIn();
  }
  return res;
}

async function fail(res: Response): Promise<never> {
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* plain text */
  }
  throw new ApiError(message(body, res.status), res.status);
}

async function request<T>(method: string, path: string, opts: { params?: Params; body?: unknown; form?: FormData } = {}): Promise<T> {
  const res = await send(method, path, opts);
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) throw new ApiError(message(body, res.status), res.status);
  return body as T;
}

export const api = {
  get: <T>(path: string, params?: Params) => request<T>("GET", path, { params }),
  post: <T>(path: string, body?: unknown, params?: Params) => request<T>("POST", path, { body: body ?? {}, params }),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, { body }),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, { body }),
  delete: <T>(path: string) => request<T>("DELETE", path),
  /** Multipart form (file uploads). Do not set content-type; the browser adds the boundary. */
  upload: <T>(path: string, form: FormData, method: "POST" | "PUT" | "PATCH" = "POST") => request<T>(method, path, { form }),
  /** A protected file (PDF, CSV…) as a Blob. */
  blob: async (path: string, params?: Params): Promise<Blob> => {
    const res = await send("GET", path, { params });
    if (!res.ok) await fail(res);
    return res.blob();
  },
  /** Fetch a protected file and hand it to the browser as a download. */
  download: async (path: string, filename: string, params?: Params) => {
    const blob = await api.blob(path, params);
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60_000);
  },
  /** Open a protected PDF in a new tab (reports, receipts, certificates). */
  open: async (path: string, params?: Params) => {
    const win = window.open("", "_blank");
    try {
      const href = URL.createObjectURL(await api.blob(path, params));
      if (win) win.location.href = href;
      else window.location.href = href;
    } catch (e) {
      win?.close();
      throw e;
    }
  },
};

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export type Paginated<T> = { items: T[]; total: number; page: number; pages: number };
