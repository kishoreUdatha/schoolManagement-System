"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, errorText } from "@/lib/api";
import { parentRoute } from "@/lib/parentScreens";
import { routeOf } from "@/lib/screens";
import { ActionLink } from "../home/parts";
import { finishSignIn, LOGIN_PATH, savePending, type OtpStep, type Token } from "./auth";

/** PM-002. Email + password; the server may ask for an OTP next (PM-003). */
export function ParentSignIn() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next");
  const expired = search.get("expired") === "1";
  const [error, setError] = useState<string | null>(expired ? "Your session ended. Please sign in again." : null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<Token | OtpStep>(LOGIN_PATH, { email, password: String(f.get("password") ?? "") });
      if ("otp_required" in res && res.otp_required) {
        savePending({ challenge: res.challenge, sent_via: res.sent_via, email, next });
        router.push(parentRoute(3));
      } else {
        router.push(finishSignIn(res as Token, next, routeOf(7)));
      }
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="brand-label">BrightCampus</div>
      <h1>Welcome back.</h1>
      <p className="lead">Use the email address and password registered with your child’s school.</p>
      <label className="field">
        Email address
        <input type="email" name="email" placeholder="you@example.com" required autoComplete="username" />
      </label>
      <label className="field">
        Password
        <input type="password" name="password" placeholder="Your password" required autoComplete="current-password" />
      </label>
      {error ? (
        <p className="micro bad" role="alert">
          {error}
        </p>
      ) : null}
      <button className="action" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <ActionLink secondary href={`${routeOf(4)}?role=parent`}>
        Forgot your password?
      </ActionLink>
      <p className="micro">If your school uses two-step sign-in, we will ask for a verification code next.</p>
    </form>
  );
}
