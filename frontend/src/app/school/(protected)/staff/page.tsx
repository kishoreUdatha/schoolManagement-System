"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
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
          <h1 className="text-2xl font-bold text-slate-900">Staff</h1>
          <p className="mt-1 text-sm text-slate-500">
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Role</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            <option value="teacher">Teacher</option>
            <option value="staff">Non-teaching</option>
            <option value="principal">Principal</option>
            <option value="accountant">Accountant</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
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
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      <Card>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Emp #</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Designation</th>
              <th className="px-4 py-2 font-medium">Contact</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {staff.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono text-slate-700">
                  {s.employee_no}
                </td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {s.full_name}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={roleBadgeTone(s.role)}>{roleLabel(s.role)}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {s.designation ?? "—"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <div>{s.email ?? "—"}</div>
                  <div className="text-xs text-slate-500">{s.phone ?? ""}</div>
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
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
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
            <span className="text-sm font-medium text-slate-700">Role *</span>
            <select
              value={form.role}
              onChange={(e) =>
                setForm({ ...form, role: e.target.value as StaffRole })
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
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
          <Input
            label="Joining date"
            type="date"
            value={form.joining_date}
            onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
          />
        </div>
        {error && (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
          <Input
            label="Joining date"
            type="date"
            value={form.joining_date}
            onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
          />
        </div>
        <p className="text-xs text-slate-500">
          Email and role can&apos;t be changed after creation. To change either,
          deactivate this account and create a new one.
        </p>
        {error && (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <div className="font-medium">Share these credentials with {info.name} once.</div>
          <div className="mt-1">
            The password isn&apos;t stored in plain text. If lost, use{" "}
            <strong>Reset pw</strong> to generate a new one.
          </div>
          <div className="mt-3 rounded bg-white px-3 py-2 font-mono text-xs">
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
