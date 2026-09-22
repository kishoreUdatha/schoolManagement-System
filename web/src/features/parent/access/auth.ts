/*
 * Parent sign-in plumbing shared by PM-002 (email + password) and PM-003
 * (the OTP step the server may ask for). The OTP challenge travels between
 * the two screens in sessionStorage, never in the URL.
 */

import { session, type SessionUser } from "@/lib/session";

export type Token = { access_token: string; refresh_token: string; user: SessionUser; requires_password_change?: boolean };
export type OtpStep = { otp_required: true; challenge: string; sent_via: string };
export type Pending = { challenge: string; sent_via: string; email: string; next: string | null };

export const LOGIN_PATH = "/api/v1/parent/auth/login";
export const VERIFY_PATH = "/api/v1/parent/auth/verify-otp";

const KEY = "bc_parent_otp";

export function savePending(p: Pending) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: PM-003 will ask to sign in again */
  }
}

export function readPending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

export function clearPending() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** A same-site path to return to after sign-in, or null. */
export function safeNext(next: string | null): string | null {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : null;
}

/**
 * Store the session exactly as the workspace sign-in does and say where to
 * go next. Throws when the account is not a parent account.
 */
export function finishSignIn(t: Token, next: string | null, passwordRoute: string): string {
  if (t.user.role !== "parent") {
    throw new Error("This is not a parent account. Staff and students sign in from the school workspace.");
  }
  session.set({ access: t.access_token, refresh: t.refresh_token, user: t.user });
  clearPending();
  if (t.requires_password_change || t.user.must_change_password) return passwordRoute;
  return safeNext(next) ?? "/parent/home";
}

/** "a•••@example.com" for the OTP screen. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 1)}•••@${domain}`;
}
