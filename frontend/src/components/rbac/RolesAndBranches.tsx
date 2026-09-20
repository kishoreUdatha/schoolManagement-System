"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select, Table, Textarea, humanize, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Permission = { code: string; module: string; name: string; description: string | null };
type Role = {
  id: number;
  name: string;
  code: string;
  description: string | null;
  base_role: string;
  is_system: boolean;
  is_active: boolean;
  permissions: string[];
  users: number;
};
type Assignment = { id: number; user_id: number; user_name: string; role_id: number; role_name: string; branch_id: number | null; branch_name: string | null; assigned_at: string };
type Branch = {
  id: number;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  head_user_id: number | null;
  head_name: string | null;
  is_main: boolean;
  is_active: boolean;
  sections: number;
  staff: number;
  students: number;
  section_ids: number[];
};
type Staff = { user_id: number; full_name: string; role: string };
type ClassRow = { id: number; name: string; sections: { id: number; name: string }[] };

const base = "/api/v1/school";
const BASE_ROLES = ["teacher", "staff", "principal", "accountant", "parent"];

export function RolesAndBranches() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [editing, setEditing] = useState<{ role: Role | null; name: string; code: string; description: string; base_role: string; permissions: Set<string> } | null>(null);
  const [assignForm, setAssignForm] = useState({ user_id: "", role_id: "", branch_id: "" });
  const [branchForm, setBranchForm] = useState({ id: 0, name: "", code: "", address: "", phone: "", head_user_id: "", is_main: false });
  const [sectionsFor, setSectionsFor] = useState<Branch | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRoles = () => api.get<Role[]>(`${base}/roles`).then((r) => setRoles(r.data)).catch((e) => setError(apiError(e)));
  const loadAssignments = () => api.get<Assignment[]>(`${base}/role-assignments`).then((r) => setAssignments(r.data)).catch(() => setAssignments([]));
  const loadBranches = () => api.get<Branch[]>(`${base}/branches`).then((r) => setBranches(r.data)).catch(() => setBranches([]));

  useEffect(() => {
    api.get<Permission[]>(`${base}/permissions`).then((r) => setPermissions(r.data)).catch((e) => setError(apiError(e)));
    loadRoles();
    loadAssignments();
    loadBranches();
    api.get<Staff[]>(`${base}/directory/staff`).then((r) => setStaff(r.data)).catch(() => setStaff([]));
    api
      .get<{ id: number; is_current: boolean }[]>(`${base}/academic-years`)
      .then(async (y) => {
        const cur = y.data.find((x) => x.is_current) ?? y.data[0];
        if (!cur) return;
        const cs = await api.get<ClassRow[]>(`${base}/classes`, { params: { academic_year_id: cur.id } });
        setClasses(cs.data);
      })
      .catch(() => setClasses([]));
  }, []);

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      setNotice(done);
      setError(null);
      loadRoles();
      loadAssignments();
      loadBranches();
      return true;
    } catch (e) {
      setError(apiError(e));
      return false;
    }
  }

  const byModule = permissions.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ||= []).push(p);
    return acc;
  }, {});

  async function saveRole(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const body = {
      name: editing.name,
      code: editing.code,
      description: editing.description.trim() || null,
      base_role: editing.base_role,
      is_active: editing.role?.is_active ?? true,
      permissions: Array.from(editing.permissions),
    };
    const ok = await run(
      () => (editing.role ? api.put(`${base}/roles/${editing.role.id}`, body) : api.post(`${base}/roles`, body)),
      editing.role ? "Role updated." : "Role created."
    );
    if (ok) setEditing(null);
  }

  async function saveBranch(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: branchForm.name,
      code: branchForm.code.toUpperCase(),
      address: branchForm.address.trim() || null,
      phone: branchForm.phone.trim() || null,
      head_user_id: branchForm.head_user_id ? Number(branchForm.head_user_id) : null,
      is_main: branchForm.is_main,
      is_active: true,
    };
    const ok = await run(
      () => (branchForm.id ? api.put(`${base}/branches/${branchForm.id}`, body) : api.post(`${base}/branches`, body)),
      branchForm.id ? "Branch updated." : "Branch added."
    );
    if (ok) setBranchForm({ id: 0, name: "", code: "", address: "", phone: "", head_user_id: "", is_main: false });
  }

  return (
    <div className="space-y-6">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      <p className="rounded-md bg-surface-subtle px-3 py-2 text-sm text-ink-muted">
        Everyone keeps the role they sign in with. A role here grants extra permissions on top — so you can let, say, the
        office approve refunds without changing anything else.
      </p>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Roles</CardTitle>
            <Button onClick={() => setEditing({ role: null, name: "", code: "", description: "", base_role: "staff", permissions: new Set() })}>
              New role
            </Button>
          </div>
        </CardHeader>
        <Table head={["Role", "Signs in as", "Can do", "People", ""]} empty={roles.length === 0 && "No roles yet."}>
          {roles.map((r) => (
            <tr key={r.id}>
              <td className={tdStrong}>
                {r.name}
                {r.is_system && <Badge className="ml-2">built-in</Badge>}
                {!r.is_active && <Badge tone="rose" className="ml-2">off</Badge>}
                {r.description && <div className="text-xs font-normal text-ink-subtle">{r.description}</div>}
              </td>
              <td className={td}>{humanize(r.base_role)}</td>
              <td className={td}>
                {r.permissions.length === permissions.length ? "Everything" : `${r.permissions.length} permission(s)`}
              </td>
              <td className={td}>{r.users}</td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    setEditing({
                      role: r,
                      name: r.name,
                      code: r.code,
                      description: r.description ?? "",
                      base_role: r.base_role,
                      permissions: new Set(r.permissions),
                    })
                  }
                >
                  {r.is_system ? "Permissions" : "Edit"}
                </Button>
                {!r.is_system && r.users === 0 && (
                  <Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete ${r.name}?`) && run(() => api.delete(`${base}/roles/${r.id}`), "Role deleted.")}>
                    Delete
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Who has which role</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(
                () =>
                  api.post(`${base}/role-assignments`, {
                    user_id: Number(assignForm.user_id),
                    role_id: Number(assignForm.role_id),
                    branch_id: assignForm.branch_id ? Number(assignForm.branch_id) : null,
                  }),
                "Role given."
              );
              if (ok) setAssignForm({ user_id: "", role_id: "", branch_id: "" });
            }}
          >
            <div className="w-52">
              <Select label="Person" value={assignForm.user_id} onChange={(e) => setAssignForm({ ...assignForm, user_id: e.target.value })}>
                <option value="">Choose…</option>
                {staff.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.full_name} ({humanize(s.role)})
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-52">
              <Select label="Role" value={assignForm.role_id} onChange={(e) => setAssignForm({ ...assignForm, role_id: e.target.value })}>
                <option value="">Choose…</option>
                {roles.filter((r) => !r.is_system && r.is_active).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
            {branches.length > 0 && (
              <div className="w-44">
                <Select label="At branch" value={assignForm.branch_id} onChange={(e) => setAssignForm({ ...assignForm, branch_id: e.target.value })}>
                  <option value="">Whole school</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <Button type="submit" disabled={!assignForm.user_id || !assignForm.role_id}>
              Give role
            </Button>
          </form>
          <Table head={["Person", "Role", "Branch", "Since", ""]} empty={assignments.length === 0 && "Nobody has an extra role yet."}>
            {assignments.map((a) => (
              <tr key={a.id}>
                <td className={tdStrong}>{a.user_name}</td>
                <td className={td}>{a.role_name}</td>
                <td className={td}>{a.branch_name ?? "Whole school"}</td>
                <td className={td}>{new Date(a.assigned_at).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => run(() => api.delete(`${base}/role-assignments/${a.id}`), "Role taken away.")}>
                    Take away
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Branches</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <form className="flex flex-wrap items-end gap-2" onSubmit={saveBranch}>
            <Input label="Name *" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} required placeholder="Junior wing" />
            <Input label="Code *" value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} required placeholder="JR" />
            <Input label="Phone" value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} />
            <div className="w-48">
              <Select label="Head" value={branchForm.head_user_id} onChange={(e) => setBranchForm({ ...branchForm, head_user_id: e.target.value })}>
                <option value="">—</option>
                {staff.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.full_name}
                  </option>
                ))}
              </Select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm text-ink">
              <input type="checkbox" checked={branchForm.is_main} onChange={(e) => setBranchForm({ ...branchForm, is_main: e.target.checked })} />
              Main campus
            </label>
            <Button type="submit">{branchForm.id ? "Save" : "Add branch"}</Button>
            {branchForm.id > 0 && (
              <Button type="button" variant="ghost" onClick={() => setBranchForm({ id: 0, name: "", code: "", address: "", phone: "", head_user_id: "", is_main: false })}>
                Cancel
              </Button>
            )}
          </form>
          <Table head={["Branch", "Head", "Sections", "Students", "Staff", ""]} empty={branches.length === 0 && "One campus — no branches needed."}>
            {branches.map((b) => (
              <tr key={b.id}>
                <td className={tdStrong}>
                  {b.name} <span className="text-xs font-normal text-ink-subtle">{b.code}</span>
                  {b.is_main && <Badge tone="emerald" className="ml-2">main</Badge>}
                  {b.phone && <div className="text-xs font-normal text-ink-subtle">{b.phone}</div>}
                </td>
                <td className={td}>{b.head_name ?? "—"}</td>
                <td className={td}>{b.sections}</td>
                <td className={td}>{b.students}</td>
                <td className={td}>{b.staff}</td>
                <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setSectionsFor(b);
                      setPicked(new Set(b.section_ids));
                    }}
                  >
                    Sections
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setBranchForm({
                        id: b.id, name: b.name, code: b.code, address: b.address ?? "", phone: b.phone ?? "",
                        head_user_id: b.head_user_id ? String(b.head_user_id) : "", is_main: b.is_main,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete ${b.name}?`) && run(() => api.delete(`${base}/branches/${b.id}`), "Branch deleted.")}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.role ? `Edit ${editing.role.name}` : "New role"} size="lg">
        {editing && (
          <form onSubmit={saveRole} className="space-y-3">
            {!editing.role?.is_system && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Input label="Name *" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required minLength={2} />
                <Input label="Code *" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} required minLength={2} placeholder="office_finance" />
                <Select label="Signs in as" value={editing.base_role} onChange={(e) => setEditing({ ...editing, base_role: e.target.value })}>
                  {BASE_ROLES.map((b) => (
                    <option key={b} value={b}>
                      {humanize(b)}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <Textarea label="What it's for" rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <div className="max-h-[45vh] space-y-3 overflow-auto rounded-md border border-surface-border p-3">
              {Object.entries(byModule).map(([module, list]) => (
                <div key={module}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{module}</span>
                    <button
                      type="button"
                      className="text-xs text-brand-500 hover:underline"
                      onClick={() => {
                        const n = new Set(editing.permissions);
                        const all = list.every((p) => n.has(p.code));
                        list.forEach((p) => (all ? n.delete(p.code) : n.add(p.code)));
                        setEditing({ ...editing, permissions: n });
                      }}
                    >
                      {list.every((p) => editing.permissions.has(p.code)) ? "none" : "all"}
                    </button>
                  </div>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {list.map((p) => (
                      <label key={p.code} className="flex items-start gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={editing.permissions.has(p.code)}
                          onChange={(e) => {
                            const n = new Set(editing.permissions);
                            if (e.target.checked) n.add(p.code);
                            else n.delete(p.code);
                            setEditing({ ...editing, permissions: n });
                          }}
                        />
                        <span>
                          {p.name}
                          {p.description && <span className="block text-xs text-ink-subtle">{p.description}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-subtle">{editing.permissions.size} selected</span>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!sectionsFor} onClose={() => setSectionsFor(null)} title={sectionsFor ? `Sections at ${sectionsFor.name}` : ""} size="lg">
        {sectionsFor && (
          <div className="space-y-3">
            <div className="max-h-[50vh] space-y-2 overflow-auto">
              {classes.map((c) => (
                <div key={c.id}>
                  <div className="text-sm font-medium text-ink">{c.name}</div>
                  <div className="flex flex-wrap gap-2">
                    {c.sections.map((s) => (
                      <label key={s.id} className="flex items-center gap-1 rounded-md border border-surface-border px-2 py-1 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={picked.has(s.id)}
                          onChange={(e) => {
                            const n = new Set(picked);
                            if (e.target.checked) n.add(s.id);
                            else n.delete(s.id);
                            setPicked(n);
                          }}
                        />
                        {c.name} {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSectionsFor(null)}>
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  const ok = await run(() => api.put(`${base}/branches/${sectionsFor.id}/sections`, { ids: Array.from(picked) }), "Sections updated.");
                  if (ok) setSectionsFor(null);
                }}
              >
                Save {picked.size} section(s)
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
