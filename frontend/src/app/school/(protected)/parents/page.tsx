"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Relation = "father" | "mother" | "guardian" | "other";

type ChildLink = {
  student_id: number;
  full_name: string;
  admission_no: string;
  section_id: number;
  section_label: string | null;
  relation: Relation;
};

type Parent = {
  user_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  last_login_at: string | null;
  children: ChildLink[];
};

type StudentLite = {
  id: number;
  admission_no: string;
  full_name: string;
};

export default function ParentsPage() {
  const [parents, setParents] = useState<Parent[]>([]);
  const [students, setStudents] = useState<StudentLite[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [linkingTo, setLinkingTo] = useState<Parent | null>(null);
  const [editing, setEditing] = useState<Parent | null>(null);
  const [tempPasswordFor, setTempPasswordFor] = useState<{
    name: string;
    email: string;
    password: string;
  } | null>(null);

  async function load() {
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const { data } = await api.get<Parent[]>("/api/v1/school/parents", { params });
      setParents(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function loadStudents() {
    try {
      const { data } = await api.get<{ items: StudentLite[] }>(
        "/api/v1/school/students?page_size=200"
      );
      setStudents(data.items);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function toggleActive(p: Parent) {
    const path = p.is_active ? "deactivate" : "activate";
    try {
      await api.post(`/api/v1/school/parents/${p.user_id}/${path}`);
      setNotice(`${p.full_name} ${p.is_active ? "deactivated" : "activated"}.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function resetPassword(p: Parent) {
    if (!window.confirm(`Reset password for ${p.full_name}?`)) return;
    try {
      const { data } = await api.post<{ temporary_password: string }>(
        `/api/v1/school/parents/${p.user_id}/reset-password`
      );
      setTempPasswordFor({
        name: p.full_name,
        email: p.email ?? "",
        password: data.temporary_password,
      });
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function unlinkChild(p: Parent, studentId: number, childName: string) {
    if (!window.confirm(`Unlink ${childName} from ${p.full_name}?`)) return;
    try {
      await api.delete(`/api/v1/school/parents/${p.user_id}/links/${studentId}`);
      setNotice(`Unlinked ${childName}.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Parents</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Each parent has one login that sees only their linked children.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>+ New parent</Button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <Input
          placeholder="Search name, email, phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72"
        />
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Status</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
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
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-[#E9F7F0] px-4 py-3 text-[13px] font-medium text-[#07845E] dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>
      )}

      <div className="space-y-3">
        {parents.map((p) => (
          <Card key={p.user_id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-900">{p.full_name}</h3>
                  {p.is_active ? (
                    <Badge tone="emerald">active</Badge>
                  ) : (
                    <Badge tone="rose">inactive</Badge>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {p.email} · {p.phone ?? "no phone"}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {p.children.map((c) => (
                    <span
                      key={c.student_id}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs"
                    >
                      <span className="font-medium text-slate-900">{c.full_name}</span>
                      <span className="text-slate-500">
                        {c.admission_no} · {c.section_label} · {c.relation}
                      </span>
                      <button
                        onClick={() => unlinkChild(p, c.student_id, c.full_name)}
                        className="text-rose-600 hover:underline"
                      >
                        unlink
                      </button>
                    </span>
                  ))}
                  {p.children.length === 0 && (
                    <span className="text-xs text-slate-500">No children linked</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setLinkingTo(p)}>
                  + Link child
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                  Edit
                </Button>
                <Button size="sm" variant="secondary" onClick={() => toggleActive(p)}>
                  {p.is_active ? "Deactivate" : "Activate"}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => resetPassword(p)}>
                  Reset pw
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {parents.length === 0 && (
          <Card className="p-8 text-center text-slate-500">
            No parents yet — click <strong>+ New parent</strong>.
          </Card>
        )}
      </div>

      <CreateParentModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        students={students}
        onCreated={({ name, email, password }) => {
          setOpenCreate(false);
          setTempPasswordFor({ name, email, password });
          load();
        }}
      />
      {linkingTo && (
        <LinkChildModal
          parent={linkingTo}
          students={students}
          onClose={() => setLinkingTo(null)}
          onLinked={(childName) => {
            setLinkingTo(null);
            setNotice(`Linked ${childName} to ${linkingTo.full_name}.`);
            load();
          }}
        />
      )}
      {editing && (
        <EditParentModal
          parent={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice("Parent updated.");
            load();
          }}
        />
      )}
      {tempPasswordFor && (
        <TempPasswordModal info={tempPasswordFor} onClose={() => setTempPasswordFor(null)} />
      )}
    </div>
  );
}

function CreateParentModal({
  open,
  onClose,
  students,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  students: StudentLite[];
  onCreated: (r: { name: string; email: string; password: string }) => void;
}) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    relation: "father" as Relation,
    student_id: "" as number | "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.student_id) {
      setError("Pick a student to link");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post("/api/v1/school/parents", {
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        relation: form.relation,
        student_id: form.student_id,
      });
      onCreated({
        name: form.full_name,
        email: form.email,
        password: data.temporary_password,
      });
      setForm({
        full_name: "",
        email: "",
        phone: "",
        relation: "father",
        student_id: "",
      });
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New parent" size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name *"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
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
            label="Phone (for OTP later)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+91…"
          />
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Relation *</span>
            <select
              value={form.relation}
              onChange={(e) =>
                setForm({ ...form, relation: e.target.value as Relation })
              }
              className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="father">Father</option>
              <option value="mother">Mother</option>
              <option value="guardian">Guardian</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[12px] font-bold text-ink-muted">Link to student *</span>
            <select
              value={form.student_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  student_id: e.target.value ? Number(e.target.value) : "",
                })
              }
              className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
              required
            >
              <option value="">Select student…</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.admission_no})
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">
              For siblings: create the parent here first, then use <strong>+ Link child</strong>{" "}
              to add the others.
            </span>
          </label>
        </div>
        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
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

function LinkChildModal({
  parent,
  students,
  onClose,
  onLinked,
}: {
  parent: Parent;
  students: StudentLite[];
  onClose: () => void;
  onLinked: (childName: string) => void;
}) {
  const linkedIds = new Set(parent.children.map((c) => c.student_id));
  const available = students.filter((s) => !linkedIds.has(s.id));
  const [studentId, setStudentId] = useState<number | "">("");
  const [relation, setRelation] = useState<Relation>("father");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!studentId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/parents/${parent.user_id}/links`, {
        student_id: studentId,
        relation,
      });
      const child = students.find((s) => s.id === studentId);
      onLinked(child?.full_name ?? "child");
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Link another child to ${parent.full_name}`}>
      <form onSubmit={submit} className="space-y-4">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Student *</span>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value ? Number(e.target.value) : "")}
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            required
          >
            <option value="">Select…</option>
            {available.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name} ({s.admission_no})
              </option>
            ))}
          </select>
          {available.length === 0 && (
            <span className="text-xs text-slate-500">
              All students are already linked to this parent.
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Relation *</span>
          <select
            value={relation}
            onChange={(e) => setRelation(e.target.value as Relation)}
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="father">Father</option>
            <option value="mother">Mother</option>
            <option value="guardian">Guardian</option>
            <option value="other">Other</option>
          </select>
        </label>
        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={!studentId}>
            Link
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditParentModal({
  parent,
  onClose,
  onSaved,
}: {
  parent: Parent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [full_name, setName] = useState(parent.full_name);
  const [phone, setPhone] = useState(parent.phone ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/api/v1/school/parents/${parent.user_id}`, {
        full_name,
        phone: phone || null,
      });
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${parent.full_name}`}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Full name *"
          value={full_name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <p className="text-xs text-slate-500">
          Email cannot be changed (it&apos;s the login identifier).
        </p>
        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
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
            Parent portal login: <code>http://127.0.0.1:3000/parent/login</code>
            <br />
            (OTP-via-SMS will replace the temp-password flow once the notifications module is wired.)
          </div>
          <div className="mt-3 rounded bg-white px-3 py-2 text-[12px] tabular-nums">
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
