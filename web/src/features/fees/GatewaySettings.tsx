"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field } from "./common";
import { ToggleRow } from "./extra";
import type { Gateway } from "./types";

import { ask } from "@/lib/dialog";
/**
 * NEW-043, live: GET/PUT/DELETE /school/payments/gateway (Razorpay), and
 * POST /gateway/check, which asks Razorpay whether the saved keys work
 * (read-only); it runs when the page opens and from "Check connection".
 * Saving new keys is refused if Razorpay rejects them.
 * The server never returns the key secret or webhook secret, only whether
 * one is stored; the inputs for them start empty and are sent only when
 * typed, which replaces the stored value. Leaving them blank keeps it.
 */
export function GatewaySettings() {
  const gw = useApi<Gateway>("/api/v1/school/payments/gateway");
  const [keyId, setKeyId] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [hookSecret, setHookSecret] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<{ connected: boolean; message: string; checked_at: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const g = gw.data;
  async function runCheck() {
    setChecking(true);
    try {
      setCheck(await api.post("/api/v1/school/payments/gateway/check"));
    } catch (err) {
      setCheck({ connected: false, message: errorText(err), checked_at: new Date().toISOString() });
    } finally {
      setChecking(false);
    }
  }
  // check the saved keys with Razorpay whenever the page opens or they change
  const savedKey = g?.configured ? g.key_id : null;
  useEffect(() => {
    if (savedKey) void runCheck();
    else setCheck(null);
  }, [savedKey]);
  useEffect(() => {
    if (!g) return;
    setKeyId(g.key_id ?? "");
    setEnabled(g.configured ? g.is_enabled : true);
  }, [g]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.put<Gateway>("/api/v1/school/payments/gateway", {
        key_id: keyId.trim(),
        key_secret: keySecret.trim() || null,
        webhook_secret: hookSecret.trim() || null,
        is_enabled: enabled,
      });
      setKeySecret("");
      setHookSecret("");
      notify(enabled ? "Razorpay accepted the keys. Parents can pay online." : "Payment gateway saved, switched off.");
      gw.reload();
      void runCheck();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!(await ask("Remove the Razorpay keys? Parents will not be able to pay online until new keys are saved."))) return;
    setError(null);
    try {
      await api.delete("/api/v1/school/payments/gateway");
      setKeySecret("");
      setHookSecret("");
      notify("Payment gateway removed.");
      gw.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (!g) return gw.error ? <ErrorNote>{gw.error}</ErrorNote> : <Loading />;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const webhook = `${origin}${g.webhook_url_path}`;
  const local = /\/\/(localhost|127\.|0\.0\.0\.0|192\.168\.|10\.)/.test(origin);
  const status = !g.configured
    ? "Not set up"
    : !g.is_enabled
      ? "Switched off"
      : g.mode === "live"
        ? "On · live mode (real payments)"
        : "On · test mode (no real money moves)";
  const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <form id="gateway-form" className="panel" onSubmit={save} autoComplete="off">
        <div className="panel-pad">
          <ErrorNote>{error}</ErrorNote>
          {g.configured ? (
            <div className={`gateway-conn ${checking && !check ? "" : check?.connected ? "ok" : "bad"}`} role="status">
              <div>
                <strong>{checking && !check ? "Checking with Razorpay…" : check?.connected ? "Connected to Razorpay" : "Not connected"}</strong>
                <span>{[status, check ? `${check.connected ? "keys accepted" : check.message} · checked ${time(check.checked_at)}` : null].filter(Boolean).join(" · ")}</span>
              </div>
              <button type="button" className="btn sm" disabled={checking} onClick={runCheck}>
                {checking ? "Checking…" : "Check connection"}
              </button>
            </div>
          ) : g.test_mode_available ? (
            <p className="muted small" style={{ marginBottom: 14 }}>Not set up. On this development server parents get a simulated checkout until keys are saved.</p>
          ) : null}
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Razorpay keys</h3>
              </div>
              <div className="form-grid">
                <Field label="Key ID" required>
                  <input value={keyId} onChange={(e) => setKeyId(e.target.value)} required minLength={8} maxLength={64} pattern="rzp_(test|live)_\w+" title="Starts rzp_test_ or rzp_live_" placeholder="rzp_live_XXXXXXXXXXXX" spellCheck={false} />
                </Field>
                <Field label={g.configured ? "Key secret (leave blank to keep)" : "Key secret"} required={!g.configured}>
                  <input
                    type="password"
                    value={keySecret}
                    onChange={(e) => setKeySecret(e.target.value)}
                    required={!g.configured}
                    minLength={8}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder={g.configured ? "Stored · type a new one to replace it" : "From the Razorpay dashboard"}
                  />
                </Field>
              </div>
            </section>
            <section>
              <div className="form-section-title">
                <span className="number">02</span>
                <h3>Webhook</h3>
              </div>
              <div className="form-grid">
                <Field label="Webhook URL" full>
                  <input readOnly value={webhook} onFocus={(e) => e.target.select()} />
                </Field>
                <Field label={g.has_webhook_secret ? "Webhook secret (leave blank to keep)" : "Webhook secret"} full>
                  <input
                    type="password"
                    value={hookSecret}
                    onChange={(e) => setHookSecret(e.target.value)}
                    minLength={6}
                    maxLength={128}
                    autoComplete="new-password"
                    placeholder={g.has_webhook_secret ? "Stored · type a new one to replace it" : "The secret you set on the Razorpay webhook"}
                  />
                </Field>
              </div>
              {local ? (
                <div className="tip warn" style={{ marginTop: 12 }}>
                  <Icon name="bell" className="sm" />
                  <span>This site is running on a local address, which Razorpay can’t reach. The webhook works once the ERP is on its public web address; payments still complete while the parent stays on the page.</span>
                </div>
              ) : null}
              <p className="muted small" style={{ marginTop: 12 }}>
                Add the URL above as a webhook in Razorpay (events payment.captured, order.paid and payment.failed) with the same secret, so payments that finish after the parent closes the page are still recorded.
              </p>
            </section>
            <section>
              <div className="form-section-title">
                <span className="number">03</span>
                <h3>Availability</h3>
              </div>
              <ToggleRow title="Accept online payments" note="Parents see a Pay button on their fees when this is on." checked={enabled} onChange={setEnabled} />
            </section>
          </div>
        </div>
        <div className="form-footer">
          {g.configured ? (
            <button type="button" className="btn danger" onClick={remove}>
              Remove gateway
            </button>
          ) : (
            <span>Keys are stored encrypted</span>
          )}
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Save gateway"}
          </button>
        </div>
      </form>
    </div>
  );
}
