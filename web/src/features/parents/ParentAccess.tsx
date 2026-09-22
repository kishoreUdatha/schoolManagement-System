"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, initials } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { AuditItem, childNames, PICK_PARENT, useParent } from "./ParentShell";
import type { AuditEntry, PasswordReset } from "./types";

import { ask } from "@/lib/dialog";
/**
 * SCR-076, live: GET /parents/{id}; POST /parents/{id}/activate or /deactivate
 * behind the portal-access switch; POST /parents/{id}/reset-password (shows the
 * temporary password once); account activity from GET /audit-log (entity User).
 */
export function ParentAccess() {
  const { id, data: p, error, loading, reload } = useParent();
  const activity = useApi<AuditEntry[]>(id ? "/api/v1/school/audit-log" : null, { entity_type: "User", entity_id: id, limit: 8 });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [temp, setTemp] = useState<string | null>(null);

  if (!id) return <PickFirst {...PICK_PARENT} />;
  if (loading && !p) return <Loading what="Loading the parent…" />;
  if (!p) return <ErrorNote>{error ?? "Parent not found."}</ErrorNote>;

  async function toggle() {
    setBusy(true);
    setFailed(null);
    try {
      await api.post(`/api/v1/school/parents/${id}/${p!.is_active ? "deactivate" : "activate"}`);
      notify(p!.is_active ? "Portal access turned off." : "Portal access turned on.");
      reload();
      activity.reload();
    } catch (err) {
      setFailed(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!(await ask(`Reset the password for ${p!.full_name}? Their current password stops working.`))) return;
    setBusy(true);
    setFailed(null);
    try {
      const r = await api.post<PasswordReset>(`/api/v1/school/parents/${id}/reset-password`);
      setTemp(r.temporary_password);
      notify("Password reset.");
      activity.reload();
    } catch (err) {
      setFailed(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const kids = childNames(p);

  return (
    <div className="two-col">
      <div className="stack">
        <ErrorNote>{failed}</ErrorNote>
        <Panel title="Guardian portal access">
          <div className="person">
            <span className="avatar mint">{initials(p.full_name)}</span>
            <div>
              {p.full_name}
              <small>{kids ? `Parent of ${kids}` : "No children linked"}</small>
            </div>
          </div>
          <div className="gap" />
          <dl className="kv">
            <div>
              <dt>Guardian</dt>
              <dd>{p.full_name}</dd>
            </div>
            <div>
              <dt>Email address</dt>
              <dd>{p.email ?? "—"}</dd>
            </div>
            <div>
              <dt>Mobile number</dt>
              <dd>{p.phone ?? "—"}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>Parent</dd>
            </div>
            <div>
              <dt>Last login</dt>
              <dd>{p.last_login_at ? date(p.last_login_at) : "Never"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{p.is_active ? "Active" : "Inactive"}</dd>
            </div>
          </dl>
        </Panel>
        <Panel title="Account activity">
          {activity.data?.length ? (
            activity.data.map((e) => <AuditItem key={e.id} e={e} />)
          ) : (
            <p className="muted">{activity.loading ? "Loading…" : activity.error ?? "Nothing recorded on this account yet."}</p>
          )}
        </Panel>
      </div>
      <aside>
        <Panel title="Access controls">
          <div className="toggle-row">
            <div>
              <strong>Portal access</strong>
              <p>Allow access to linked children’s records.</p>
            </div>
            <label className="switch">
              <input type="checkbox" aria-label="Portal access" checked={p.is_active} disabled={busy} onChange={toggle} />
              <i />
            </label>
          </div>
          <div className="gap" />
          <button type="button" className="btn" onClick={reset} disabled={busy}>
            Reset password
          </button>
          {temp ? (
            <>
              <div className="gap" />
              <div className="tip" role="status">
                <span>
                  {"Temporary password, shown once: "}
                  <strong className="mono">{temp}</strong>
                </span>
              </div>
            </>
          ) : null}
        </Panel>
      </aside>
    </div>
  );
}
