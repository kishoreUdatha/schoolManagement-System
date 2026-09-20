"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { PasswordFields, passwordsOk } from "@/components/account/PasswordFields";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorBox, NoticeBox } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";

export default function ChangePasswordPage() {
  const router = useRouter();
  // localStorage is not there during rendering on the server, so the check
  // waits for the browser rather than guessing and flashing the wrong thing.
  const [ready, setReady] = useState(false);

  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!auth.getToken()) {
      router.replace("/workspace");
      return;
    }
    setReady(true);
  }, [router]);

  const canSubmit = current !== "" && passwordsOk(password, confirm);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/api/v1/account/change-password", {
        current_password: current,
        new_password: password,
      });
      setDone(true);
      setCurrent("");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardBody className="space-y-5">
          <div>
            <h1 className="text-[28px] font-extrabold leading-tight tracking-[-1px] text-ink">
              Change your password
            </h1>
            <p className="mt-1 text-[13px] text-ink-muted">
              Pick something only you know. If somebody else set the one you are
              using now, this is the moment to replace it.
            </p>
          </div>

          <ErrorBox>{error}</ErrorBox>
          {done && (
            <NoticeBox>
              Your password has been changed. Use the new one from now on.
            </NoticeBox>
          )}

          <form onSubmit={submit} className="space-y-4">
            <Input
              label="Current password"
              name="current_password"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              disabled={loading}
              required
            />
            <PasswordFields
              value={password}
              confirm={confirm}
              onValue={setPassword}
              onConfirm={setConfirm}
              disabled={loading}
            />
            <Button type="submit" loading={loading} disabled={!canSubmit} className="w-full">
              Change my password
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
