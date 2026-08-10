"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

export default function ChangePasswordPage() {
  const router = useRouter();
  const search = useSearchParams();
  const isFirstLogin = search.get("first") === "1";

  const [current, setCurrent] = useState("");
  const [next1, setNext1] = useState("");
  const [next2, setNext2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (next1 !== next2) {
      setError("New password fields don't match.");
      return;
    }
    if (next1.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/teacher/auth/change-password", {
        current_password: current,
        new_password: next1,
      });
      setSuccess(true);
      setTimeout(() => router.push("/teacher"), 800);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      {isFirstLogin && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This is your first sign-in. Please pick a new password before continuing.
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={submit} className="space-y-4">
            <Input
              label="Current password *"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Input
              label="New password *"
              type="password"
              value={next1}
              onChange={(e) => setNext1(e.target.value)}
              autoComplete="new-password"
              required
              hint="At least 8 characters."
            />
            <Input
              label="Confirm new password *"
              type="password"
              value={next2}
              onChange={(e) => setNext2(e.target.value)}
              autoComplete="new-password"
              required
            />
            {error && (
              <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
            )}
            {success && (
              <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Updated. Redirecting…
              </div>
            )}
            <Button type="submit" loading={submitting} className="w-full">
              Save new password
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
