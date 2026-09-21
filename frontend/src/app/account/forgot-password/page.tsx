"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/Button";
import { ErrorBox, NoticeBox, Select } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

/** The roles that sign in with an email address.
 *
 *  Students are missing on purpose: they sign in with an admission number,
 *  so there is no address to send anything to. The office resets theirs. */
const ROLES = [
  { value: "", label: "Any" },
  { value: "school_admin", label: "School office" },
  { value: "principal", label: "Principal" },
  { value: "teacher", label: "Teacher" },
  { value: "parent", label: "Parent" },
  { value: "accountant", label: "Accountant" },
];

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/api/v1/account/forgot-password", {
        email: email.trim(),
        ...(role ? { role } : {}),
      });
      // Shown verbatim. The server deliberately answers the same way whether
      // or not there is an account, and rewording it here would undo that.
      setSentMessage(data.message);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Forgotten password"
      subtitle="Tell us the address you sign in with and we will send a code for setting a new password."
      headline={"Locked out?\nNot for long."}
      blurb="A code arrives in your inbox, you choose a new password, and you are back in."
      topRight={
        <>
          Remembered it?{" "}
          <Link href="/workspace" className="font-bold text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </>
      }
      footer="Need help? Contact your school administrator."
    >
      <div className="space-y-5">
        <ErrorBox>{error}</ErrorBox>

        {sentMessage ? (
          <div className="space-y-4">
            <NoticeBox>{sentMessage}</NoticeBox>
            <p className="text-[12px] text-ink-subtle">
              If nothing arrives, that address may not have an account here. The
              school office can check, and can set a new password for you.
            </p>
            <Link href="/account/reset-password">
              <Button variant="secondary" className="w-full">
                I have a code
              </Button>
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
              <Select
                label="Kind of account (optional)"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
              <Button type="submit" loading={loading} className="w-full">
                Send me a code
              </Button>
            </form>

            <p className="text-[12px] text-ink-subtle">
              Already have a code?{" "}
              <Link
                href="/account/reset-password"
                className="font-bold text-brand-600 hover:underline"
              >
                Set a new password
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </AuthShell>
  );
}
