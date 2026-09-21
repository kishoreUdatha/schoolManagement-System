"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel, Person } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field } from "@/features/setup/bits";
import { ROLES } from "./rbac";
import type { Assignment, Branch, Role } from "./types";

const ASSIGN = "/api/v1/school/role-assignments";

type StaffPick = { user_id: number; full_name: string; role: string };

/**
 * SCR-288, live. GET /role-assignments lists who holds an extra role;
 * POST gives one (whole school, or one branch); DELETE takes it away.
 * Only active custom roles can be assigned: a built-in role is the portal
 * a person signs in with, which is set on their account, not here.
 */
export function RoleAssignment() {
  const list = useApi<Assignment[]>(ASSIGN);
  const roles = useApi<Role[]>(ROLES);
  const people = useApi<StaffPick[]>("/api/v1/school/directory/staff");
  const branches = useApi<Branch[]>("/api/v1/school/branches");
  const school = useApi<{ name: string }>("/api/v1/school/profile");
  const [typed, setTyped] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const assignable = (roles.data ?? []).filter((r) => !r.is_system && r.is_active);
  const signIn = useMemo(() => new Map((people.data ?? []).map((p) => [p.user_id, p.role])), [people.data]);

  const items = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return (list.data ?? []).filter(
      (a) =>
        (!q || `${a.user_name} ${a.role_name}`.toLowerCase().includes(q)) &&
        (!roleFilter || String(a.role_id) === roleFilter) &&
        (!branchFilter || (branchFilter === "school" ? a.branch_id === null : String(a.branch_id) === branchFilter)),
    );
  }, [list.data, typed, roleFilter, branchFilter]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const user = String(f.get("user_id") ?? "");
    const role = String(f.get("role_id") ?? "");
    const branch = String(f.get("branch_id") ?? "");
    if (!user || !role) {
      setError("Choose a person and a role.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(ASSIGN, { user_id: Number(user), role_id: Number(role), branch_id: branch ? Number(branch) : null });
      notify("Role assigned.");
      form.reset();
      await Promise.all([list.reload(), roles.reload()]);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(a: Assignment) {
    if (!window.confirm(`Take ${a.role_name} away from ${a.user_name}?`)) return;
    setError(null);
    try {
      await api.delete(`${ASSIGN}/${a.id}`);
      notify("Role taken away.");
      await Promise.all([list.reload(), roles.reload()]);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search user role assignment…" aria-label="Search assignments" />
        </div>
        <select aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All roles</option>
          {(roles.data ?? [])
            .filter((r) => !r.is_system)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
        </select>
        <select aria-label="Filter by branch" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
          <option value="">All branches</option>
          <option value="school">Whole school</option>
          {branches.data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? list.error ?? roles.error}</ErrorNote>
      <form id="assign-form" className="panel" onSubmit={submit}>
        <div className="panel-head">
          <div>
            <h2>Assign a role</h2>
            <p>Give someone a custom role, for the whole school or just one branch.</p>
          </div>
        </div>
        <div className="panel-body">
          {assignable.length ? (
            <div className="form-grid">
              <Field label="Person" required>
                <select name="user_id" required defaultValue="">
                  <option value="">{people.loading ? "Loading staff…" : "Choose a person"}</option>
                  {people.data?.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {`${p.full_name} · ${label(p.role)}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Role" required>
                <select name="role_id" required defaultValue="">
                  <option value="">Choose a role</option>
                  {assignable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Branch">
                <select name="branch_id" defaultValue="">
                  <option value="">Whole school</option>
                  {branches.data?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          ) : (
            <p className="muted">{roles.loading ? "Loading roles…" : "There is no active custom role to assign yet. Create one under Permissions first."}</p>
          )}
        </div>
        <div className="form-footer">
          <span>{`${assignable.length} custom ${assignable.length === 1 ? "role" : "roles"} can be assigned`}</span>
          <button type="submit" className="btn primary" disabled={saving || !assignable.length}>
            <Icon name="check" className="sm" />
            {saving ? "Assigning…" : "Assign role"}
          </button>
        </div>
      </form>
      <div className="gap" />
      <Panel title="Allocation workspace" sub={`${items.length} ${items.length === 1 ? "assignment" : "assignments"}${list.loading ? " · Loading…" : ""}`} flush>
        {/* Not wired: Bulk assign — the API assigns one person at a time; no endpoint */}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Current role</th>
                <th>New role</th>
                <th>School</th>
                <th>Branch</th>
                <th>Effective date</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a, i) => (
                <tr key={a.id}>
                  <td>
                    <Person name={a.user_name} index={i} />
                  </td>
                  <td>{label(signIn.get(a.user_id))}</td>
                  <td>{a.role_name}</td>
                  <td>{school.data?.name ?? "—"}</td>
                  <td>{a.branch_name ?? "Whole school"}</td>
                  <td>{date(a.assigned_at)}</td>
                  <td className="right">
                    <button type="button" className="btn" onClick={() => remove(a)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={items.length > 0}>
          {list.loading ? "Loading assignments…" : list.data?.length ? "No assignments match these filters." : "Nobody has an extra role yet."}
        </div>
      </Panel>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>A branch role applies only at that campus; a whole-school role applies everywhere. Everyone keeps the portal they sign in with.</span>
      </div>
    </>
  );
}
