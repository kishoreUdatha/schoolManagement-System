"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { api, errorText } from "@/lib/api";
import { routeOf } from "@/lib/screens";
import { HOME_SCREEN, PORTAL, ROLE_LABEL, session, type Role, type SessionUser } from "@/lib/session";

type Token = { access_token: string; refresh_token: string; user: SessionUser; requires_password_change?: boolean };
type OtpStep = { otp_required: true; challenge: string; sent_via: string };

const ROLES = Object.keys(PORTAL) as Role[];

/** SCR-003. The workspace picked on SCR-002 arrives as ?role=. */
export function SignInForm() {
  const router = useRouter();
  const search = useSearchParams();
  const role: Role = ROLES.includes(search.get("role") as Role) ? (search.get("role") as Role) : "school_admin";
  const next = search.get("next");
  const expired = search.get("expired") === "1";
  const student = role === "student";

  const [error, setError] = useState<string | null>(expired ? "Your session ended. Please sign in again." : null);
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState<OtpStep | null>(null);
  const digits = useRef<(HTMLInputElement | null)[]>([]);

  function finish(t: Token) {
    if (t.user.role !== role) {
      throw new Error(`This account is a ${ROLE_LABEL[t.user.role] ?? t.user.role} account. Choose that workspace to sign in.`);
    }
    session.set({ access: t.access_token, refresh: t.refresh_token, user: t.user });
    if (t.requires_password_change || t.user.must_change_password) {
      router.push(routeOf(7));
      return;
    }
    // Parents use the parent app (the Parent Mobile design); everyone else the workspace.
    const home = t.user.role === "parent" ? "/parent/home" : routeOf(HOME_SCREEN[t.user.role]);
    router.push(next && next.startsWith("/") ? next : home);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const body = student
        ? { school_code: String(f.get("school_code")).trim(), admission_no: String(f.get("admission_no")).trim(), password: String(f.get("password")) }
        : { email: String(f.get("email")).trim(), password: String(f.get("password")) };
      const res = await api.post<Token | OtpStep>(`/api/v1/${PORTAL[role]}/auth/login`, body);
      if ("otp_required" in res && res.otp_required) setOtp(res);
      else finish(res as Token);
    } catch (err) {
      // Each workspace has its own login and treats other workspaces' accounts
      // as unknown, so say which workspace this was and how to change it.
      setError(
        (err as { status?: number }).status === 401 && !student
          ? `Email or password not recognised for the ${ROLE_LABEL[role]} workspace. If you are not ${role === "school_admin" ? "a" : "the"} ${ROLE_LABEL[role]}, pick your workspace above and sign in again.`
          : errorText(err),
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    const code = digits.current.map((d) => d?.value ?? "").join("");
    if (!/^\d{6}$/.test(code)) {
      setError("Enter all 6 digits.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      finish(await api.post<Token>(`/api/v1/${PORTAL[role]}/auth/verify-otp`, { challenge: otp!.challenge, code }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const alert = error ? (
    <div className="tip warn" role="alert">
      <Icon name="bell" className="sm" />
      <span>{error}</span>
    </div>
  ) : null;

  if (otp) {
    return (
      <form className="auth-form" onSubmit={verify}>
        <h1>Check your phone</h1>
        <p>{`We sent a 6-digit code by ${otp.sent_via}. Enter it to finish signing in.`}</p>
        <div className="otp-fields">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <input
              key={i}
              ref={(el) => {
                digits.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]"
              maxLength={1}
              required
              aria-label={`Digit ${i + 1}`}
              autoFocus={i === 0}
              onChange={(e) => {
                e.target.value = e.target.value.replace(/\D/g, "").slice(0, 1);
                if (e.target.value) digits.current[i + 1]?.focus();
              }}
            />
          ))}
        </div>
        {alert}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Verifying…" : "Verify and continue"}
          <Icon name="arrow" className="sm" />
        </button>
        <button type="button" className="btn" onClick={() => setOtp(null)}>
          Back
        </button>
      </form>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <h1>Welcome back</h1>
      <p>{`Sign in to your ${ROLE_LABEL[role]} workspace.`}</p>
      <label className="field">
        <span>Workspace</span>
        <select
          value={role}
          onChange={(e) => {
            const q = new URLSearchParams(search.toString());
            q.set("role", e.target.value);
            q.delete("expired");
            setError(null);
            router.replace(`${routeOf(3)}?${q.toString()}`);
          }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      {student ? (
        <>
          <label className="field">
            <span>
              School code<span className="req">*</span>
            </span>
            <input type="text" name="school_code" placeholder="Enter school code" required autoComplete="organization" />
          </label>
          <label className="field">
            <span>
              Admission number<span className="req">*</span>
            </span>
            <input type="text" name="admission_no" placeholder="Enter admission number" required autoComplete="username" />
          </label>
        </>
      ) : (
        <label className="field">
          <span>
            Email address<span className="req">*</span>
          </span>
          <input type="email" name="email" placeholder="Enter email address" required autoComplete="username" />
        </label>
      )}
      <label className="field">
        <span>
          Password<span className="req">*</span>
        </span>
        <input type="password" name="password" placeholder="Enter password" required autoComplete="current-password" />
      </label>
      <div className="spread row small">
        <label>
          <input type="checkbox" defaultChecked />
          {" Keep me signed in"}
        </label>
        <Link href={`${routeOf(4)}?role=${role}`} className="blue">
          Forgot password?
        </Link>
      </div>
      {alert}
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
        <Icon name="arrow" className="sm" />
      </button>
    </form>
  );
}

export function WorkspaceLine() {
  const search = useSearchParams();
  const role = search.get("role") as Role | null;
  return (
    <div className="auth-top">
      {`${role && ROLE_LABEL[role] ? ROLE_LABEL[role] : "School Admin"} workspace `}
      <Link href={routeOf(2)}>Change workspace</Link>
    </div>
  );
}
