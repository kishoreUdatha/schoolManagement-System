"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { PasswordFields, passwordsOk } from "@/components/account/PasswordFields";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/Button";
import { ErrorBox, NoticeBox } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const search = useSearchParams();

  // A link from the email fills these in; somebody who typed the address bar
  // gets empty boxes and fills them in themselves.
  const [email, setEmail] = useState(search.get("email") ?? "");
  const [token, setToken] = useState(search.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const ready = email.trim() !== "" && token.trim() !== "" && passwordsOk(password, confirm);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/v1/account/reset-password", {
        email: email.trim(),
        token: token.trim(),
        new_password: password,
      });
      setDone(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Use the code from the email. It stops working after a while, and after it has been used once."
      headline={"A new password.\nA fresh start."}
      blurb="Choose something only you know, then sign back in and carry on."
      topRight={
        <>
          Got it already?{" "}
          <Link href="/workspace" className="font-bold text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </>
      }
      footer="Need help? Contact your school administrator."
    >
      <div className="space-y-5">
        <ErrorBox>{error}</ErrorBox>

        {done ? (
          <div className="space-y-4">
            <NoticeBox>
              Your password has been changed. You can sign in with it now.
            </NoticeBox>
            <Link href="/workspace">
              <Button className="w-full">Go and sign in</Button>
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={submit} className="space-y-4">
              <Input
                label="Email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
              <Input
                label="Code from the email"
                name="token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoComplete="one-time-code"
                required
              />
              <PasswordFields
                value={password}
                confirm={confirm}
                onValue={setPassword}
                onConfirm={setConfirm}
                disabled={loading}
              />
              <Button type="submit" loading={loading} disabled={!ready} className="w-full">
                Change my password
              </Button>
            </form>

            <p className="text-[12px] text-ink-subtle">
              No code, or it has expired?{" "}
              <Link
                href="/account/forgot-password"
                className="font-bold text-brand-600 hover:underline"
              >
                Ask for another
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </AuthShell>
  );
}
