"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field } from "@/features/setup/bits";
import { BASE_ROLES, ROLES, byModule, roleKind } from "./rbac";
import type { Permission, Role } from "./types";

/**
 * SCR-286, live. One role's permissions (?id=), or a new role (?new=1).
 * The rows are exactly GET /permissions; a role holds a set of their codes
 * and PUT /roles/{id} (POST /roles for a new one) replaces that set.
 * Built-in roles keep their name, code and portal; only their permissions
 * and description change.
 */
export function RolePermissions() {
  const router = useRouter();
  const params = useSearchParams();
  const creating = params.get("new") === "1";
  const roles = useApi<Role[]>(ROLES);
  const perms = useApi<Permission[]>("/api/v1/school/permissions");
  const role = creating ? undefined : (roles.data?.find((r) => String(r.id) === params.get("id")) ?? roles.data?.[0]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from what is saved whenever the role changes.
  useEffect(() => setPicked(new Set(role?.permissions ?? [])), [role]);

  const groups = useMemo(() => byModule(perms.data ?? []), [perms.data]);
  if ((roles.loading && !roles.data) || (perms.loading && !perms.data)) return <Loading what="Loading roles and permissions…" />;

  const saved = new Set(role?.permissions ?? []);
  const changed = picked.size !== saved.size || [...picked].some((c) => !saved.has(c));
  const editableDetails = creating || (role && !role.is_system);

  const toggle = (codes: string[], on: boolean) =>
    setPicked((p) => {
      const next = new Set(p);
      codes.forEach((c) => (on ? next.add(c) : next.delete(c)));
      return next;
    });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const permissions = [...picked];
    setSaving(true);
    setError(null);
    try {
      if (creating) {
        const created = await api.post<Role>(ROLES, {
          name: text("name"),
          code: text("code"),
          description: text("description") || null,
          base_role: text("base_role") || "staff",
          is_active: true,
          permissions,
        });
        notify(`${created.name} created.`);
        await roles.reload();
        router.replace(`${routeOf(286)}?id=${created.id}`);
        return;
      }
      if (!role) return;
      await api.put(`${ROLES}/${role.id}`, {
        name: role.is_system ? role.name : text("name"),
        code: role.is_system ? role.code : text("code"),
        description: text("description") || null,
        base_role: role.is_system ? role.base_role : text("base_role"),
        is_active: role.is_system ? role.is_active : f.get("status") !== "inactive",
        permissions,
      });
      notify(`${role.name} saved.`);
      await roles.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!role || !window.confirm(`Delete ${role.name}?`)) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`${ROLES}/${role.id}`);
      notify(`${role.name} deleted.`);
      await roles.reload();
      router.replace(routeOf(286));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const title = creating ? "New role" : `${role?.name ?? "Role"} permissions`;

  return (
    <form id="permissions-form" key={creating ? "new" : role?.id} onSubmit={submit}>
      <div className="filterbar">
        <select
          className="select-plain"
          aria-label="Role"
          value={creating ? "new" : (role?.id ?? "")}
          onChange={(e) => router.replace(e.target.value === "new" ? `${routeOf(286)}?new=1` : `${routeOf(286)}?id=${e.target.value}`)}
        >
          {roles.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {`${r.name}${r.is_active ? "" : " (inactive)"}`}
            </option>
          ))}
          <option value="new">New role…</option>
        </select>
        {/* Not wired: Scope — permissions belong to the role school-wide; a branch is chosen when the role is assigned (User Role Assignment) */}
      </div>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>
          {creating
            ? "A custom role grants the ticked permissions on top of the portal its people sign in with."
            : role?.is_system
              ? `${role.name} is built in: its name, code and portal are fixed, but its permissions can change. Everyone who signs in as ${label(role.base_role)} has them.`
              : "People get this role through User Role Assignment; it grants these permissions on top of their own sign-in."}
        </span>
      </div>
      <ErrorNote>{error ?? roles.error ?? perms.error}</ErrorNote>
      {editableDetails || role ? (
        <Panel title={creating ? "Role details" : "About this role"}>
          <div className="form-grid">
            {editableDetails ? (
              <>
                <Field label="Role name" required>
                  <input name="name" required minLength={2} defaultValue={role?.name ?? ""} placeholder="e.g. Office finance" />
                </Field>
                <Field label="Code" required>
                  <input name="code" required minLength={2} defaultValue={role?.code ?? ""} placeholder="office_finance" />
                </Field>
                <Field label="Signs in as">
                  <select name="base_role" defaultValue={role?.base_role ?? "staff"}>
                    {BASE_ROLES.map((b) => (
                      <option key={b} value={b}>
                        {label(b)}
                      </option>
                    ))}
                  </select>
                </Field>
                {role ? (
                  <Field label="Status">
                    <select name="status" defaultValue={role.is_active ? "active" : "inactive"}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </Field>
                ) : null}
              </>
            ) : null}
            <Field label="What it's for" full>
              <input name="description" defaultValue={role?.description ?? ""} placeholder="Describe the job this role does" />
            </Field>
          </div>
        </Panel>
      ) : null}
      <Panel
        title={title}
        sub={`${picked.size} of ${perms.data?.length ?? 0} permissions${changed ? " · unsaved changes" : ""}`}
        action={<span className="badge">{creating ? "Custom role" : role ? roleKind(role) : ""}</span>}
        flush
      >
        <div className="table-wrap">
          <table className="data-table permissions">
            <thead>
              <tr>
                <th>Module</th>
                <th>Permission</th>
                <th>Code</th>
                <th>Granted</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([module, list]) => {
                const all = list.every((p) => picked.has(p.code));
                return (
                  <Fragment key={module}>
                    <tr>
                      <td colSpan={3}>
                        <strong>{module}</strong>
                      </td>
                      <td>
                        <input type="checkbox" aria-label={`All of ${module}`} checked={all} onChange={() => toggle(list.map((p) => p.code), !all)} />
                      </td>
                    </tr>
                    {list.map((p) => (
                      <tr key={p.code}>
                        <td />
                        <td className="wrap">
                          {p.name}
                          {p.description ? <small className="muted" style={{ display: "block" }}>{p.description}</small> : null}
                        </td>
                        <td className="mono small">{p.code}</td>
                        <td>
                          <input type="checkbox" aria-label={p.name} checked={picked.has(p.code)} onChange={(e) => toggle([p.code], e.target.checked)} />
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="form-footer" style={{ background: "transparent", border: "0" }}>
        {role && !role.is_system && role.users === 0 ? (
          <button type="button" className="btn" onClick={remove} disabled={saving}>
            Delete role
          </button>
        ) : null}
        <button type="button" className="btn" onClick={() => setPicked(new Set(saved))} disabled={!changed}>
          Reset changes
        </button>
        <button type="submit" className="btn primary" disabled={saving}>
          <Icon name="check" className="sm" />
          {saving ? "Saving…" : creating ? "Create role" : "Save permissions"}
        </button>
      </div>
    </form>
  );
}
