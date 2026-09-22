"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, hhmm, orNull } from "@/features/setup/bits";
import type { SchoolProfile } from "@/features/setup/types";
import { PROFILE } from "./GeneralSettings";
import type { Integration, NotificationCatalogue, NotificationTemplate, TemplatePreview } from "./types";

import { ask } from "@/lib/dialog";
const TEMPLATES = "/api/v1/school/settings/notifications/templates";

const CHANNEL: Record<string, [string, string]> = {
  in_app: ["In the app", "Notices inside the BrightCampus app."],
  email: ["Email", "School updates sent to an email inbox."],
  sms: ["SMS", "Text messages to a registered phone."],
  whatsapp: ["WhatsApp", "Messages on a registered WhatsApp number."],
};
const CATEGORY: Record<string, string> = {
  attendance: "Absence and late-entry alerts.",
  fees: "Fee dues and receipts.",
  exams: "Exam schedules and results.",
  homework: "Homework and assignments.",
  events: "Events and meetings.",
  general: "Everything else the school sends.",
};

/**
 * SCR-291, live. What the school's notifications can use and what a parent
 * may refuse (GET /settings/notifications/categories), whether an outside
 * channel is actually connected (GET /integrations), and the message
 * templates (GET/POST/PATCH/DELETE /templates, POST /templates/{id}/preview).
 * The switches report the server's state; they are not per-person settings.
 */
