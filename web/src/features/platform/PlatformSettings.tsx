"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";

type Setting = { key: string; value: Record<string, unknown> | null; description: string | null; set: boolean; updated_at: string | null };

/** A plain value is stored as {"value": …}; unwrap it so nobody types JSON
 *  to change a support address (as the old settings page did). */
function display(v: Setting["value"]): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "value" in v && Object.keys(v).length === 1) {
    const inner = (v as { value: unknown }).value;
    return typeof inner === "string" ? inner : JSON.stringify(inner);
  }
  return JSON.stringify(v);
}

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * SCR-020, live: GET /super-admin/settings lists every known setting, set or
 * not. Save sends PUT /super-admin/settings {key, value} for each changed
 * field; "Use default" sends DELETE /super-admin/settings/{key}.
 */
export function PlatformSettings() {
  const settings = useApi<Setting[]>("/api/v1/super-admin/settings");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data) setDrafts(Object.fromEntries(settings.data.map((s) => [s.key, display(s.value)])));
  }, [settings.data]);

  const rows = settings.data ?? [];
  const changed = rows.filter((s) => (drafts[s.key] ?? "").trim() !== display(s.value) && (drafts[s.key] ?? "").trim() !== "");
  const last = rows
    .map((s) => s.updated_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!changed.length) {
      notify("Nothing to save.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      for (const s of changed) {
        await api.put("/api/v1/super-admin/settings", { key: s.key, value: parse(drafts[s.key].trim()) });
      }
      notify(`${changed.length} ${changed.length === 1 ? "setting" : "settings"} saved.`);
      settings.reload();
    } catch (err) {
      setError(errorText(err));
      settings.reload();
    } finally {
      setSaving(false);
    }
  }

  async function unset(s: Setting) {
    if (!window.confirm(`Put ${label(s.key)} back to its default?`)) return;
    setError(null);
    try {
      await api.delete(`/api/v1/super-admin/settings/${s.key}`);
      notify(`${label(s.key)} is back to its default.`);
      settings.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="settings-layout">
      <nav className="settings-nav">
        <Link href={routeOf(20)} className="active">
          Platform settings
        </Link>
        <Link href={routeOf(13)}>Subscription plans</Link>
        <Link href={routeOf(16)}>Platform users</Link>
        <Link href={routeOf(19)}>Global announcements</Link>
        <Link href={routeOf(18)}>System health</Link>
      </nav>
      <div>
        <form id="platform-settings-form" className="panel" onSubmit={save}>
          <div className="panel-head">
            <div>
              <h2>General configuration</h2>
              <p>{`Applies to every school at once · ${rows.filter((s) => s.set).length} of ${rows.length} set · changes apply after saving`}</p>
            </div>
          </div>
          <div className="panel-body">
            <ErrorNote>{error ?? settings.error}</ErrorNote>
            {rows.length ? (
              <div className="form-grid">
                {rows.map((s) => (
                  <label className="field" key={s.key}>
                    <span>
                      {label(s.key)}
                      {s.set ? null : <small className="muted">{" · default"}</small>}
                    </span>
                    <input
                      type="text"
                      value={drafts[s.key] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [s.key]: e.target.value }))}
                      placeholder={s.set ? "" : "Not set — the platform default applies"}
                      aria-label={label(s.key)}
                    />
                    {s.description ? <small className="muted">{s.description}</small> : null}
                    {s.set ? (
                      <button type="button" className="btn text" style={{ alignSelf: "flex-start" }} onClick={() => unset(s)}>
                        Use default
                      </button>
                    ) : null}
                  </label>
                ))}
              </div>
            ) : (
              <p className="muted">{settings.loading ? "Loading settings…" : "No settings are known to the platform."}</p>
            )}
            <div className="gap" />
            <div className="tip">
              <Icon name="shield" className="sm" />
              <span>A plain value is saved as text. A value written as JSON (a number, true/false, a list) is saved as that.</span>
            </div>
          </div>
          <div className="form-footer">
            <span>{last ? `Last updated ${dateTime(last)}` : "Nothing set yet"}</span>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : changed.length ? `Save settings (${changed.length})` : "Save settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
