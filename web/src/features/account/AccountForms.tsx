"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { api, errorText } from "@/lib/api";
import { routeOf } from "@/lib/screens";
import { HOME_SCREEN, PORTAL, ROLE_LABEL, session, type Role, type SessionUser } from "@/lib/session";
import { useHydrated, useSession } from "@/lib/useSession";

const ROLES = Object.keys(PORTAL) as Role[];

/** The one rule every school shares (the API's floor); a school may add more,
 *  and the server's refusal then names what is missing. */
const MIN_LENGTH = 8;
const HINT = `Use at least ${MIN_LENGTH} characters. If your school asks for more, we will say what is missing.`;

function roleFrom(v: string | null): Role | null {
  return ROLES.includes(v as Role) ? (v as Role) : null;
}

function Alert({ tone = "warn", children }: { tone?: "warn" | "ok"; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className={`tip ${tone === "warn" ? "warn" : ""}`} role={tone === "warn" ? "alert" : "status"}>
      <Icon name={tone === "warn" ? "bell" : "check"} className="sm" />
      <span>{children}</span>
    </div>
  );
}

function PasswordPair({ disabled }: { disabled?: boolean }) {
  return (
    <>
      <label className="field">
        <span>
          New password
          <span className="req">*</span>
        </span>
        <input type="password" name="new_password" aria-label="New password" required minLength={MIN_LENGTH} maxLength={128} placeholder="Enter new password" autoComplete="new-password" disabled={disabled} />
      </label>
      <label className="field">
        <span>
          Confirm password
          <span className="req">*</span>
        </span>
        <input type="password" name="confirm_password" aria-label="Confirm password" required minLength={MIN_LENGTH} maxLength={128} placeholder="Enter confirm password" autoComplete="new-password" disabled={disabled} />
      </label>
      <p className="small muted" style={{ fontSize: "10px", marginBottom: "15px" }}>
        {HINT}
      </p>
    </>
  );
}

/** New password and its confirmation, or the reason they cannot be sent. */
function readPasswords(f: FormData): { password: string } | { problem: string } {
  const password = String(f.get("new_password") ?? "");
  const confirm = String(f.get("confirm_password") ?? "");
  if (password.length < MIN_LENGTH) return { problem: `The new password needs at least ${MIN_LENGTH} characters.` };
  if (password !== confirm) return { problem: "The two passwords are not the same." };
  return { password };
}

/** The workspace line above the auth forms, keeping the role picked on SCR-002. */
export function AuthTop() {
  const role = roleFrom(useSearchParams().get("role"));
  return (
    <div className="auth-top">
      {`${role ? ROLE_LABEL[role] : "School"} workspace `}
      <Link href={routeOf(2)}>Change workspace</Link>
    </div>
  );
}

/**
 * SCR-004, live: POST /api/v1/account/forgot-password. The server answers
 * the same way whether or not the address has an account, so its message is
 * shown as sent. ?role= (from the sign-in link) narrows the search.
 */
export function ForgotPasswordForm() {
  const search = useSearchParams();
  const role = roleFrom(search.get("role"));
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  // Students sign in with an admission number, so there is no address to send to.
  const student = role === "student";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ sent?: boolean; message: string }>("/api/v1/account/forgot-password", {
        email: email.trim(),
        ...(role ? { role } : {}),
      });
      setSent(res.message);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const signIn = `${routeOf(3)}${role ? `?role=${role}` : ""}`;
  const reset = `${routeOf(5)}?${new URLSearchParams({ ...(email.trim() ? { email: email.trim() } : {}), ...(role ? { role } : {}) })}`;

  if (student) {
    return (
      <div className="auth-form">
        <h1>Forgot your password?</h1>
        <p>Students sign in with an admission number, so there is no email to send a reset code to. Ask your class teacher or the school office to set a new password for you.</p>
        <div className="auth-note">
          <Link href={signIn}>Back to sign in</Link>
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="auth-form">
        <h1>Check your inbox</h1>
        <Alert tone="ok">{sent}</Alert>
        <p className="small muted">If nothing arrives, that address may not have an account here. The school office can check, and can set a new password for you.</p>
        <Link href={reset} className="btn primary">
          I have a code
          <Icon name="arrow" className="sm" />
        </Link>
        <div className="auth-note">
          <Link href={signIn}>Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <h1>Forgot your password?</h1>
      <p>Enter your registered email address. We’ll send you a code for setting a new password.</p>
      <label className="field">
        <span>
          Email address
          <span className="req">*</span>
        </span>
        <input type="email" placeholder="Enter email address" name="email" aria-label="Email address" required minLength={3} maxLength={255} autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <Alert>{error}</Alert>
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send reset link"}
        <Icon name="arrow" className="sm" />
      </button>
      <div className="auth-note">
        {"Already have a code? "}
        <Link href={reset}>Set a new password</Link>
      </div>
      <div className="auth-note">
        <Link href={signIn}>Back to sign in</Link>
      </div>
    </form>
  );
}

