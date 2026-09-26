"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorText } from "@/lib/api";
import { parentRoute } from "@/lib/parentScreens";
import { ActionLink } from "../home/parts";
import { clearPending, finishSignIn, maskEmail, readPending, VERIFY_PATH, type Pending, type Token } from "./auth";

/** PM-003. The OTP step PM-002 hands over when the server answers `otp_required`. */
export function VerifyOtp() {
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null | undefined>(undefined);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setPending(readPending()), []);

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (!pending) return;
    if (!/^\d{6}$/.test(code)) {
      setError("Enter all 6 digits.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const t = await api.post<Token>(VERIFY_PATH, { challenge: pending.challenge, code });
      router.push(finishSignIn(t, pending.next, "/app/set-password"));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  if (pending === undefined) return null;

  if (!pending) {
    return (
      <>
        <div className="symbol-circle">06</div>
        <h1>Sign in first</h1>
        <p className="lead">There is no verification in progress. Sign in with your email and password, and we will ask for a code if your school needs one.</p>
        <ActionLink href={parentRoute(2)}>Go to sign in</ActionLink>
      </>
    );
  }

  return (
    <form onSubmit={verify}>
      <div className="symbol-circle">06</div>
      <h1>Check your messages</h1>
      <p className="lead">{`Enter the 6-digit code we sent by ${pending.sent_via} for ${maskEmail(pending.email)}.`}</p>
      <label className="field">
        Verification code
        <input
          className="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          autoFocus
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </label>
      {error ? (
        <p className="micro bad" role="alert">
          {error}
        </p>
      ) : null}
      <button className="action" type="submit" disabled={busy}>
        {busy ? "Verifying…" : "Verify & continue"}
      </button>
      {/* Not wired: "Resend code" — no resend endpoint; signing in again issues a new code. */}
      <button
        type="button"
        className="action secondary"
        onClick={() => {
          clearPending();
          router.push(parentRoute(2));
        }}
      >
        Sign in again
      </button>
      <p className="micro">Signing in again sends a new code.</p>
    </form>
  );
}
