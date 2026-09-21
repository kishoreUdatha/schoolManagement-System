"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, WarnBox } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type Policy = {
  min_password_length: number;
  require_mixed_case: boolean;
  require_number: boolean;
  require_symbol: boolean;
  password_expiry_days: number | null;
  max_failed_attempts: number | null;
  lockout_minutes: number | null;
  session_timeout_minutes: number | null;
  require_2fa_for: string;
  rules: string[];
};

const SCOPES = [
  { value: "nobody", label: "Nobody" },
  { value: "parents", label: "Parents only" },
  { value: "staff", label: "Staff only" },
  { value: "everybody", label: "Everybody" },
];

/** The rules a password has to meet, and who needs a code as well.
 *
 *  Every switch here is read by something that enforces it — the same
 *  validator runs on a password change and on a reset — so this screen
 *  cannot describe a school as protected while nothing checks.
 */
export default function SecuritySettingsPage() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [draft, setDraft] = useState<Partial<Policy>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Policy>("/api/v1/school/settings/security")
      .then((r) => {
        setPolicy(r.data);
        setDraft(r.data);
      })
      .catch((e) => setError(apiError(e)));
  }, []);

  const set = <K extends keyof Policy>(key: K, value: Policy[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const num = (v: string): number | null => (v === "" ? null : Number(v));

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const r = await api.put<Policy>("/api/v1/school/settings/security", draft);
      setPolicy(r.data);
      setDraft(r.data);
      setSaved("Saved. This applies to the next password anybody sets or resets.");
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const twoFactor = draft.require_2fa_for ?? "nobody";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security"
        subtitle="What a password has to look like, and who has to prove who they are twice."
        actions={
          <Button onClick={save} loading={busy} disabled={!policy}>
            Save
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      {/* What is saved, not what is in the draft: the strip has to describe
          the school as it is currently protected. */}
      <StatStrip
        stats={[
          {
            label: "Minimum length",
            value: policy?.min_password_length ?? "—",
            note: "Characters",
          },
          {
            label: "Rules in force",
            value: policy ? policy.rules.length : "—",
            note: "Checked on every password set",
          },
          {
            label: "Second factor",
            value: SCOPES.find((s) => s.value === policy?.require_2fa_for)?.label ?? "—",
            note: policy?.require_2fa_for === "nobody" ? "Password alone" : "Password and a code",
            icon: policy?.require_2fa_for === "nobody" ? undefined : ShieldCheck,
          },
          {
            label: "Session timeout",
            value: policy?.session_timeout_minutes
              ? `${policy.session_timeout_minutes} min`
              : "None",
            note: "Idle before signing out",
          },
        ]}
      />

      {policy && (
        <NoticeBox>
          A password must have {policy.rules.join(", ")}. That is what somebody is told
          when they choose one that does not.
        </NoticeBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Passwords</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Input
            label="Minimum length"
            type="number"
            min={8}
            max={64}
            hint="Eight is the floor. A shorter minimum is refused rather than stored."
            value={draft.min_password_length ?? 8}
            onChange={(e) => set("min_password_length", Number(e.target.value))}
          />
          <div className="space-y-2">
            {([
              ["require_mixed_case", "An upper and a lower case letter"],
              ["require_number", "A number"],
              ["require_symbol", "A symbol"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={Boolean(draft[key])}
                  onChange={(e) => set(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
          <Input
            label="Expire passwords after (days)"
            type="number"
            min={0}
            max={3650}
            hint="Leave blank for no expiry."
            value={draft.password_expiry_days ?? ""}
            onChange={(e) => set("password_expiry_days", num(e.target.value))}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Signing in</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Select
            label="Require a code as well as a password"
            value={twoFactor}
            onChange={(e) => set("require_2fa_for", e.target.value)}
          >
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>

          {twoFactor !== "nobody" && (
            <WarnBox>
              There is no email or text gateway wired into this deployment, so a code is
              delivered to the person&apos;s notices inside the app. Anybody who cannot
              already sign in cannot read it — check that before switching this on for a
              group who sign in from home.
            </WarnBox>
          )}

          <Input
            label="Lock an account after this many failed attempts"
            type="number"
            min={0}
            max={100}
            hint="Leave blank for no lockout."
            value={draft.max_failed_attempts ?? ""}
            onChange={(e) => set("max_failed_attempts", num(e.target.value))}
          />
          <Input
            label="Lockout lasts (minutes)"
            type="number"
            min={0}
            max={1440}
            value={draft.lockout_minutes ?? ""}
            onChange={(e) => set("lockout_minutes", num(e.target.value))}
          />
          <Input
            label="Sign people out after (minutes idle)"
            type="number"
            min={0}
            max={10080}
            hint="Leave blank to let sessions run to their token's own expiry."
            value={draft.session_timeout_minutes ?? ""}
            onChange={(e) => set("session_timeout_minutes", num(e.target.value))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
