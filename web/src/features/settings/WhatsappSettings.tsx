"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { Field } from "@/features/fees/common";
import { ToggleRow } from "@/features/fees/extra";
import { api, errorText } from "@/lib/api";
import { dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";

import { ask } from "@/lib/dialog";
/**
 * NEW-082, live: GET/PUT/DELETE /school/whatsapp (the school's own WhatsApp
 * Business connection: Meta Cloud API or Twilio; secrets are write-only),
 * GET/PUT /school/whatsapp/templates (approved template per kind of message),
 * POST /school/whatsapp/test, GET /school/whatsapp/deliveries.
 */

type Provider = "meta" | "twilio" | "mock";
type Config = {
  configured: boolean;
  provider: Provider | null;
  sender_number: string | null;
  phone_number_id: string | null;
  business_account_id: string | null;
  account_sid: string | null;
  has_token: boolean;
  has_app_secret: boolean;
  verify_token: string | null;
  default_country_code: string;
  auto_categories: string[];
  is_enabled: boolean;
  last_error: string | null;
  webhook_url_path: string;
  mock_available: boolean;
  status_callbacks: boolean;
};
type Template = { id?: number; purpose: string; template_name: string; language: string };
type Delivery = {
  id: number;
  notice_id: number;
  notice_title: string;
  category: string;
  recipient_name: string | null;
  to_phone: string | null;
  status: string;
  error: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
};
type Deliveries = { last_30_days: Record<string, number>; rows: Delivery[] };

const CATEGORIES: [string, string][] = [
  ["attendance", "Attendance (absence and late alerts)"],
  ["fees", "Fees (reminders, receipts, refunds)"],
  ["exams", "Exams and results"],
  ["homework", "Homework"],
  ["events", "Events and meetings"],
  ["general", "General notices"],
];
const PURPOSES: [string, string, string][] = [
  ["general", "General notice", "Used for any kind without its own template. Body: {{1}} title, {{2}} message."],
  ["attendance", "Attendance", "{{1}} title, {{2}} message."],
  ["fees", "Fees", "{{1}} title, {{2}} message."],
  ["exams", "Exams", "{{1}} title, {{2}} message."],
  ["homework", "Homework", "{{1}} title, {{2}} message."],
  ["events", "Events", "{{1}} title, {{2}} message."],
  ["otp", "Sign-in & reset codes", "Authentication template. Body: {{1}} the code."],
];
const PROVIDER_NAME: Record<Provider, string> = { meta: "Meta WhatsApp Cloud API", twilio: "Twilio", mock: "Test provider (development)" };

export function WhatsappSettings() {
  const cfg = useApi<Config>("/api/v1/school/whatsapp");
  const tpls = useApi<Template[]>("/api/v1/school/whatsapp/templates");
  const log = useApi<Deliveries>("/api/v1/school/whatsapp/deliveries", { limit: 50 });

  const [provider, setProvider] = useState<Provider>("meta");
  const [sender, setSender] = useState("");
  const [phoneId, setPhoneId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [sid, setSid] = useState("");
  const [token, setToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [cc, setCc] = useState("91");
  const [cats, setCats] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [rows, setRows] = useState<Record<string, { template_name: string; language: string }>>({});
  const [testTo, setTestTo] = useState("");
  const [testPurpose, setTestPurpose] = useState("general");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tplError, setTplError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  const c = cfg.data;
  useEffect(() => {
    if (!c) return;
    setProvider(c.provider ?? "meta");
    setSender(c.sender_number ?? "");
    setPhoneId(c.phone_number_id ?? "");
    setWabaId(c.business_account_id ?? "");
    setSid(c.account_sid ?? "");
    setCc(c.default_country_code || "91");
    setCats(c.configured ? c.auto_categories : ["attendance", "fees"]);
    setEnabled(c.configured ? c.is_enabled : true);
  }, [c]);
  useEffect(() => {
    if (!tpls.data) return;
    setRows(Object.fromEntries(tpls.data.map((t) => [t.purpose, { template_name: t.template_name, language: t.language }])));
  }, [tpls.data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.put("/api/v1/school/whatsapp", {
        provider,
        sender_number: sender.trim(),
        phone_number_id: provider === "meta" ? phoneId.trim() || null : null,
        business_account_id: provider === "meta" ? wabaId.trim() || null : null,
        account_sid: provider === "twilio" ? sid.trim() || null : null,
        token: token.trim() || null,
        app_secret: provider === "meta" ? appSecret.trim() || null : null,
        default_country_code: cc.trim() || "91",
        auto_categories: cats,
        is_enabled: enabled,
      });
      setToken("");
      setAppSecret("");
      notify(enabled ? "WhatsApp connected." : "WhatsApp saved, switched off.");
      cfg.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!(await ask("Disconnect WhatsApp? Messages will go in the app only until it is connected again."))) return;
    setError(null);
    try {
      await api.delete("/api/v1/school/whatsapp");
      notify("WhatsApp disconnected.");
      cfg.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function saveTemplates() {
    setTplError(null);
    const body = Object.entries(rows)
      .filter(([, v]) => v.template_name.trim())
      .map(([purpose, v]) => ({ purpose, template_name: v.template_name.trim(), language: v.language.trim() || "en" }));
    try {
      await api.put("/api/v1/school/whatsapp/templates", body);
      notify("Templates saved.");
      tpls.reload();
    } catch (err) {
      setTplError(errorText(err));
    }
  }

  async function sendTest() {
    setTestResult(null);
    try {
      const r = await api.post<{ ok: boolean; detail: string; to: string }>("/api/v1/school/whatsapp/test", { to: testTo.trim(), purpose: testPurpose });
      setTestResult({ ok: r.ok, detail: r.ok ? `${r.detail} (${r.to})` : r.detail });
      cfg.reload();
    } catch (err) {
      setTestResult({ ok: false, detail: errorText(err) });
    }
  }

  if (!c) return cfg.error ? <ErrorNote>{cfg.error}</ErrorNote> : <Loading />;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const hook = `${origin}${c.webhook_url_path.replace(/\/(meta|twilio)\//, `/${provider === "twilio" ? "twilio" : "meta"}/`)}`;
  const counts = log.data?.last_30_days ?? {};
  const stats = [
    { label: "Connection", value: !c.configured ? "Not set up" : c.is_enabled ? "On" : "Off", note: c.provider ? PROVIDER_NAME[c.provider] : "Choose a provider" },
    { label: "Delivered · 30 days", value: String(counts.delivered ?? 0), note: `${counts.read ?? 0} read` },
    { label: "Sent, awaiting report", value: String((counts.sent ?? 0) + (counts.queued ?? 0)), note: "Queued or with the provider" },
    { label: "Not delivered", value: String((counts.failed ?? 0) + (counts.skipped ?? 0)), note: `${counts.failed ?? 0} failed · ${counts.skipped ?? 0} skipped` },
  ];
  const logRows: Row[] = (log.data?.rows ?? []).map((d) => [
    d.notice_title,
    label(d.category),
    d.recipient_name ?? "—",
    d.to_phone ?? "—",
    `${label(d.status)}${d.read_at ? " · read" : ""}`,
    d.error ?? (d.sent_at ? dateTime(d.sent_at) : "—"),
  ]);

  return (
    <>
      <StatStrip items={stats} compact />
      {c.last_error ? (
        <div className="tip warn" role="alert">
          <Icon name="bell" className="sm" />
          <span>{`Last problem reported: ${c.last_error}`}</span>
        </div>
      ) : null}
      <div className="two-col">
        <form id="whatsapp-form" className="panel" onSubmit={save} autoComplete="off">
          <div className="panel-pad">
            <ErrorNote>{error}</ErrorNote>
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Your WhatsApp Business number</h3>
                </div>
                <div className="form-grid">
                  <Field label="Provider" required>
                    <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
                      <option value="meta">{PROVIDER_NAME.meta}</option>
                      <option value="twilio">{PROVIDER_NAME.twilio}</option>
                      {c.mock_available ? <option value="mock">{PROVIDER_NAME.mock}</option> : null}
                    </select>
                  </Field>
                  <Field label="WhatsApp number" required>
                    <input value={sender} onChange={(e) => setSender(e.target.value)} required minLength={6} maxLength={20} placeholder="+91 98xxxxxxxx" inputMode="tel" />
                  </Field>
                  {provider === "meta" ? (
                    <>
                      <Field label="Phone number ID" required>
                        <input value={phoneId} onChange={(e) => setPhoneId(e.target.value)} required maxLength={64} placeholder="From WhatsApp > API setup" spellCheck={false} />
                      </Field>
                      <Field label="WhatsApp Business account ID">
                        <input value={wabaId} onChange={(e) => setWabaId(e.target.value)} maxLength={64} spellCheck={false} />
                      </Field>
                      <Field label={c.has_token && c.provider === "meta" ? "Access token (leave blank to keep)" : "Permanent access token"} required={!(c.has_token && c.provider === "meta")} full>
                        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" required={!(c.has_token && c.provider === "meta")} placeholder={c.has_token && c.provider === "meta" ? "Stored · type a new one to replace it" : "System user token with whatsapp_business_messaging"} />
                      </Field>
                      <Field label={c.has_app_secret ? "App secret (leave blank to keep)" : "App secret (for delivery reports)"} full>
                        <input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} autoComplete="new-password" placeholder={c.has_app_secret ? "Stored · type a new one to replace it" : "Meta app > Settings > Basic"} />
                      </Field>
                    </>
                  ) : null}
                  {provider === "twilio" ? (
                    <>
                      <Field label="Account SID" required>
                        <input value={sid} onChange={(e) => setSid(e.target.value)} required pattern="AC\w+" title="Starts AC" maxLength={64} placeholder="ACxxxxxxxxxxxxxxxx" spellCheck={false} />
                      </Field>
                      <Field label={c.has_token && c.provider === "twilio" ? "Auth token (leave blank to keep)" : "Auth token"} required={!(c.has_token && c.provider === "twilio")}>
                        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" required={!(c.has_token && c.provider === "twilio")} placeholder={c.has_token && c.provider === "twilio" ? "Stored · type a new one to replace it" : "From the Twilio console"} />
                      </Field>
                    </>
                  ) : null}
                  <Field label="Country code for local numbers">
                    <input value={cc} onChange={(e) => setCc(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="91" />
                  </Field>
                </div>
                {provider === "mock" ? <p className="muted small" style={{ marginTop: 12 }}>The test provider sends nothing: messages are recorded as delivered, so the flow can be tried on a development server.</p> : null}
              </section>
              <section>
                <div className="form-section-title">
                  <span className="number">02</span>
                  <h3>Delivery reports</h3>
                </div>
                <div className="form-grid">
                  <Field label="Webhook URL" full>
                    <input readOnly value={hook} onFocus={(e) => e.target.select()} />
                  </Field>
                  {provider === "meta" ? (
                    <Field label="Verify token" full>
                      <input readOnly value={c.verify_token ?? "Shown after the first save"} onFocus={(e) => e.target.select()} />
                    </Field>
                  ) : null}
                </div>
                <p className="muted small" style={{ marginTop: 12 }}>
                  {provider === "twilio"
                    ? c.status_callbacks
                      ? "Twilio is told to report each message's delivery to the URL above."
                      : "Delivery reports from Twilio need the server's public address (PUBLIC_API_BASE_URL); until it is set, messages show as sent, not delivered."
                    : "In Meta's app dashboard, add the URL above as the WhatsApp webhook with this verify token, and subscribe to “messages”. Reports are checked with the app secret."}
                </p>
              </section>
              <section>
                <div className="form-section-title">
                  <span className="number">03</span>
                  <h3>What to send on WhatsApp</h3>
                </div>
                <p className="muted small" style={{ marginBottom: 8 }}>Automatic alerts of these kinds also go to families on WhatsApp. Notices you write choose their own channels. Parents can switch WhatsApp off for any kind in their settings.</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                  {CATEGORIES.map(([k, text]) => (
                    <label key={k} className="check-item">
                      <input type="checkbox" checked={cats.includes(k)} onChange={(e) => setCats((xs) => (e.target.checked ? [...xs, k] : xs.filter((x) => x !== k)))} />
                      {text}
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <ToggleRow title="Send on WhatsApp" note="Switch off to pause all WhatsApp messages without losing the settings." checked={enabled} onChange={setEnabled} />
                </div>
              </section>
            </div>
          </div>
          <div className="form-footer">
            {c.configured ? (
              <button type="button" className="btn danger" onClick={disconnect}>
                Disconnect
              </button>
            ) : (
              <span>Tokens are stored encrypted and never shown again</span>
            )}
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save connection"}
            </button>
          </div>
        </form>
        <aside className="stack">
          <div className="aside-panel">
            <h3>Send a test</h3>
            <label className="field">
              <span>Mobile number</span>
              <input value={testTo} onChange={(e) => setTestTo(e.target.value)} inputMode="tel" placeholder="98xxxxxxxx" />
            </label>
            <label className="field">
              <span>Template</span>
              <select value={testPurpose} onChange={(e) => setTestPurpose(e.target.value)}>
                {PURPOSES.map(([k, text]) => (
                  <option key={k} value={k}>
                    {text}
                  </option>
                ))}
              </select>
            </label>
            <div className="gap" />
            <button type="button" className="btn" disabled={!c.configured || testTo.trim().length < 6} onClick={sendTest}>
              <Icon name="message" className="sm" />
              Send test message
            </button>
            {testResult ? <p style={{ marginTop: 10, color: testResult.ok ? undefined : "#b42318" }}>{testResult.detail}</p> : null}
            {!c.configured ? <p className="muted small" style={{ marginTop: 10 }}>Save the connection first.</p> : null}
          </div>
          <div className="aside-panel">
            <h3>Before you start</h3>
            <p className="small">WhatsApp only lets a school message a parent first with templates it has had approved (in Meta's WhatsApp Manager, or as Twilio content templates). Create them there, then enter their names below.</p>
          </div>
        </aside>
      </div>
      <div className="gap" />
      <Panel title="Approved templates" sub="Which of your approved templates carries each kind of message. For Twilio, enter the template's Content SID (HX…)." action={<button type="button" className="btn primary" onClick={saveTemplates}>Save templates</button>}>
        <ErrorNote>{tplError ?? tpls.error}</ErrorNote>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kind of message</th>
                <th>Template name</th>
                <th>Language</th>
                <th>Parameters</th>
              </tr>
            </thead>
            <tbody>
              {PURPOSES.map(([k, text, hint]) => {
                const v = rows[k] ?? { template_name: "", language: "en" };
                const set = (patch: Partial<typeof v>) => setRows((r) => ({ ...r, [k]: { ...v, ...patch } }));
                return (
                  <tr key={k}>
                    <td>{text}</td>
                    <td>
                      <input value={v.template_name} onChange={(e) => set({ template_name: e.target.value })} placeholder={k === "otp" ? "login_code" : `${k}_notice`} maxLength={120} spellCheck={false} aria-label={`${text} template`} />
                    </td>
                    <td style={{ width: 110 }}>
                      <input value={v.language} onChange={(e) => set({ language: e.target.value })} maxLength={10} aria-label={`${text} language`} />
                    </td>
                    <td className="muted small">{hint}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="gap" />
      <Panel title="Recent WhatsApp messages" sub="The latest 50, newest first" flush>
        <DataTable columns={["Notice", "Kind", "To", "Number", "Status", "Sent / reason"]} rows={logRows} selectable={false} empty={log.loading ? "Loading…" : "Nothing has been sent on WhatsApp yet."} />
      </Panel>
    </>
  );
}
