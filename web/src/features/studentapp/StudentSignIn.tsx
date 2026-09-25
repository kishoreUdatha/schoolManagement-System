"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorText } from "@/lib/api";
import { session, type SessionUser } from "@/lib/session";

type Token = { access_token: string; refresh_token: string; user: SessionUser; requires_password_change?: boolean };

const safeNext = (n: string | null) => (n && n.startsWith("/student/") && !n.startsWith("//") ? n : null);

/** SM-001. School code + admission number + the password the office gave. */
export function StudentSignIn() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const t = await api.post<Token>("/api/v1/student/auth/login", {
        school_code: String(f.get("school_code") ?? "").trim(),
        admission_no: String(f.get("admission_no") ?? "").trim(),
        password: String(f.get("password") ?? ""),
      });
      if (t.user.role !== "student") throw new Error("This is not a student account.");
      session.set({ access: t.access_token, refresh: t.refresh_token, user: t.user });
      router.push(t.requires_password_change || t.user.must_change_password ? "/student/change-password?first=1" : safeNext(next) ?? "/student/home");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="brand-label">BrightCampus</div>
      <h1>Student sign in</h1>
      <p className="lead">Use your school code, admission number and the password your school gave you.</p>
      <label className="field">
        School code
        <input name="school_code" required autoCapitalize="characters" autoComplete="organization" placeholder="e.g. DEVSCHOOL" />
      </label>
      <label className="field">
        Admission number
        <input name="admission_no" required autoCapitalize="characters" autoComplete="username" placeholder="e.g. ADM0001" />
      </label>
      <label className="field">
        Password
        <input type="password" name="password" required autoComplete="current-password" placeholder="Your password" />
      </label>
      {error ? <p className="micro bad" role="alert">{error}</p> : null}
      <button className="action" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="micro">Forgot your password? Ask your class teacher or the school office to reset it.</p>
      <p className="micro">
        Not a student? <Link href="/app">Choose another account type</Link>.
      </p>
    </form>
  );
}
