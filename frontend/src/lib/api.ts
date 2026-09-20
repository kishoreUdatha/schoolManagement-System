import axios, { AxiosError } from "axios";

import { auth } from "@/lib/auth";

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export const api = axios.create({
  baseURL,
  withCredentials: false,
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = auth.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      const onLogin = window.location.pathname.endsWith("/login");
      if (!onLogin) {
        auth.clear();
        // Send people back to their own portal's login, not somebody else's.
        // The first path segment is the portal, so /parent/fees expires to
        // /parent/login — being bounced to the platform sign-in and told your
        // password is wrong is a confusing way to learn you were idle.
        const segment = window.location.pathname.split("/")[1] ?? "";
        const PORTALS = [
          "school", "principal", "teacher", "parent", "student",
          "accountant", "staff", "super-admin",
        ];
        const redirect = encodeURIComponent(
          window.location.pathname + window.location.search
        );
        window.location.href = PORTALS.includes(segment)
          ? `/${segment}/login?next=${redirect}`
          : `/account/denied?reason=expired&next=${redirect}`;
      }
    }
    return Promise.reject(error);
  }
);

/** A message a person can read, out of whatever the server sent back.
 *
 *  FastAPI answers a validation failure with `detail` as an array of objects,
 *  not a string. Returning that straight to a component renders an object as
 *  a React child, which throws — so a mistyped field would take the whole
 *  page down instead of showing a message under the input.
 */
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: unknown })?.detail;
    if (typeof detail === "string" && detail) return detail;
    if (Array.isArray(detail)) {
      const lines = detail
        .map((d) => {
          const item = d as { loc?: unknown[]; msg?: string };
          const field = Array.isArray(item.loc) ? String(item.loc.at(-1) ?? "") : "";
          const msg = item.msg ?? "is not valid";
          return field ? `${field.replace(/_/g, " ")}: ${msg}` : msg;
        })
        .filter(Boolean);
      if (lines.length) return lines.join("; ");
    }
    if (detail && typeof detail === "object") {
      const msg = (detail as { msg?: string }).msg;
      if (msg) return msg;
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
