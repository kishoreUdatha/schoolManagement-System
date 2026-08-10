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
        const redirect = encodeURIComponent(
          window.location.pathname + window.location.search
        );
        window.location.href = `/super-admin/login?next=${redirect}`;
      }
    }
    return Promise.reject(error);
  }
);

export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string })?.detail;
    if (detail) return detail;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}
