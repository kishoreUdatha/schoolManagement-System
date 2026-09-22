"use client";

/*
 * PM-048 · App settings. Notification preferences per channel and category
 * (GET/PUT /parent/me/preferences; each switch saves at once, and the ones
 * the school keeps on are shown locked with its reason), password change
 * (POST /account/change-password) and sign out.
 */

import { useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { parentRoute } from "@/lib/parentScreens";
import { session } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { PmError, PmLoading } from "../support/pm";

type Row = { channel: string; category: string; is_enabled: boolean; locked: boolean; locked_because: string | null };
type Prefs = { rows: Row[]; locked_channels: string[]; locked_categories: string[] };

const CHANNEL_NAME: Record<string, string> = { in_app: "In-app", email: "Email", sms: "SMS", whatsapp: "WhatsApp" };

export function AppSettings() {
  const { notify } = useParent();
  const prefs = useApi<Prefs>("/api/v1/parent/me/preferences");
  const [saving, setSaving] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwBusy, setPwBusy] = useState(false);

  async function toggle(r: Row, on: boolean) {
    const key = `${r.channel}:${r.category}`;
    setSaving(key);
    setErr(null);
    try {
      await api.put("/api/v1/parent/me/preferences", { channel: r.channel, category: r.category, is_enabled: on });
      notify(`${CHANNEL_NAME[r.channel] ?? label(r.channel)} ${label(r.category).toLowerCase()} alerts ${on ? "on" : "off"}.`);
      prefs.reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setSaving(null);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (pw.next !== pw.confirm) {
      setErr("The new passwords do not match.");
      return;
    }
    setPwBusy(true);
    setErr(null);
    try {
      await api.post("/api/v1/account/change-password", { current_password: pw.current, new_password: pw.next });
      notify("Password changed.");
      setPw({ current: "", next: "", confirm: "" });
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setPwBusy(false);
    }
  }

  function signOut() {
    session.clear();
    window.location.href = parentRoute(2);
  }

  const rows = prefs.data?.rows ?? [];
  const channels = Array.from(new Set(rows.map((r) => r.channel)));

  return (
    <>
      {/* Not wired: app language and app lock — no preference for them in the API (device settings). */}
      <PmError>{err || prefs.error}</PmError>
      {prefs.loading && !prefs.data ? <PmLoading /> : null}
      {channels.map((ch) => {
        const list = rows.filter((r) => r.channel === ch);
        const allLocked = list.every((r) => r.locked);
        return (
          <section key={ch} className="section">
            <h3>{CHANNEL_NAME[ch] ?? label(ch)} notifications</h3>
            {allLocked ? (
              <p className="micro">{list[0]?.locked_because ?? "Always on."}</p>
            ) : (
              list.map((r) => (
                <label key={r.category} className="switch" title={r.locked_because ?? undefined}>
                  <span>
                    {label(r.category)} alerts
                    {r.locked ? <small className="muted"> · always on</small> : null}
                  </span>
                  <input
                    type="checkbox"
                    checked={r.is_enabled}
                    disabled={r.locked || saving === `${r.channel}:${r.category}`}
                    onChange={(e) => toggle(r, e.target.checked)}
                  />
                </label>
              ))
            )}
          </section>
        );
      })}
      {prefs.data?.locked_categories.length ? (
        <p className="micro">{prefs.data.locked_categories.map(label).join(" and ")} alerts stay on so the school can always reach you.</p>
      ) : null}

      <section className="section">
        <h3>Change password</h3>
        <form onSubmit={changePassword}>
          <label className="field">
            Current password
            <input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} required />
          </label>
          <label className="field">
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })}
              required
              minLength={8}
              maxLength={128}
            />
          </label>
          <label className="field">
            Confirm new password
            <input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required minLength={8} />
          </label>
          <button className="action" type="submit" disabled={pwBusy}>
            {pwBusy ? "Saving…" : "Change password"}
          </button>
        </form>
      </section>
      <button className="action secondary" onClick={signOut}>
        Sign out
      </button>
    </>
  );
}
