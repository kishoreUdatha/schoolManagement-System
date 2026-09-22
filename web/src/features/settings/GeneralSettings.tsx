"use client";

import { useState, type FormEvent } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field } from "@/features/setup/bits";
import type { Integration, SecurityPolicy, TwoFactorScope } from "./types";

export const PROFILE = "/api/v1/school/profile";
export const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAY_LABEL: Record<string, string> = { MON: "Mon", TUE: "Tue", WED: "Wed", THU: "Thu", FRI: "Fri", SAT: "Sat", SUN: "Sun" };

/** Working-day ticks; the API stores them as "MON,TUE,…". */
export function WorkingDays({ value }: { value: string }) {
  const on = new Set(value.split(",").map((d) => d.trim()));
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
      {DAYS.map((d) => (
        <label key={d} className="row" style={{ gap: 4 }}>
          <input type="checkbox" name="working_days" value={d} defaultChecked={on.has(d)} />
          {DAY_LABEL[d]}
        </label>
      ))}
    </div>
  );
}

/** Ticked working days in week order, or null when none are ticked. */
export function readDays(f: FormData): string | null {
  const picked = new Set(f.getAll("working_days").map(String));
  const days = DAYS.filter((d) => picked.has(d));
  return days.length ? days.join(",") : null;
}

const INTEGRATION_ICON: Record<string, IconName> = { razorpay: "money", storage: "folder", notifications: "message" };

/**
 * SCR-292, live: GET /integrations lists the outside services the backend
 * knows about and whether each is on and set up. Configuration itself lives
 * on each service's own screen; there is no generic configure endpoint.
 */
export function IntegrationSettings() {
  const list = useApi<Integration[]>("/api/v1/school/integrations");
  return (
    <div>
      <div>
        <Panel title="Connected services" sub="What the school is connected to, as the server reports it">
          <ErrorNote>{list.error}</ErrorNote>
          {list.loading && !list.data ? <p className="muted">Loading…</p> : null}
          {list.data?.map((x) => {
            const state = x.enabled && x.configured ? "Connected" : x.enabled ? "Needs setup" : "Not connected";
            return (
              <div className="integration-row" key={x.key}>
                <div className="integration-logo">
                  <Icon name={INTEGRATION_ICON[x.key] ?? "settings"} />
                </div>
                <div style={{ flex: "1" }}>
                  <h3>{x.name}</h3>
                  <p>{x.detail ? `${x.purpose} · ${x.detail}` : x.purpose}</p>
                </div>
                <span className={`badge ${state === "Connected" ? "" : state === "Needs setup" ? "warn" : "neutral"}`}>{state}</span>
                {/* Not wired: Configure — only some services have their own settings endpoint (x.write); there is no generic one */}
              </div>
            );
          })}
          {list.data && !list.data.length ? <p className="muted">No outside services are known to the server.</p> : null}
        </Panel>
      </div>
    </div>
  );
}

const SCOPES: [TwoFactorScope, string][] = [
  ["nobody", "Nobody"],
  ["parents", "Parents"],
  ["staff", "Staff"],
  ["everybody", "Everybody"],
];

/**
 * SCR-293, live: GET/PUT /settings/security. The server enforces the policy
 * when a password is changed or reset, and reports the rules in force.
 * Blank number fields mean "no limit".
 */
export function SecuritySettings() {
  const policy = useApi<SecurityPolicy>("/api/v1/school/settings/security");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (policy.loading && !policy.data) return <Loading what="Loading the security policy…" />;
  const p = policy.data;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const num = (k: string) => {
      const v = String(f.get(k) ?? "").trim();
      return v === "" ? null : Number(v);
    };
    setSaving(true);
    setError(null);
    try {
      await api.put("/api/v1/school/settings/security", {
        min_password_length: num("min_password_length") ?? 8,
        require_mixed_case: f.get("require_mixed_case") === "on",
        require_number: f.get("require_number") === "on",
        require_symbol: f.get("require_symbol") === "on",
        password_expiry_days: num("password_expiry_days"),
        max_failed_attempts: num("max_failed_attempts"),
        lockout_minutes: num("lockout_minutes"),
        session_timeout_minutes: num("session_timeout_minutes"),
        require_2fa_for: String(f.get("require_2fa_for") ?? "nobody"),
      });
      notify("Security policy saved.");
      await policy.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div>
        <form id="security-form" key={JSON.stringify(p)} className="panel" onSubmit={submit}>
          <div className="panel-head">
            <div>
              <h2>{"Password & session rules"}</h2>
              <p>Applies to everyone in this school · Changes apply after saving</p>
            </div>
          </div>
          <div className="panel-body">
            <ErrorNote>{error ?? policy.error}</ErrorNote>
            {p ? (
              <>
                <div className="form-grid">
                  <Field label="Minimum password length" required>
                    <input type="number" name="min_password_length" required min={8} max={64} defaultValue={p.min_password_length} />
                  </Field>
                  <Field label="Password expiry (days)">
                    <input type="number" name="password_expiry_days" min={0} max={3650} defaultValue={p.password_expiry_days ?? ""} placeholder="Never" />
                  </Field>
                  <Field label="MFA requirement">
                    <select name="require_2fa_for" defaultValue={p.require_2fa_for}>
                      {SCOPES.map(([v, t]) => (
                        <option key={v} value={v}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Session timeout (minutes idle)">
                    <input type="number" name="session_timeout_minutes" min={0} max={10080} defaultValue={p.session_timeout_minutes ?? ""} placeholder="Token expiry" />
                  </Field>
                  <Field label="Maximum failed attempts">
                    <input type="number" name="max_failed_attempts" min={0} max={100} defaultValue={p.max_failed_attempts ?? ""} placeholder="No lockout" />
                  </Field>
                  <Field label="Lockout duration (minutes)">
                    <input type="number" name="lockout_minutes" min={0} max={1440} defaultValue={p.lockout_minutes ?? ""} placeholder="—" />
                  </Field>
                  <Field label="Password must contain" full>
                    <div className="row" style={{ flexWrap: "wrap", gap: 14 }}>
                      <label className="row" style={{ gap: 4 }}>
                        <input type="checkbox" name="require_mixed_case" defaultChecked={p.require_mixed_case} /> Upper and lower case
                      </label>
                      <label className="row" style={{ gap: 4 }}>
                        <input type="checkbox" name="require_number" defaultChecked={p.require_number} /> A number
                      </label>
                      <label className="row" style={{ gap: 4 }}>
                        <input type="checkbox" name="require_symbol" defaultChecked={p.require_symbol} /> A symbol
                      </label>
                    </div>
                  </Field>
                </div>
                <div className="gap" />
                <div className="tip">
                  <Icon name="shield" className="sm" />
                  <span>{`In force now: ${p.rules.join(", ") || "no extra rules"}. ${
                    p.require_2fa_for !== "nobody" ? "Sign-in codes are delivered to the person's in-app notices, as no email or text gateway is connected." : ""
                  }`}</span>
                </div>
              </>
            ) : null}
          </div>
          <div className="form-footer">
            <span>Checked whenever a password is changed or reset</span>
            <button type="submit" className="btn primary" disabled={saving || !p}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save policy"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
