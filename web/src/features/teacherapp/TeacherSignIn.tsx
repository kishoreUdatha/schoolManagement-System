"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorText } from "@/lib/api";
import { routeOf } from "@/lib/screens";
import { session, type SessionUser } from "@/lib/session";

type Token = { access_token: string; refresh_token: string; user: SessionUser; requires_password_change?: boolean };
type OtpStep = { otp_required: true; challenge: string; sent_via: string };

const safeNext = (n: string | null) => (n && n.startsWith("/teacher/") && !n.startsWith("//") ? n : null);

/** TM-001. Email + password on the teacher portal; an OTP step when the server asks. */
export function TeacherSignIn() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState<OtpStep | null>(null);

  function finish(t: Token) {
    if (t.user.role !== "teacher") throw new Error("This is not a teacher account.");
    session.set({ access: t.access_token, refresh: t.refresh_token, user: t.user });
    if (t.requires_password_change || t.user.must_change_password) router.push(`${routeOf(7)}?next=${encodeURIComponent(safeNext(next) ?? "/teacher/today")}`);
    else router.push(safeNext(next) ?? "/teacher/today");
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<Token | OtpStep>("/api/v1/teacher/auth/login", {
        email: String(f.get("email") ?? "").trim(),
        password: String(f.get("password") ?? ""),
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
    const code = String(new FormData(e.currentTarget).get("code") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      finish(await api.post<Token>("/api/v1/teacher/auth/verify-otp", { challenge: otp!.challenge, code }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (otp) {
    return (
      <form onSubmit={verify}>
        <div className="brand-label">BrightCampus</div>
        <h1>Enter your code</h1>
        <p className="lead">{`We sent a 6-digit code by ${otp.sent_via}.`}</p>
        <label className="field">
          Code
          <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required />
        </label>
        {error ? <p className="micro bad" role="alert">{error}</p> : null}
        <button className="action" type="submit" disabled={busy}>
          {busy ? "Checking…" : "Verify and sign in"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="brand-label">BrightCampus</div>
      <h1>Teacher sign in</h1>
      <p className="lead">Use the email address and password your school gave you.</p>
      <label className="field">
        Email address
        <input type="email" name="email" placeholder="you@school.edu" required autoComplete="username" />
      </label>
      <label className="field">
        Password
        <input type="password" name="password" placeholder="Your password" required autoComplete="current-password" />
      </label>
      {error ? <p className="micro bad" role="alert">{error}</p> : null}
      <button className="action" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <Link className="action secondary" style={{ display: "block", textAlign: "center" }} href={`${routeOf(4)}?role=teacher`}>
        Forgot your password?
      </Link>
      <p className="micro">
        Not a teacher? <Link href="/app">Choose another account type</Link>.
      </p>
    </form>
  );
}
