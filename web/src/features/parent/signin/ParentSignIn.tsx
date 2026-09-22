"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorText } from "@/lib/api";
import { parentRoute } from "@/lib/parentScreens";
import { session, type SessionUser } from "@/lib/session";

type Token = { access_token: string; refresh_token: string; user: SessionUser; requires_password_change?: boolean };
type OtpStep = { otp_required: true; challenge: string; sent_via: string };

/**
 * PM-002 (and the PM-003 code step). The school's parent login is email
 * and password; the server may then ask for a one-time code. Markup and
 * classes are the pack's.
 */
export function ParentSignIn() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otp, setOtp] = useState<OtpStep | null>(null);

  function finish(t: Token) {
    if (t.user.role !== "parent") {
      setError("This account is not a parent account. Staff sign in from the school workspace.");
      return;
    }
    session.set({ access: t.access_token, refresh: t.refresh_token, user: t.user });
    if (t.requires_password_change || t.user.must_change_password) {
      router.replace("/welcome/first-login-change-password");
      return;
    }
    router.replace(next && next.startsWith("/parent") ? next : parentRoute(6));
  }

  async function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<Token | OtpStep>("/api/v1/parent/auth/login", {
        email: String(f.get("email")).trim(),
        password: String(f.get("password")),
      });
      if ("otp_required" in res && res.otp_required) setOtp(res);
      else finish(res as Token);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\D/g, "");
    if (code.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      finish(await api.post<Token>("/api/v1/parent/auth/verify-otp", { challenge: otp!.challenge, code }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const alert = error ? (
    <p className="micro" role="alert" style={{ color: "#b3261e", fontWeight: 700 }}>
      {error}
    </p>
  ) : null;

  if (otp) {
    return (
      <form onSubmit={verify}>
        <div className="symbol-circle">06</div>
        <h1>Check your messages</h1>
        <p className="lead">{`Enter the 6-digit code we sent by ${otp.sent_via}.`}</p>
        <label className="field">
          Verification code
          <input name="code" className="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" autoFocus required />
        </label>
        {alert}
        <button className="action" type="submit" disabled={busy}>
          {busy ? "Verifying…" : "Verify & continue"}
        </button>
        <button
          className="action secondary"
          type="button"
          onClick={() => {
            setOtp(null);
            setError(null);
          }}
        >
          Sign in again to get a new code
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={signIn}>
      <div className="brand-label">BrightCampus</div>
      <h1>Welcome back.</h1>
      <p className="lead">Sign in with the email address registered with your child’s school.</p>
      <label className="field">
        Email address
        <input type="email" name="email" autoComplete="username" placeholder="you@example.com" required />
      </label>
      <label className="field">
        Password
        <input type="password" name="password" autoComplete="current-password" placeholder="Your password" required />
      </label>
      {alert}
      <button className="action" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <a className="action secondary" href="/welcome/forgot-password?role=parent" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
        Forgot your password?
      </a>
      <p className="micro">The school gives parents their sign-in. If you don’t have one, contact the school office.</p>
    </form>
  );
}
