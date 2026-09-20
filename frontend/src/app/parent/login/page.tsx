"use client";

import Link from "next/link";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorBox, NoticeBox } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";

export default function ParentLoginPage() {
  return (
    <Suspense fallback={null}>
      <ParentLoginForm />
    </Suspense>
  );
}

/** A sign-in that may take two steps.
 *
 *  When the school requires a second factor the password step returns a
 *  challenge and no session at all, so there is nothing to store until the
 *  code has been checked. The two steps are one component because the second
 *  is useless without the first — sending somebody to a separate page would
 *  mean a challenge travelling through a URL.
 */
function ParentLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/parent";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [sentVia, setSentVia] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function land(data: { access_token: string; refresh_token: string; user: { role: string } }) {
    if (data.user.role !== "parent") {
      throw new Error("This account is not a parent.");
    }
    auth.setSession(data.access_token, data.refresh_token, data.user as never);
    router.push(next);
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/api/v1/parent/auth/login", { email, password });
      if (data.otp_required) {
        setChallenge(data.challenge);
        setSentVia(data.sent_via);
        return;
      }
      land(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/api/v1/parent/auth/verify-otp", {
        challenge,
        code: code.trim(),
      });
      land(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  function startOver() {
    setChallenge(null);
    setSentVia(null);
    setCode("");
    setPassword("");
    setError(null);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-brand-600">
            SMS · Parent portal
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            {challenge
              ? "One more step before we let you in."
              : "Sign in to see your child's attendance, homework, fees, and more."}
          </p>
        </div>

        <Card>
          <CardBody>
            {challenge ? (
              <form onSubmit={submitCode} className="space-y-4">
                <NoticeBox>
                  Your school asks for a code as well as a password. We have sent one
                  {sentVia === "in_app" ? " to your notices in the app" : " to you"}. It
                  stops working in ten minutes.
                </NoticeBox>
                <Input
                  label="Six-digit code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  autoFocus
                  required
                />
                <ErrorBox>{error}</ErrorBox>
                <Button type="submit" loading={loading} className="w-full">
                  {loading ? "Checking…" : "Sign in"}
                </Button>
                <button
                  type="button"
                  onClick={startOver}
                  className="w-full text-[12px] font-bold text-brand-600 hover:underline"
                >
                  Start again
                </button>
              </form>
            ) : (
              <form onSubmit={submitPassword} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  name="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  required
                />
                <Input
                  label="Password"
                  type="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <ErrorBox>{error}</ErrorBox>
                <Button type="submit" loading={loading} className="w-full">
                  {loading ? "Signing in…" : "Sign in"}
                </Button>
              </form>
            )}
          </CardBody>
        </Card>

        <p className="mt-4 text-center text-xs text-slate-500">
          Forgotten your password?{" "}
          <Link
            href="/account/forgot-password?role=parent"
            className="font-bold text-brand-600 hover:underline"
          >
            Get a reset link
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
