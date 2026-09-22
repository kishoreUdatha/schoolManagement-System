"use client";

/*
 * The platform's own WhatsApp and SMS, which send a new school admin their
 * username and temporary password (services/platform_messaging_service).
 *
 *   SentList            what happened on each mobile and channel
 *   SignInDetailsPanel  Organization Details: resend with a fresh password, and the log
 *   PlatformMessaging   Integrations: set up the platform's WhatsApp and SMS, test them
 */

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel, type Tone } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { ask } from "@/lib/dialog";
import { dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";

export type Sent = { channel: string; to: string; status: string; error: string | null };
type Log = { id: number; tenant_name: string | null; purpose: string; channel: string; to_number: string; status: string; error: string | null; created_at: string };
type ChannelKey = "whatsapp" | "sms";
type Channel = {
  channel: ChannelKey;
  configured: boolean;
  provider: string | null;
  sender: string | null;
  account_id: string | null;
  has_token: boolean;
  template: string | null;
  language: string;
  default_country_code: string;
  is_enabled: boolean;
  last_error: string | null;
};
type Overview = { whatsapp: Channel; sms: Channel; mock_available: boolean; web_app_url: string; sample: string };

const CH: Record<string, string> = { whatsapp: "WhatsApp", sms: "SMS" };
const STATUS: Record<string, string> = { sent: "Sent", failed: "Failed", skipped: "Not sent" };
const tone = (s: string): Tone => (s === "sent" ? "" : s === "failed" ? "bad" : "warn");

/** One line per mobile and channel. */
export function SentList({ sent }: { sent: Sent[] }) {
  if (!sent.length) return <p className="muted small">No mobile number was given, so nothing was sent.</p>;
  return (
    <ul className="sent-list">
      {sent.map((s, i) => (
        <li key={i}>
          <Badge tone={tone(s.status)}>{STATUS[s.status] ?? s.status}</Badge>
          <span>{`${CH[s.channel] ?? s.channel} to ${s.to}`}</span>
          {s.error ? <small className="muted">{s.error}</small> : null}
        </li>
      ))}
    </ul>
  );
}

/** Organization Details: resend the school admin's sign-in details. */
export function SignInDetailsPanel({ tenantId }: { tenantId: string }) {
  const logs = useApi<Log[]>("/api/v1/super-admin/messaging/logs", { tenant_id: tenantId });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; temporary_password: string; sent: Sent[] } | null>(null);

  async function resend() {
    if (!(await ask("Give the school admin a new temporary password and send it to their mobile on WhatsApp and SMS? The old password stops working.", { confirmLabel: "Send new password" })))
      return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ email: string; temporary_password: string; sent: Sent[] }>(`/api/v1/super-admin/tenants/${tenantId}/resend-login`);
      setResult(r);
      notify(r.sent.some((x) => x.status === "sent") ? "New sign-in details sent." : "New password set, but it could not be sent. Share it yourself.");
      logs.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const recent = (logs.data ?? []).filter((x) => x.purpose === "login").slice(0, 6);
  return (
    <Panel title="School admin sign-in">
      <ErrorNote>{error}</ErrorNote>
      {result ? (
        <div className="tip warn" role="alert" style={{ marginBottom: 12, display: "block" }}>
          {`New temporary password for ${result.email}: `}
          <b className="mono">{result.temporary_password}</b>
          <div style={{ marginTop: 8 }}>
            <SentList sent={result.sent} />
          </div>
        </div>
      ) : (
        <p className="muted" style={{ marginBottom: 12 }}>Sends a new temporary password to the admin’s and the organization’s mobile, on WhatsApp and by SMS.</p>
      )}
      <button type="button" className="btn" disabled={busy} onClick={resend}>
        <Icon name="message" className="sm" />
        {busy ? "Sending…" : "Resend sign-in details"}
      </button>
      {recent.length ? (
        <>
          <p className="muted small" style={{ margin: "14px 0 6px" }}>Sent so far</p>
          <ul className="sent-list">
            {recent.map((x) => (
              <li key={x.id}>
                <Badge tone={tone(x.status)}>{STATUS[x.status] ?? x.status}</Badge>
                <span>{`${CH[x.channel]} to ${x.to_number}`}</span>
                <small className="muted">{x.error ?? dateTime(x.created_at)}</small>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Panel>
  );
}

const PROVIDERS: Record<ChannelKey, [string, string][]> = {
  whatsapp: [["meta", "Meta WhatsApp Cloud API"], ["twilio", "Twilio WhatsApp"], ["mock", "Test provider (development)"]],
  sms: [["msg91", "MSG91 (India, DLT)"], ["twilio", "Twilio SMS"], ["mock", "Test provider (development)"]],
};

function ChannelForm({ c, mock, onSaved }: { c: Channel; mock: boolean; onSaved: () => void }) {
  const [provider, setProvider] = useState(c.provider ?? (c.channel === "whatsapp" ? "meta" : "msg91"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [test, setTest] = useState<Sent | null>(null);
  const wa = c.channel === "whatsapp";
  const same = c.configured && c.provider === provider;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    setBusy(true);
    setError(null);
    try {
      await api.put(`/api/v1/super-admin/messaging/${c.channel}`, {
        provider,
        sender: v("sender"),
        account_id: v("account_id") || null,
        token: v("token") || null,
        template: v("template") || null,
        language: v("language") || "en",
        default_country_code: v("default_country_code") || "91",
        is_enabled: f.get("is_enabled") === "on",
      });
      notify(`The platform’s ${CH[c.channel]} is saved.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function off() {
    if (!(await ask(`Switch off the platform’s ${CH[c.channel]}? New school admins will not get their sign-in details on it.`, { confirmLabel: "Switch off" }))) return;
    try {
      await api.delete(`/api/v1/super-admin/messaging/${c.channel}`);
      notify(`${CH[c.channel]} switched off.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function sendTest() {
    setTest(null);
    setError(null);
    try {
      setTest(await api.post<Sent>(`/api/v1/super-admin/messaging/${c.channel}/test`, { to }));
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const needsId = provider === "meta" || provider === "twilio";
  const needsTemplate = wa ? provider !== "mock" : provider === "msg91";
  const tokenLabel = provider === "meta" ? "Permanent access token" : provider === "twilio" ? "Auth token" : "Auth key";
  return (
    <form className="panel" onSubmit={save} key={`${c.channel}-${c.provider}-${c.sender}`}>
      <div className="panel-head">
        <div>
          <h2>{`Platform ${CH[c.channel]}`}</h2>
          <p>{c.configured ? `${c.is_enabled ? "On" : "Off"} · ${PROVIDERS[c.channel].find(([k]) => k === c.provider)?.[1] ?? c.provider}` : "Not set up"}</p>
        </div>
        {c.configured ? <Badge tone={c.last_error ? "bad" : c.is_enabled ? "" : "warn"}>{c.last_error ? "Problem" : c.is_enabled ? "On" : "Off"}</Badge> : null}
      </div>
      <div className="panel-body">
        <ErrorNote>{error}</ErrorNote>
        {c.last_error ? <div className="tip warn" style={{ marginBottom: 12 }}>{`Last send failed: ${c.last_error}`}</div> : null}
        <div className="form-grid">
          <label className="field">
            <span>Provider</span>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}>
              {PROVIDERS[c.channel]
                .filter(([k]) => k !== "mock" || mock)
                .map(([k, t]) => (
                  <option key={k} value={k}>
                    {t}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>{wa ? "WhatsApp number" : provider === "twilio" ? "Twilio number" : "Sender id"}</span>
            <input name="sender" required defaultValue={c.sender ?? ""} placeholder={wa || provider === "twilio" ? "+91 98xxxxxxxx" : "e.g. BRTCMP"} />
          </label>
          {needsId ? (
            <label className="field">
              <span>{provider === "meta" ? "Phone number id" : "Account SID"}</span>
              <input name="account_id" defaultValue={same ? (c.account_id ?? "") : ""} placeholder={provider === "meta" ? "From Meta’s WhatsApp setup" : "AC…"} />
            </label>
          ) : null}
          {provider !== "mock" ? (
            <label className="field">
              <span>{tokenLabel}</span>
              <input name="token" type="password" autoComplete="off" placeholder={same && c.has_token ? "Saved. Type to replace it" : "Paste it here"} />
            </label>
          ) : null}
          {needsTemplate ? (
            <label className="field">
              <span>{wa ? (provider === "twilio" ? "Approved template Content SID" : "Approved template name") : "DLT flow template id"}</span>
              <input name="template" defaultValue={same ? (c.template ?? "") : ""} placeholder={wa ? (provider === "twilio" ? "HX…" : "school_admin_login") : "From MSG91 → Flows"} />
            </label>
          ) : null}
          {wa && provider === "meta" ? (
            <label className="field">
              <span>Template language</span>
              <input name="language" defaultValue={c.language || "en"} />
            </label>
          ) : null}
          <label className="field">
            <span>Country code for local numbers</span>
            <input name="default_country_code" defaultValue={c.default_country_code || "91"} />
          </label>
          <label className="check-item" style={{ alignSelf: "end" }}>
            <input type="checkbox" name="is_enabled" defaultChecked={c.configured ? c.is_enabled : true} />
            Send sign-in details on this channel
          </label>
        </div>
        {needsTemplate ? (
          <p className="muted small" style={{ marginTop: 10 }}>
            {wa
              ? "The template’s body takes five values in this order: {{1}} admin’s name, {{2}} organization, {{3}} username, {{4}} temporary password, {{5}} sign-in link."
              : "The DLT template takes ##var1## admin’s name, ##var2## organization, ##var3## username, ##var4## temporary password, ##var5## sign-in link."}
          </p>
        ) : null}
        {c.configured ? (
          <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Mobile for a test message" aria-label={`Test ${CH[c.channel]} to`} style={{ maxWidth: 240 }} />
            <button type="button" className="btn" disabled={to.trim().length < 6} onClick={sendTest}>
              Send test message
            </button>
            {test ? <SentList sent={[test]} /> : null}
          </div>
        ) : null}
      </div>
      <div className="form-footer">
        <span>{c.configured ? "" : "Until this is set up, new admins get their details only on screen."}</span>
        <div className="actions">
          {c.configured ? (
            <button type="button" className="btn" onClick={off}>
              Switch off
            </button>
          ) : null}
          <button type="submit" className="btn primary" disabled={busy}>
            <Icon name="check" className="sm" />
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}

/** Integrations (super admin): the platform's WhatsApp and SMS. */
export function PlatformMessaging() {
  const o = useApi<Overview>("/api/v1/super-admin/messaging");
  const logs = useApi<Log[]>("/api/v1/super-admin/messaging/logs");
  const reload = () => {
    o.reload();
    logs.reload();
  };
  if (!o.data) return <ErrorNote>{o.error}</ErrorNote>;
  return (
    <div className="stack" style={{ marginBottom: 20 }}>
      <Panel title="Sign-in details for new schools" sub="When you create an organization, its school admin gets their username and temporary password on WhatsApp and by SMS, sent from the platform’s own accounts below.">
        <p className="muted small" style={{ marginBottom: 6 }}>The message reads:</p>
        <p className="sample-message">{o.data.sample}</p>
      </Panel>
      <div className="messaging-grid">
        <ChannelForm c={o.data.whatsapp} mock={o.data.mock_available} onSaved={reload} />
        <ChannelForm c={o.data.sms} mock={o.data.mock_available} onSaved={reload} />
      </div>
      {logs.data?.length ? (
        <Panel title="Recently sent" sub="The platform’s messages. Passwords are never kept.">
          <ul className="sent-list">
            {logs.data.slice(0, 10).map((x) => (
              <li key={x.id}>
                <Badge tone={tone(x.status)}>{STATUS[x.status] ?? x.status}</Badge>
                <span>{`${CH[x.channel]} to ${x.to_number} · ${x.purpose === "test" ? "test" : (x.tenant_name ?? "organization")}`}</span>
                <small className="muted">{x.error ?? dateTime(x.created_at)}</small>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
