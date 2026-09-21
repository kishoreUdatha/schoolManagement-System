"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { DepartmentSelect } from "@/components/foundation/DepartmentSelect";
import { api, apiError } from "@/lib/api";

type StaffRole = "teacher" | "staff" | "principal" | "accountant";

function roleLabel(r: StaffRole): string {
  if (r === "teacher") return "teacher";
  if (r === "staff") return "non-teaching";
  return r;
}

function roleBadgeTone(r: StaffRole) {
  if (r === "teacher") return "brand" as const;
  if (r === "principal") return "amber" as const;
  if (r === "accountant") return "emerald" as const;
  return "neutral" as const;
}

type Staff = {
  id: number;
  user_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: StaffRole;
  employee_no: string;
  designation: string | null;
  joining_date: string | null;
  department_id: number | null;
  department_name: string | null;
  is_active: boolean;
  last_login_at: string | null;
};

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [roleFilter, setRoleFilter] = useState<"" | StaffRole>("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">(
    ""
  );
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [tempPasswordFor, setTempPasswordFor] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);

  async function load() {
    try {
      const params: Record<string, string> = {};
      if (roleFilter) params.role = roleFilter;
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const { data } = await api.get<Staff[]>("/api/v1/school/staff", { params });
      setStaff(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter, statusFilter]);

  async function toggleActive(s: Staff) {
    const path = s.is_active ? "deactivate" : "activate";
    try {
      await api.post(`/api/v1/school/staff/${s.id}/${path}`);
      setNotice(`${s.full_name} ${s.is_active ? "deactivated" : "activated"}.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function resetPassword(s: Staff) {
    if (!window.confirm(`Reset password for ${s.full_name}?`)) return;
    try {
      const { data } = await api.post<{ temporary_password: string }>(
        `/api/v1/school/staff/${s.id}/reset-password`
      );
      setTempPasswordFor({
        name: s.full_name,
        email: s.email ?? "",
        password: data.temporary_password,
      });
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Staff</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Teachers and non-teaching staff. Each gets a login account.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>+ New staff member</Button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <Input
          placeholder="Search name, email, employee no"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Role</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            className="rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="">All</option>
            <option value="teacher">Teacher</option>
            <option value="staff">Non-teaching</option>
            <option value="principal">Principal</option>
            <option value="accountant">Accountant</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">
          {notice}
        </div>
      )}

      <Card>
        <table className="min-w-full divide-y divide-surface-border text-[13px]">
          <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-bold">Emp #</th>
              <th className="px-4 py-3 font-bold">Name</th>
              <th className="px-4 py-3 font-bold">Role</th>
              <th className="px-4 py-3 font-bold">Designation</th>
              <th className="px-4 py-3 font-bold">Contact</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {staff.map((s) => (
              <tr key={s.id} className="hover:bg-surface-subtle">
                <td className="px-4 py-3 font-mono text-ink-muted">
                  {s.employee_no}
                </td>
                <td className="px-4 py-3 font-medium text-ink">
                  {s.full_name}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={roleBadgeTone(s.role)}>{roleLabel(s.role)}</Badge>
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {s.designation ?? "—"}
                  {s.department_name && <div className="text-xs text-ink-subtle">{s.department_name}</div>}
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  <div>{s.email ?? "—"}</div>
                  <div className="text-xs text-ink-muted">{s.phone ?? ""}</div>
                </td>
                <td className="px-4 py-3">
                  {s.is_active ? (
                    <Badge tone="emerald">active</Badge>
                  ) : (
                    <Badge tone="rose">inactive</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(s)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => toggleActive(s)}
                  >
                    {s.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => resetPassword(s)}
                  >
                    Reset pw
                  </Button>
                </td>
              </tr>
            ))}
            {staff.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                  No staff yet — click <strong>New staff member</strong>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <CreateStaffModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onCreated={({ name, email, password }) => {
          setOpenCreate(false);
          setTempPasswordFor({ name, email, password });
          load();
        }}
      />
      {editing && (
        <EditStaffModal
          staff={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice("Staff member updated.");
            load();
          }}
        />
      )}
      {tempPasswordFor && (
        <TempPasswordModal
          info={tempPasswordFor}
          onClose={() => setTempPasswordFor(null)}
        />
      )}
    </div>
  );
}

function CreateStaffModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (r: { name: string; email: string; password: string }) => void;
}) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "teacher" as StaffRole,
    employee_no: "",
    designation: "",
    joining_date: "",
    department_id: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...form,
        joining_date: form.joining_date || null,
        designation: form.designation || null,
        phone: form.phone || null,
        department_id: form.department_id ? Number(form.department_id) : null,
      };
      const { data } = await api.post("/api/v1/school/staff", payload);
      onCreated({
        name: form.full_name,
        email: form.email,
        password: data.temporary_password,
      });
      setForm({
        full_name: "",
        email: "",
        phone: "",
        role: "teacher",
        employee_no: "",
        designation: "",
        joining_date: "",
        department_id: "",
      });
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New staff member" size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name *"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />
          <Input
            label="Employee number *"
            value={form.employee_no}
            onChange={(e) => setForm({ ...form, employee_no: e.target.value })}
            required
          />
          <Input
            label="Email *"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+91…"
          />
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Role *</span>
            <select
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as StaffRole })
              }
              className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="teacher">Teacher</option>
              <option value="staff">Non-teaching staff</option>
              <option value="principal">Principal</option>
              <option value="accountant">Accountant</option>
            </select>
          </label>
          <Input
            label="Designation"
            value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
            placeholder="e.g. Math Teacher, Office Clerk"
          />
          <DepartmentSelect value={form.department_id} onChange={(v) => setForm({ ...form, department_id: v })} />
          <Input
            label="Joining date"
            type="date"
            value={form.joining_date}
            onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
          />
        </div>
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditStaffModal({
  staff,
  onClose,
  onSaved,
}: {
  staff: Staff;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    full_name: staff.full_name,
    phone: staff.phone ?? "",
    employee_no: staff.employee_no,
    designation: staff.designation ?? "",
    joining_date: staff.joining_date ?? "",
    department_id: staff.department_id ? String(staff.department_id) : "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/api/v1/school/staff/${staff.id}`, {
        full_name: form.full_name,
        phone: form.phone || null,
        employee_no: form.employee_no,
        designation: form.designation || null,
        joining_date: form.joining_date || null,
        department_id: form.department_id ? Number(form.department_id) : null,
      });
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${staff.full_name}`}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Full name *"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Employee number *"
            value={form.employee_no}
            onChange={(e) => setForm({ ...form, employee_no: e.target.value })}
            required
          />
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="Designation"
            value={form.designation}
            onChange={(e) => setForm({ ...form, designation: e.target.value })}
          />
          <DepartmentSelect value={form.department_id} onChange={(v) => setForm({ ...form, department_id: v })} />
          <Input
            label="Joining date"
            type="date"
            value={form.joining_date}
            onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
          />
        </div>
        <p className="text-xs text-ink-muted">
          Email and role can&apos;t be changed after creation. To change either,
          deactivate this account and create a new one.
        </p>
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TempPasswordModal({
  info,
  onClose,
}: {
  info: { name: string; email: string; password: string };
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title="Temporary password">
      <div className="space-y-4">
        <div className="rounded-lg border border-success/30 bg-success-bg p-4 text-sm text-success">
          <div className="font-medium">Share these credentials with {info.name} once.</div>
          <div className="mt-1">
            The password isn&apos;t stored in plain text. If lost, use{" "}
            <strong>Reset pw</strong> to generate a new one.
          </div>
          <div className="mt-3 rounded bg-surface-raised px-3 py-2 text-[12px] tabular-nums">
            <div>Email: {info.email}</div>
            <div>Password: {info.password}</div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
