"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

/** Changing the password the office handed over.
 *
 *  The confirm box is checked here and never sent — the API only wants the
 *  old password and the new one. It exists so a typo in something you cannot
 *  read back does not lock you out of your own account.
 */
export default function StudentPasswordPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (next !== confirm) {
      setError("The two new passwords are not the same. Please type them again.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/api/v1/student/auth/change-password", {
        current_password: current,
        new_password: next,
      });
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your password"
        subtitle="Change the password the office gave you to one you will remember."
      />

      <ErrorBox>{error}</ErrorBox>
      {done && (
        <NoticeBox>
          Your password is changed. Remember it — you will need it the next time you
          sign in.
        </NoticeBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Change it</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={submit} className="max-w-sm space-y-4">
            <label className="block text-[12px] font-bold text-ink-muted">
              <span className="mb-1 block">Your password now</span>
              <Input
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <label className="block text-[12px] font-bold text-ink-muted">
              <span className="mb-1 block">New password</span>
              <Input
                type="password"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                hint="At least eight characters."
                required
              />
            </label>
            <label className="block text-[12px] font-bold text-ink-muted">
              <span className="mb-1 block">New password again</span>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                error={mismatch ? "These two do not match yet." : undefined}
                required
              />
            </label>
            <Button type="submit" loading={loading} disabled={mismatch}>
              Save my new password
            </Button>
          </form>
        </CardBody>
      </Card>

      <p className="text-[12px] text-ink-subtle">
        The school office cannot look your password up — they can only give you a new
        one. So pick something you will remember, and do not share it with anyone.
      </p>
    </div>
  );
}