export function NotificationSettings() {
  const cat = useApi<NotificationCatalogue>("/api/v1/school/settings/notifications/categories");
  const integrations = useApi<Integration[]>("/api/v1/school/integrations");
  const templates = useApi<NotificationTemplate[]>(TEMPLATES);
  const profile = useApi<SchoolProfile>(PROFILE);
  const [quietSaving, setQuietSaving] = useState(false);
  const [editing, setEditing] = useState<NotificationTemplate | "new" | null>(null);
  const [preview, setPreview] = useState<(TemplatePreview & { name: string }) | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveQuiet(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const start = orNull(f.get("quiet_hours_start"));
    const end = orNull(f.get("quiet_hours_end"));
    if ((start === null) !== (end === null)) {
      setError("Give quiet hours both a start and an end, or clear both.");
      return;
    }
    setQuietSaving(true);
    setError(null);
    try {
      await api.patch(PROFILE, { quiet_hours_start: start, quiet_hours_end: end });
      notify(start ? "Quiet hours saved." : "Quiet hours turned off.");
      await profile.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setQuietSaving(false);
    }
  }

  if (cat.loading && !cat.data) return <Loading what="Loading notification settings…" />;
  const c = cat.data;
  // In-app is built in; WhatsApp is the school's own connection (Settings >
  // WhatsApp Integration); SMS and email need the provider the list reports.
  const connected = (ch: string) => {
    if (ch === "in_app") return true;
    const it = integrations.data?.find((x) => x.key === (ch === "whatsapp" ? "whatsapp" : "notifications"));
    return Boolean(it?.enabled && it.configured);
  };
  const current = editing && editing !== "new" ? editing : null;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: String(f.get("name") ?? "").trim(),
      channel: String(f.get("channel") ?? "in_app"),
      category: String(f.get("category") ?? "general"),
      subject: orNull(f.get("subject")),
      body: String(f.get("body") ?? ""),
      description: orNull(f.get("description")),
      is_active: f.get("is_active") === "on",
    };
    setSaving(true);
    setError(null);
    try {
      if (current) await api.patch(`${TEMPLATES}/${current.id}`, body);
      else await api.post(TEMPLATES, { ...body, code: String(f.get("code") ?? "").trim() });
      notify(current ? "Template saved." : "Template created.");
      setEditing(null);
      await templates.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(t: NotificationTemplate) {
    if (!(await ask(`Delete the ${t.name} template?`))) return;
    setError(null);
    try {
      await api.delete(`${TEMPLATES}/${t.id}`);
      notify("Template deleted.");
      if (current?.id === t.id) setEditing(null);
      await templates.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function tryIt(t: NotificationTemplate) {
    setError(null);
    try {
      // Sample values, as the old screen used, to show how placeholders fill.
      const p = await api.post<TemplatePreview>(`${TEMPLATES}/${t.id}/preview`, { values: { student_name: "Aarav Sharma", parent_name: "Mr Sharma" } });
      setPreview({ ...p, name: t.name });
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div>
      <div className="stack">
        <ErrorNote>{error ?? cat.error ?? templates.error}</ErrorNote>
        <div className="panel">
          <div className="panel-pad">
            <h2>Notification preferences</h2>
            <p className="muted small" style={{ margin: "8px 0 15px" }}>
              How school updates can reach people, as the server has them set up.
            </p>
            {c?.channels.map((ch) => (
              <div className="toggle-row" key={ch}>
                <div>
                  <strong>{CHANNEL[ch]?.[0] ?? label(ch)}</strong>
                  <p>
                    {`${CHANNEL[ch]?.[1] ?? ""} ${connected(ch) ? "Available." : ch === "whatsapp" ? "Not connected: set it up under Settings > WhatsApp Integration." : "No provider is connected."}${
                      c.locked_channels.includes(ch) ? " Always on — people cannot turn it off." : ""
                    }`}
                  </p>
                </div>
                <label className="switch">
                  <input type="checkbox" aria-label={CHANNEL[ch]?.[0] ?? ch} checked={connected(ch)} disabled readOnly />
                  <i />
                </label>
              </div>
            ))}
            {c?.categories.map((k) => (
              <div className="toggle-row" key={k}>
                <div>
                  <strong>{`${label(k)} alerts`}</strong>
                  <p>{CATEGORY[k] ?? ""}</p>
                </div>
                <span className={`badge ${c.locked_categories.includes(k) ? "warn" : "neutral"}`}>
                  {c.locked_categories.includes(k) ? "Parents cannot refuse" : "Parents may turn off"}
                </span>
              </div>
            ))}
            <div className="toggle-row">
              <div>
                <strong>Push notifications</strong>
                <p>Alerts on a phone&apos;s lock screen. No push provider is connected, so the apps show new notices when opened instead.</p>
              </div>
              <label className="switch">
                <input type="checkbox" aria-label="Push notifications" checked={false} disabled readOnly />
                <i />
              </label>
            </div>
            <form className="toggle-row" key={profile.data?.updated_at} onSubmit={saveQuiet}>
              <div>
                <strong>Quiet hours</strong>
                <p>
                  {profile.data?.quiet_hours_start && profile.data.quiet_hours_end
                    ? `The school's quiet hours are ${hhmm(profile.data.quiet_hours_start)} to ${hhmm(profile.data.quiet_hours_end)}, for SMS, WhatsApp and email once a provider is connected. In-app notices are never held.`
                    : "Pause non-urgent SMS, WhatsApp and email overnight (once a provider is connected). Leave both times blank for none."}
                </p>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <input type="time" name="quiet_hours_start" aria-label="Quiet hours start" defaultValue={hhmm(profile.data?.quiet_hours_start)} />
                <span className="muted">to</span>
                <input type="time" name="quiet_hours_end" aria-label="Quiet hours end" defaultValue={hhmm(profile.data?.quiet_hours_end)} />
                <button type="submit" className="btn" disabled={quietSaving || !profile.data}>
                  {quietSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
          <div className="form-footer">
            <span>Channel and category rules are fixed by the server; quiet hours are the school&apos;s own</span>
          </div>
        </div>
        <Panel
          title="Message templates"
          sub={`${templates.data?.length ?? 0} templates · placeholders use {braces}`}
          action={
            <button type="button" className="btn" onClick={() => setEditing("new")}>
              <Icon name="plus" className="sm" />
              New template
            </button>
          }
        >
          {templates.data?.length ? (
            templates.data.map((t) => (
              <div className="toggle-row" key={t.id}>
                <div>
                  <strong>{`${t.name}${t.is_active ? "" : " (off)"}`}</strong>
                  <p>{`${CHANNEL[t.channel]?.[0] ?? t.channel} · ${label(t.category)} · ${t.code}`}</p>
                </div>
                <div className="row">
                  <button type="button" className="btn" onClick={() => tryIt(t)}>
                    Preview
                  </button>
                  <button type="button" className="btn" onClick={() => setEditing(t)}>
                    Edit
                  </button>
                  <button type="button" className="btn" onClick={() => remove(t)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">{templates.loading ? "Loading…" : "No templates yet."}</p>
          )}
          {preview ? (
            <div className="tip" style={{ marginTop: 12 }}>
              <Icon name="message" className="sm" />
              <span>
                <b>{`${preview.name}: `}</b>
                {preview.subject ? `${preview.subject} — ` : ""}
                {preview.body}
                {preview.unfilled.length ? ` (not filled: ${preview.unfilled.join(", ")})` : ""}
              </span>
            </div>
          ) : null}
        </Panel>
        {editing ? (
          <form id="template-form" key={current?.id ?? "new"} className="panel" onSubmit={submit}>
            <div className="panel-head">
              <h2>{current ? `Edit ${current.name}` : "New template"}</h2>
            </div>
            <div className="panel-body">
              <div className="form-grid">
                <Field label="Name" required>
                  <input name="name" required defaultValue={current?.name ?? ""} />
                </Field>
                <Field label="Code" required>
                  {current ? <input value={current.code} readOnly /> : <input name="code" required placeholder="fee_reminder" />}
                </Field>
                <Field label="Channel">
                  <select name="channel" defaultValue={current?.channel ?? "in_app"}>
                    {c?.channels.map((ch) => (
                      <option key={ch} value={ch}>
                        {CHANNEL[ch]?.[0] ?? ch}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Category">
                  <select name="category" defaultValue={current?.category ?? "general"}>
                    {c?.categories.map((k) => (
                      <option key={k} value={k}>
                        {label(k)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Subject" full>
                  <input name="subject" defaultValue={current?.subject ?? ""} placeholder="For email" />
                </Field>
                <Field label="Message" required full>
                  <textarea name="body" required rows={4} defaultValue={current?.body ?? ""} placeholder="Dear {parent_name}, …" />
                </Field>
                <Field label="What it's for" full>
                  <input name="description" defaultValue={current?.description ?? ""} />
                </Field>
                <label className="field">
                  <span>
                    <input type="checkbox" name="is_active" defaultChecked={current?.is_active ?? true} /> In use
                  </span>
                </label>
              </div>
            </div>
            <div className="form-footer">
              <span>Placeholders use {"{braces}"}</span>
              <div className="actions">
                <button type="button" className="btn" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={saving}>
                  <Icon name="check" className="sm" />
                  {saving ? "Saving…" : "Save template"}
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </div>
    </div>
  );
}
