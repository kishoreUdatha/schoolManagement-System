"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
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
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand-700">SMS · Teacher portal</h1>
          <p className="mt-1 text-sm text-slate-500">
            Sign in to mark attendance, post homework, and more.
          </p>
        </div>
        <Card>
          <CardBody>
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
                <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </div>
              )}
              <Button type="submit" loading={loading} className="w-full">
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardBody>
        </Card>
        <p className="mt-4 text-center text-xs text-slate-500">
          Lost your password? Ask your school admin to reset it from the Staff page.
        </p>
      </div>
    </main>
  );
}
