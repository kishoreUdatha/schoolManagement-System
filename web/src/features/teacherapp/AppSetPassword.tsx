"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { api, errorText } from "@/lib/api";
import { session, type SessionUser } from "@/lib/session";
import { useHydrated, useSession } from "@/lib/useSession";

/** Only a page of the phone apps to go on to. */
const appNext = (n: string | null) => (n && /^\/(teacher|parent|student)\//.test(n) && !n.startsWith("//") ? n : null);

/**
 * First sign-in on the phone apps: a teacher or parent whose password the
 * school set chooses their own before going on (?next= the app page). The
 * same POST /api/v1/account/change-password as the workspace's SCR-007, in
 * the app's own frame, so nobody lands on the desktop workspace from the app.
 */
export function AppSetPassword() {
  const router = useRouter();
  const next = appNext(useSearchParams().get("next"));
  const sess = useSession();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && !sess) router.replace("/app");
  }, [hydrated, sess, router]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("new_password") ?? "");
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== String(f.get("confirm_password") ?? "")) return setError("The two new passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/account/change-password", { current_password: String(f.get("current_password") ?? ""), new_password: password });
      const now = session.get();
      if (now) session.set({ ...now, user: { ...now.user, must_change_password: false } as SessionUser });
      router.replace(next ?? "/app");
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <div className="pm">
      <div className="phone no-nav">
        <div className="scroll-body">
          <div className="brand-label">BrightCampus</div>
          <h1>Choose your password</h1>
          <p className="lead">
            {sess ? `The school set your password, ${sess.user.full_name.split(" ")[0]}. Choose your own to continue.` : "Choose your own password to continue."}
          </p>
          <form onSubmit={submit}>
            <label className="field">
              Password from the school
              <input type="password" name="current_password" required autoComplete="current-password" />
            </label>
            <label className="field">
              New password (at least 8 characters)
              <input type="password" name="new_password" required minLength={8} maxLength={128} autoComplete="new-password" />
            </label>
            <label className="field">
              New password again
              <input type="password" name="confirm_password" required minLength={8} maxLength={128} autoComplete="new-password" />
            </label>
            {error ? (
              <p className="micro bad" role="alert">
                {error}
              </p>
            ) : null}
            <button className="action" type="submit" disabled={busy || !sess}>
              {busy ? "Saving…" : "Set password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
