"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";

export default function SuperAdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <SuperAdminLoginForm />
    </Suspense>
  );
}

function SuperAdminLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/super-admin";

  const [email, setEmail] = useState("admin@sms.local");
  const [password, setPassword] = useState("ChangeMe123!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/api/v1/super-admin/auth/login", {
        email,
        password,
      });
      if (data.user.role !== "super_admin") {
        throw new Error("This account is not a super admin.");
      }
      auth.setSession(data.access_token, data.refresh_token, data.user);
      router.push(next);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Platform-level access. Sign in to manage tenants and plans."
      headline={"Every school.\nOne platform."}
      blurb="Tenants, plans and the machinery the schools run on."
      topRight={
        <>
          Platform console{" "}
          <Link href="/workspace" className="font-bold text-brand-600 hover:underline">
            Change workspace
          </Link>
        </>
      }
      footer={
        <>
          Dev default: <code>admin@sms.local</code> / <code>ChangeMe123!</code>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
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
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
            {error}
          </div>
        )}
        <Button type="submit" loading={loading} className="w-full">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthShell>
  );
}