/**
 * SCR-005, live: POST /api/v1/account/reset-password with the email, the
 * code from the email and the new password. A link from the email fills in
 * ?email= and ?token=.
 */
export function ResetPasswordForm() {
  const search = useSearchParams();
  const role = roleFrom(search.get("role"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const signIn = `${routeOf(3)}${role ? `?role=${role}` : ""}`;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pw = readPasswords(f);
    if ("problem" in pw) {
      setError(pw.problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/account/reset-password", {
        email: String(f.get("email") ?? "").trim(),
        token: String(f.get("token") ?? "").trim(),
        new_password: pw.password,
      });
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="auth-form">
        <h1>Password changed</h1>
        <Alert tone="ok">Your password has been changed. You can sign in with it now.</Alert>
        <Link href={signIn} className="btn primary">
          Go and sign in
          <Icon name="arrow" className="sm" />
        </Link>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <h1>Create a new password</h1>
      <p>Use the code from the email. It stops working after a while, and once it has been used.</p>
      <label className="field">
        <span>
          Email address
          <span className="req">*</span>
        </span>
        <input type="email" name="email" aria-label="Email address" required minLength={3} maxLength={255} placeholder="Enter email address" autoComplete="username" defaultValue={search.get("email") ?? ""} />
      </label>
      <label className="field">
        <span>
          Code from the email
          <span className="req">*</span>
        </span>
        <input type="text" name="token" aria-label="Code from the email" required minLength={8} maxLength={200} placeholder="Enter the code" autoComplete="one-time-code" defaultValue={search.get("token") ?? ""} />
      </label>
      <PasswordPair disabled={busy} />
      <Alert>{error}</Alert>
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Reset password"}
        <Icon name="arrow" className="sm" />
      </button>
      <div className="auth-note">
        {"No code, or it has expired? "}
        <Link href={`${routeOf(4)}${role ? `?role=${role}` : ""}`}>Ask for another</Link>
      </div>
    </form>
  );
}

/**
 * SCR-007, live: POST /api/v1/account/change-password. This is the change
 * every role's sign-in forces when somebody else set the password; it is the
 * endpoint that clears must_change_password (the portals' own
 * auth/change-password routes do not), so it is used for every role.
 */
export function ChangePasswordForm() {
  const router = useRouter();
  // The phone apps send people here on first sign-in and ask to be returned (?next=/teacher/today).
  const next = useSearchParams().get("next");
  const sess = useSession();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && !sess) router.replace(`${routeOf(3)}?next=${encodeURIComponent(routeOf(7))}`);
  }, [hydrated, sess, router]);

  if (!hydrated || !sess) {
    return (
      <div className="auth-form">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  const forced = Boolean(sess.user.must_change_password);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pw = readPasswords(f);
    if ("problem" in pw) {
      setError(pw.problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/account/change-password", {
        current_password: String(f.get("current_password") ?? ""),
        new_password: pw.password,
      });
      const now = session.get();
      if (now) session.set({ ...now, user: { ...now.user, must_change_password: false } as SessionUser });
      router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : `${routeOf(HOME_SCREEN[sess!.user.role])}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <h1>{forced ? "Make your account yours" : "Change your password"}</h1>
      <p>
        {forced
          ? `Somebody else set your password, ${sess.user.full_name}. Set a new one to continue to your ${ROLE_LABEL[sess.user.role]} workspace.`
          : `Set a new password for ${sess.user.email ?? sess.user.full_name}.`}
      </p>
      <label className="field">
        <span>
          Current password
          <span className="req">*</span>
        </span>
        <input type="password" name="current_password" aria-label="Current password" required placeholder="Enter current password" autoComplete="current-password" disabled={busy} />
      </label>
      <PasswordPair disabled={busy} />
      <Alert>{error}</Alert>
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Set password"}
        <Icon name="arrow" className="sm" />
      </button>
    </form>
  );
}

type Token = { access_token: string; refresh_token: string; user: SessionUser; requires_password_change?: boolean };

/**
 * SCR-006, live: POST /api/v1/parent/auth/verify-otp. Only parent sign-in
 * has a second step. Sign-in normally asks for the code in place; this page
 * takes the challenge as ?challenge= (&via=, &next=) when sent here.
 */
export function OtpForm() {
  const router = useRouter();
  const search = useSearchParams();
  const challenge = search.get("challenge");
  const via = search.get("via");
  const next = search.get("next");
  const digits = useRef<(HTMLInputElement | null)[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const signIn = `${routeOf(3)}?role=parent`;

  if (!challenge) {
    return (
      <div className="auth-form">
        <h1>Check your verification code</h1>
        <p>A verification code is sent when a parent signs in and the school asks for a second step. Sign in first, and we will ask for the code there.</p>
        <Link href={signIn} className="btn primary">
          <Icon name="arrow" className="sm" />
          Back to sign in
        </Link>
      </div>
    );
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
      const t = await api.post<Token>("/api/v1/parent/auth/verify-otp", { challenge, code });
      session.set({ access: t.access_token, refresh: t.refresh_token, user: t.user });
      if (t.requires_password_change || t.user.must_change_password) router.push(routeOf(7));
      else router.push(next && next.startsWith("/") ? next : routeOf(HOME_SCREEN[t.user.role] ?? 37));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={verify}>
      <h1>Check your verification code</h1>
      <p>{`Enter the 6-digit code we sent${via ? ` by ${via}` : ""}.`}</p>
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
      <Alert>{error}</Alert>
      <button type="submit" className="btn primary" disabled={busy}>
        <Icon name="check" className="sm" />
        {busy ? "Verifying…" : "Verify code"}
      </button>
      <p className="auth-note">
        {"Didn’t get the code? "}
        {/* Not wired: resend — no endpoint; signing in again issues a new code. */}
        <Link href={signIn}>Sign in again for a new code</Link>
      </p>
    </form>
  );
}

const REASONS: Record<string, { title: string; body: string; icon: "clock" | "shield" }> = {
  expired: {
    title: "Your session has expired",
    body: "You were away for a while, so we signed you out to keep the account safe. Sign in again to pick up where you left off.",
    icon: "clock",
  },
  forbidden: {
    title: "That page belongs to a different account",
    body: "This part of the system is for another kind of account. If you think you should see it, the school office can check what your account is set up for.",
    icon: "shield",
  },
};

/**
 * SCR-008. No API: says why somebody landed here (?reason=expired|forbidden)
 * and sends them back to sign in for the right workspace, returning to ?next=.
 */
export function AccessDenied() {
  const search = useSearchParams();
  const sess = useSession();
  const reason = REASONS[search.get("reason") ?? ""] ?? REASONS.expired;
  const role = roleFrom(search.get("role")) ?? sess?.user.role ?? null;
  const next = search.get("next");
  const q = new URLSearchParams({ ...(role ? { role } : {}), ...(next && next.startsWith("/") ? { next } : {}) }).toString();
  return (
    <div className="auth-form">
      <h1>{reason.title}</h1>
      <p>{reason.body}</p>
      <div className="auth-icon">
        <Icon name={reason.icon} />
      </div>
      <Link href={`${routeOf(3)}${q ? `?${q}` : ""}`} className="btn primary">
        <Icon name="arrow" className="sm" />
        Back to sign in
      </Link>
      <div className="gap" />
      <Link href={routeOf(2)} className="btn">
        Choose another workspace
      </Link>
    </div>
  );
}
