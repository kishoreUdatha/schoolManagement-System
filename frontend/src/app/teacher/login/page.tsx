"use client";

import Link from "next/link";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";

export default function TeacherLoginPage() {
  return (
    <Suspense fallback={null}>
      <TeacherLoginForm />
    </Suspense>
  );
}

function TeacherLoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/teacher";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/api/v1/teacher/auth/login", {
        email,
        password,
      });
      if (data.user.role !== "teacher") {
        throw new Error("This account is not a teacher.");
      }
      auth.setSession(data.access_token, data.refresh_token, data.user);
      if (data.requires_password_change) {
        router.push("/teacher/change-password?first=1");
      } else {
        router.push(next);
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to mark attendance, post homework, and more."
      topRight={
        <>
          Teacher portal{" "}
          <Link href="/workspace" className="font-bold text-brand-600 hover:underline">
            Change workspace
          </Link>
        </>
      }
      footer="Lost your password? Ask your school admin to reset it from the Staff page."
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
        <div className="text-right text-[12px]">
          <Link
            href="/account/forgot-password?role=teacher"
            className="font-bold text-brand-600 hover:underline"
          >
            Forgotten your password?
          </Link>
        </div>
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
