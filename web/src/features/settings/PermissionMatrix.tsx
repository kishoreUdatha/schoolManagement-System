"use client";

import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { ROLES, byModule, roleBody } from "./rbac";
import type { Permission, Role } from "./types";

type Draft = Record<number, Set<string>>;
const fromRoles = (roles: Role[]): Draft => Object.fromEntries(roles.map((r) => [r.id, new Set(r.permissions)]));

/**
 * SCR-287, live. Every active role side by side against the whole
 * catalogue from GET /permissions. Ticks are kept here until "Save matrix",
 * which PUTs each role whose set changed (PUT replaces the role's set).
 */
export function PermissionMatrix() {
  const roles = useApi<Role[]>(ROLES);
  const perms = useApi<Permission[]>("/api/v1/school/permissions");
  const [draft, setDraft] = useState<Draft>({});
  const [filter, setFilter] = useState("");
  const [view, setView] = useState("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (roles.data) setDraft(fromRoles(roles.data));
  }, [roles.data]);

  const active = useMemo(() => (roles.data ?? []).filter((r) => r.is_active), [roles.data]);
  const has = (r: Role, code: string) => (draft[r.id] ?? new Set(r.permissions)).has(code);
  const changedRoles = active.filter((r) => {
    const d = draft[r.id];
    return d && (d.size !== r.permissions.length || r.permissions.some((c) => !d.has(c)));
  });

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (perms.data ?? []).filter((p) => {
      if (q && !`${p.name} ${p.code} ${p.module} ${p.description ?? ""}`.toLowerCase().includes(q)) return false;
      if (view === "differ" && active.length > 1) {
        const first = (draft[active[0].id] ?? new Set(active[0].permissions)).has(p.code);
        return active.some((r) => (draft[r.id] ?? new Set(r.permissions)).has(p.code) !== first);
      }
      return true;
    });
  }, [perms.data, filter, view, active, draft]);

  if ((roles.loading && !roles.data) || (perms.loading && !perms.data)) return <Loading what="Loading the permission matrix…" />;

  const flip = (r: Role, code: string) =>
    setDraft((d) => {
      const next = new Set(d[r.id] ?? r.permissions);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return { ...d, [r.id]: next };
    });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!changedRoles.length) {
      notify("Nothing has changed.");
      return;
    }
    setSaving(true);
    setError(null);
    const failed: string[] = [];
    for (const r of changedRoles) {
      try {
        await api.put(`${ROLES}/${r.id}`, roleBody(r, [...draft[r.id]]));
      } catch (err) {
        failed.push(`${r.name}: ${errorText(err)}`);
      }
    }
    await roles.reload();
    setSaving(false);
    if (failed.length) setError(`Not saved — ${failed.join("; ")}`);
    else notify(`${changedRoles.length} ${changedRoles.length === 1 ? "role" : "roles"} saved.`);
  }

  return (
    <form id="matrix-form" onSubmit={submit}>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search permissions…" aria-label="Search permissions" />
        </div>
        <select className="select-plain" aria-label="Show" value={view} onChange={(e) => setView(e.target.value)}>
          <option value="all">All permissions</option>
          <option value="differ">Only where roles differ</option>
        </select>
      </div>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>Rows are the permissions the system defines; columns are the school&apos;s active roles. Built-in roles keep their portal, but their permissions move like any other.</span>
      </div>
      <ErrorNote>{error ?? roles.error ?? perms.error}</ErrorNote>
      <Panel
        title="Role permission matrix"
        sub={`${rows.length} of ${perms.data?.length ?? 0} permissions · ${active.length} active roles${changedRoles.length ? ` · ${changedRoles.length} with unsaved changes` : ""}`}
        flush
      >
        <div className="table-wrap">
          <table className="data-table permissions">
            <thead>
              <tr>
                <th>Permission</th>
                {active.map((r) => (
                  <th key={r.id}>{r.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byModule(rows).map(([module, list]) => (
                <Fragment key={module}>
                  <tr>
                    <td colSpan={active.length + 1}>
                      <strong>{module}</strong>
                    </td>
                  </tr>
                  {list.map((p) => (
                    <tr key={p.code}>
                      <td className="wrap" title={p.description ?? undefined}>
                        {p.name}
                        <small className="muted mono" style={{ display: "block" }}>
                          {p.code}
                        </small>
                      </td>
                      {active.map((r) => (
                        <td key={r.id}>
                          <input type="checkbox" aria-label={`${r.name}: ${p.name}`} checked={has(r, p.code)} onChange={() => flip(r, p.code)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={active.length + 1} className="muted">
                    No permissions match.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="form-footer" style={{ background: "transparent", border: "0" }}>
        <button type="button" className="btn" disabled={!changedRoles.length} onClick={() => roles.data && setDraft(fromRoles(roles.data))}>
          Reset changes
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          <Icon name="check" className="sm" />
          {saving ? "Saving…" : "Save matrix"}
        </button>
      </div>
    </form>
  );
}
