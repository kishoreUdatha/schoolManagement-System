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
 * POST gives one (whole school, or one branch), POST /bulk gives one role to
 * several people; DELETE takes it away.
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
  const [bulk, setBulk] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const togglePick = (id: number) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

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
    if ((bulk ? !picked.size : !user) || !role) {
      setError(bulk ? "Tick the people and choose a role." : "Choose a person and a role.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (bulk) {
        const r = await api.post<{ assigned: number[]; skipped: { user_id: number; reason: string }[] }>(`${ASSIGN}/bulk`, {
          user_ids: [...picked],
          role_id: Number(role),
          branch_id: branch ? Number(branch) : null,
        });
        const nameOf = (id: number) => people.data?.find((p) => p.user_id === id)?.full_name ?? `#${id}`;
        notify(`Role given to ${r.assigned.length} ${r.assigned.length === 1 ? "person" : "people"}.`);
        if (r.skipped.length) setError(`Not assigned: ${r.skipped.map((s) => `${nameOf(s.user_id)} (${s.reason})`).join("; ")}`);
        setPicked(new Set());
      } else {
        await api.post(ASSIGN, { user_id: Number(user), role_id: Number(role), branch_id: branch ? Number(branch) : null });
        notify("Role assigned.");
      }
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
          <label className="row" style={{ gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={bulk} onChange={(e) => setBulk(e.target.checked)} />
            Bulk assign
          </label>
        </div>
        <div className="panel-body">
          {assignable.length ? (
            <div className="form-grid">
              {bulk ? null : (
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
              )}
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
              {bulk ? (
                <div className="field full">
                  <span>{`People · ${picked.size} ticked`}</span>
                  <div className="row" style={{ flexWrap: "wrap", gap: "6px 18px", maxHeight: 220, overflowY: "auto" }}>
                    {people.data?.map((p) => (
                      <label key={p.user_id} className="row" style={{ gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={picked.has(p.user_id)} onChange={() => togglePick(p.user_id)} />
                        {`${p.full_name} · ${label(p.role)}`}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="muted">{roles.loading ? "Loading roles…" : "There is no active custom role to assign yet. Create one under Permissions first."}</p>
          )}
        </div>
        <div className="form-footer">
          <span>{`${assignable.length} custom ${assignable.length === 1 ? "role" : "roles"} can be assigned`}</span>
          <button type="submit" className="btn primary" disabled={saving || !assignable.length}>
            <Icon name="check" className="sm" />
            {saving ? "Assigning…" : bulk ? `Assign to ${picked.size || ""} ${picked.size === 1 ? "person" : "people"}` : "Assign role"}
          </button>
        </div>
      </form>
      <div className="gap" />
      <Panel title="Allocation workspace" sub={`${items.length} ${items.length === 1 ? "assignment" : "assignments"}${list.loading ? " · Loading…" : ""}`} flush>
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
