"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Gender = "male" | "female" | "other";

type Student = {
  id: number;
  admission_no: string;
  full_name: string;
  dob: string | null;
  gender: Gender | null;
  blood_group: string | null;
  photo_url: string | null;
  address: string | null;
  academic_year_id: number;
  section_id: number;
  roll_no: number;
  is_active: boolean;
};

type AcademicYear = { id: number; name: string; is_current: boolean; is_archived: boolean };
type Section = { id: number; name: string; capacity: number };
type SchoolClass = { id: number; name: string; sections: Section[] };

type StudentDetail = Student & {
  attendance_percent: number | null;
  fees_pending_amount: number | null;
};

type Paginated<T> = { items: T[]; total: number; page: number; pages: number };

export default function StudentsPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState<number | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState<number | "">("");
  const [sectionId, setSectionId] = useState<number | "">("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<Paginated<Student> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [openCreate, setOpenCreate] = useState(false);
  const [openBulk, setOpenBulk] = useState(false);
  const [openPromote, setOpenPromote] = useState(false);
  const [viewing, setViewing] = useState<Student | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId]
  );

  async function loadYears() {
    try {
      const { data } = await api.get<AcademicYear[]>("/api/v1/school/academic-years");
      setYears(data);
      if (yearId == null) {
        const cur = data.find((y) => y.is_current) ?? data[0];
        if (cur) setYearId(cur.id);
      }
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function loadClasses(yId: number) {
    try {
      const { data } = await api.get<SchoolClass[]>("/api/v1/school/classes", {
        params: { academic_year_id: yId },
      });
      setClasses(data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function load() {
    if (!yearId) return;
    try {
      const params: Record<string, string | number> = {
        academic_year_id: yearId,
        page,
        page_size: 50,
      };
      if (classId) params.class_id = classId;
      if (sectionId) params.section_id = sectionId;
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const { data } = await api.get<Paginated<Student>>("/api/v1/school/students", { params });
      setData(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    loadYears();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (yearId) {
      loadClasses(yearId);
      setClassId("");
      setSectionId("");
    }
  }, [yearId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId, classId, sectionId, statusFilter, page]);

  async function toggleActive(s: Student) {
    const path = s.is_active ? "deactivate" : "activate";
    try {
      await api.post(`/api/v1/school/students/${s.id}/${path}`);
      setNotice(`${s.full_name} ${s.is_active ? "deactivated" : "reactivated"}.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  function sectionName(secId: number): string {
    for (const c of classes) {
      const s = c.sections.find((x) => x.id === secId);
      if (s) return `${c.name} ${s.name}`;
    }
    return `#${secId}`;
  }

  if (years.length === 0 && !error) {
    return (
      <div className="space-y-4">
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Students</h1>
        <Card className="p-8 text-center text-ink-muted">
          You need an academic year first.{" "}
          <Link href="/school/academic-years" className="font-medium text-brand-700 hover:underline">
            Create one →
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Students</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Admit students individually or import a class roster via CSV.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setOpenPromote(true)}>
            Promote students
          </Button>
          <Button variant="secondary" onClick={() => setOpenBulk(true)}>
            Bulk import (CSV)
          </Button>
          <Button onClick={() => setOpenCreate(true)}>+ New student</Button>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Year</span>
          <select
            value={yearId ?? ""}
            onChange={(e) => setYearId(Number(e.target.value))}
            className="rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.is_current ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Class</span>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value ? Number(e.target.value) : "");
              setSectionId("");
            }}
            className="rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="">All</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Section</span>
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            disabled={!selectedClass}
          >
            <option value="">All</option>
            {selectedClass?.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
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
        <Input
          placeholder="Search name or admission no"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-56"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>
      )}

      <Card>
        <table className="min-w-full divide-y divide-surface-border text-[13px]">
          <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-bold">Adm #</th>
              <th className="px-4 py-3 font-bold">Roll</th>
              <th className="px-4 py-3 font-bold">Name</th>
              <th className="px-4 py-3 font-bold">Section</th>
              <th className="px-4 py-3 font-bold">Gender / DOB</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {data?.items.map((s) => (
              <tr key={s.id} className="hover:bg-surface-subtle">
                <td className="px-4 py-3 font-mono text-ink-muted">{s.admission_no}</td>
                <td className="px-4 py-3 text-ink-muted">{s.roll_no}</td>
                <td className="px-4 py-3 font-medium text-ink">{s.full_name}</td>
                <td className="px-4 py-3 text-ink-muted">{sectionName(s.section_id)}</td>
                <td className="px-4 py-3 text-ink-muted">
                  <div>{s.gender ?? "—"}</div>
                  <div className="text-xs text-ink-muted">{s.dob ?? ""}</div>
                </td>
                <td className="px-4 py-3">
                  {s.is_active ? (
                    <Badge tone="emerald">active</Badge>
                  ) : (
                    <Badge tone="rose">inactive</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Link
                    href={`/school/students/${s.id}`}
                    className="inline-flex items-center rounded-md border border-surface-border px-2 py-1 text-xs font-medium text-ink-muted hover:bg-surface-subtle"
                  >
                    Profile
                  </Link>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => toggleActive(s)}>
                    {s.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                  No students match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm text-ink-muted">
          <div>
            Page {data.page} of {data.pages} ({data.total} total)
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ← Prev
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </Button>
          </div>
        </div>
      )}

      <CreateStudentModal
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        years={years}
        classes={classes}
        defaultYearId={yearId}
        onCreated={(name) => {
          setOpenCreate(false);
          setNotice(`Admitted ${name}.`);
          load();
        }}
      />
      <BulkImportModal
        open={openBulk}
        onClose={() => setOpenBulk(false)}
        years={years}
        classes={classes}
        defaultYearId={yearId}
        onDone={(created, errs) => {
          setNotice(
            `Imported ${created} student(s)` +
              (errs ? `; ${errs} row(s) skipped.` : ".")
          );
          load();
        }}
      />
      {openPromote && (
        <PromoteStudentsModal
          years={years}
          defaultSourceYearId={yearId}
          onClose={() => setOpenPromote(false)}
          onDone={(n) => {
            setOpenPromote(false);
            setNotice(`Promoted ${n} student(s).`);
            load();
          }}
        />
      )}
      {viewing && (
        <ViewStudentModal
          student={viewing}
          sectionName={sectionName(viewing.section_id)}
          onClose={() => setViewing(null)}
        />
      )}
      {editing && (
        <EditStudentModal
          student={editing}
          classes={classes}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice("Student updated.");
            load();
          }}
        />
      )}
    </div>
  );
}

function CreateStudentModal({
  open,
  onClose,
  years,
  classes,
  defaultYearId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  years: AcademicYear[];
  classes: SchoolClass[];
  defaultYearId: number | null;
  onCreated: (name: string) => void;
}) {
  const [yearId, setYearId] = useState<number | "">(defaultYearId ?? "");
  const [classId, setClassId] = useState<number | "">("");
  const [sectionId, setSectionId] = useState<number | "">("");
  const [form, setForm] = useState({
    full_name: "",
    admission_no: "",
    roll_no: "",
    dob: "",
    gender: "" as "" | Gender,
    blood_group: "",
    photo_url: "",
    address: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId]
  );

  useEffect(() => {
    if (defaultYearId) setYearId(defaultYearId);
  }, [defaultYearId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/school/students", {
        academic_year_id: yearId,
        section_id: sectionId,
        full_name: form.full_name,
        admission_no: form.admission_no || null,
        roll_no: form.roll_no ? Number(form.roll_no) : null,
        dob: form.dob || null,
        gender: form.gender || null,
        blood_group: form.blood_group || null,
        photo_url: form.photo_url || null,
        address: form.address || null,
      });
      onCreated(form.full_name);
      setForm({
        full_name: "",
        admission_no: "",
        roll_no: "",
        dob: "",
        gender: "",
        blood_group: "",
        photo_url: "",
        address: "",
      });
      setClassId("");
      setSectionId("");
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Admit student" size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Year *</span>
            <select
              value={yearId}
              onChange={(e) => setYearId(e.target.value ? Number(e.target.value) : "")}
              className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
              required
            >
              <option value="">Select…</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Class *</span>
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value ? Number(e.target.value) : "");
                setSectionId("");
              }}
              className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
              required
            >
              <option value="">Select…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Section *</span>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
              className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
              disabled={!selectedClass}
              required
            >
              <option value="">Select…</option>
              {selectedClass?.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name *"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />
          <Input
            label="Admission # (leave blank to auto-generate)"
            value={form.admission_no}
            onChange={(e) => setForm({ ...form, admission_no: e.target.value })}
            placeholder="e.g. S00001"
          />
          <Input
            label="Roll # (leave blank to auto-assign)"
            type="number"
            min="1"
            value={form.roll_no}
            onChange={(e) => setForm({ ...form, roll_no: e.target.value })}
          />
          <Input
            label="Date of birth"
            type="date"
            value={form.dob}
            onChange={(e) => setForm({ ...form, dob: e.target.value })}
          />
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Gender</span>
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value as Gender | "" })}
              className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>
          <Input
            label="Blood group"
            value={form.blood_group}
            onChange={(e) => setForm({ ...form, blood_group: e.target.value })}
            placeholder="e.g. O+"
          />
          <Input
            label="Photo URL"
            value={form.photo_url}
            onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
          />
        </div>
        <Input
          label="Address"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Admit
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditStudentModal({
  student,
  classes,
  onClose,
  onSaved,
}: {
  student: Student;
  classes: SchoolClass[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    full_name: student.full_name,
    dob: student.dob ?? "",
    gender: (student.gender ?? "") as "" | Gender,
    blood_group: student.blood_group ?? "",
    photo_url: student.photo_url ?? "",
    address: student.address ?? "",
    section_id: student.section_id as number,
    roll_no: student.roll_no,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Class is derived from section
  const currentClass = useMemo(
    () => classes.find((c) => c.sections.some((s) => s.id === form.section_id)) ?? null,
    [classes, form.section_id]
  );
  const [classId, setClassId] = useState<number | "">(currentClass?.id ?? "");
  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId]
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/api/v1/school/students/${student.id}`, {
        full_name: form.full_name,
        dob: form.dob || null,
        gender: form.gender || null,
        blood_group: form.blood_group || null,
        photo_url: form.photo_url || null,
        address: form.address || null,
        section_id: form.section_id,
        roll_no: form.roll_no,
      });
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit ${student.full_name}`} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-xs text-ink-muted">
          Admission # ({student.admission_no}) cannot be changed.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name *"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
          />
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Class *</span>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : "")}
              className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Section *</span>
            <select
              value={form.section_id}
              onChange={(e) =>
                setForm({ ...form, section_id: Number(e.target.value) })
              }
              className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              {selectedClass?.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Roll #"
            type="number"
            min="1"
            value={form.roll_no}
            onChange={(e) => setForm({ ...form, roll_no: Number(e.target.value) })}
          />
          <Input
            label="DOB"
            type="date"
            value={form.dob}
            onChange={(e) => setForm({ ...form, dob: e.target.value })}
          />
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Gender</span>
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value as Gender | "" })}
              className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>
          <Input
            label="Blood group"
            value={form.blood_group}
            onChange={(e) => setForm({ ...form, blood_group: e.target.value })}
          />
          <Input
            label="Photo URL"
            value={form.photo_url}
            onChange={(e) => setForm({ ...form, photo_url: e.target.value })}
          />
        </div>
        <Input
          label="Address"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
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

function ViewStudentModal({
  student,
  sectionName,
  onClose,
}: {
  student: Student;
  sectionName: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<StudentDetail>(`/api/v1/school/students/${student.id}`)
      .then((r) => setDetail(r.data))
      .catch((e) => setError(apiError(e)));
  }, [student.id]);

  return (
    <Modal open onClose={onClose} title={student.full_name} size="lg">
      {error && (
        <div className="mb-3 rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}
      {detail && (
        <div className="space-y-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <Row label="Admission #" value={detail.admission_no} />
            <Row label="Roll #" value={String(detail.roll_no)} />
            <Row label="Class / Section" value={sectionName} />
            <Row label="Gender" value={detail.gender ?? "—"} />
            <Row label="DOB" value={detail.dob ?? "—"} />
            <Row label="Blood group" value={detail.blood_group ?? "—"} />
          </div>
          {detail.address && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">Address</div>
              <div className="mt-1 text-ink">{detail.address}</div>
            </div>
          )}
          <div className="rounded-lg border border-surface-border bg-surface-subtle p-3">
            <div className="text-xs font-semibold uppercase text-ink-muted">
              Analytics (placeholder)
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3 text-ink-muted">
              <Row
                label="Attendance"
                value={
                  detail.attendance_percent != null
                    ? `${detail.attendance_percent}%`
                    : "— (attendance module not built)"
                }
              />
              <Row
                label="Pending fees"
                value={
                  detail.fees_pending_amount != null
                    ? `₹${detail.fees_pending_amount}`
                    : "— (fees module not built)"
                }
              />
              <Row label="Marks summary" value="— (exams module not built)" />
            </div>
          </div>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}

type BulkRowError = { row: number; full_name?: string; error: string };

function BulkImportModal({
  open,
  onClose,
  years,
  classes,
  defaultYearId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  years: AcademicYear[];
  classes: SchoolClass[];
  defaultYearId: number | null;
  onDone: (created: number, errors: number) => void;
}) {
  const [yearId, setYearId] = useState<number | "">(defaultYearId ?? "");
  const [classId, setClassId] = useState<number | "">("");
  const [sectionId, setSectionId] = useState<number | "">("");
  const [csv, setCsv] = useState(
    "full_name,gender,dob,blood_group,address\nAarav Sharma,male,2018-05-12,O+,12 MG Road\nDiya Patel,female,2018-08-03,A+,"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    errors: BulkRowError[];
  } | null>(null);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId]
  );

  useEffect(() => {
    if (defaultYearId) setYearId(defaultYearId);
  }, [defaultYearId]);

  function parseCsv(text: string) {
    const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (rows.length < 2) throw new Error("CSV needs a header + at least one row");
    const header = rows[0].split(",").map((c) => c.trim().toLowerCase());
    const idx = (k: string) => header.indexOf(k);
    const nameI = idx("full_name");
    if (nameI < 0) throw new Error("CSV header must include 'full_name'");
    const dobI = idx("dob");
    const genderI = idx("gender");
    const bloodI = idx("blood_group");
    const addressI = idx("address");
    return rows.slice(1).map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      return {
        full_name: cells[nameI],
        dob: dobI >= 0 ? cells[dobI] || null : null,
        gender: genderI >= 0 ? (cells[genderI] as Gender) || null : null,
        blood_group: bloodI >= 0 ? cells[bloodI] || null : null,
        address: addressI >= 0 ? cells[addressI] || null : null,
      };
    });
  }

  async function downloadTemplate() {
    try {
      const { data } = await api.get<string>(
        "/api/v1/school/students/import-template.csv",
        { responseType: "text" }
      );
      const blob = new Blob([data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "students_import_template.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    e.target.value = "";
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!yearId || !sectionId) {
      setError("Pick year + class + section");
      return;
    }
    setError(null);
    setResult(null);
    let parsed;
    try {
      parsed = parseCsv(csv);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/api/v1/school/students/bulk", {
        academic_year_id: yearId,
        section_id: sectionId,
        students: parsed,
      });
      const r = {
        created: data.created.length as number,
        errors: data.errors as BulkRowError[],
      };
      setResult(r);
      onDone(r.created, r.errors.length);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bulk import students" size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Year *</span>
            <select
              value={yearId}
              onChange={(e) => setYearId(e.target.value ? Number(e.target.value) : "")}
              className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="">Select…</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Class *</span>
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value ? Number(e.target.value) : "");
                setSectionId("");
              }}
              className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="">Select…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Section *</span>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
              className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
              disabled={!selectedClass}
            >
              <option value="">Select…</option>
              {selectedClass?.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-surface-border bg-surface-subtle px-3 py-2 text-xs text-ink-muted">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={downloadTemplate}
          >
            Download CSV template
          </Button>
          <label className="inline-flex cursor-pointer items-center rounded-md border border-surface-border bg-surface-raised px-2.5 py-1 font-medium text-ink-muted hover:bg-surface-subtle">
            Upload .csv file
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={onPickFile}
              className="hidden"
            />
          </label>
          <span className="text-ink-muted">
            or paste below. Columns: <code>full_name,gender,dob,blood_group,address</code>.
            Admission # &amp; roll # auto-assigned.
          </span>
        </div>

        <div>
          <label className="text-sm font-medium text-ink-muted">CSV content</label>
          <textarea
            className="mt-1 h-44 w-full rounded-lg border border-surface-border px-3 py-2 text-[12px] tabular-nums shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
          />
        </div>

        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        {result && (
          <div className="space-y-2">
            <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">
              Imported {result.created} student(s)
              {result.errors.length ? `, skipped ${result.errors.length}.` : "."}
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-lg bg-danger-bg px-4 py-3 text-[12px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
                <div className="font-semibold">Skipped rows:</div>
                <ul className="mt-1 space-y-0.5">
                  {result.errors.map((er, i) => (
                    <li key={i} className="font-mono">
                      Row {er.row + 1}
                      {er.full_name ? ` (${er.full_name})` : ""}: {er.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" loading={submitting}>
            Import
          </Button>
        </div>
      </form>
    </Modal>
  );
}

type PromoteStudent = {
  id: number;
  admission_no: string;
  full_name: string;
  roll_no: number;
};

function PromoteStudentsModal({
  years,
  defaultSourceYearId,
  onClose,
  onDone,
}: {
  years: AcademicYear[];
  defaultSourceYearId: number | null;
  onClose: () => void;
  onDone: (promoted: number) => void;
}) {
  const [srcYearId, setSrcYearId] = useState<number | "">(defaultSourceYearId ?? "");
  const [srcClasses, setSrcClasses] = useState<SchoolClass[]>([]);
  const [srcClassId, setSrcClassId] = useState<number | "">("");
  const [srcSectionId, setSrcSectionId] = useState<number | "">("");

  const [tgtYearId, setTgtYearId] = useState<number | "">("");
  const [tgtClasses, setTgtClasses] = useState<SchoolClass[]>([]);
  const [tgtClassId, setTgtClassId] = useState<number | "">("");
  const [tgtSectionId, setTgtSectionId] = useState<number | "">("");

  const [roster, setRoster] = useState<PromoteStudent[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [promoteAll, setPromoteAll] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const srcSelectedClass = useMemo(
    () => srcClasses.find((c) => c.id === srcClassId) ?? null,
    [srcClasses, srcClassId]
  );
  const tgtSelectedClass = useMemo(
    () => tgtClasses.find((c) => c.id === tgtClassId) ?? null,
    [tgtClasses, tgtClassId]
  );

  // Default target year to a non-source year
  useEffect(() => {
    if (tgtYearId === "" && years.length > 0 && srcYearId !== "") {
      const other = years.find((y) => y.id !== srcYearId);
      if (other) setTgtYearId(other.id);
    }
  }, [years, srcYearId, tgtYearId]);

  // Load classes for source year
  useEffect(() => {
    if (srcYearId === "") return;
    api
      .get<SchoolClass[]>("/api/v1/school/classes", {
        params: { academic_year_id: srcYearId },
      })
      .then((r) => setSrcClasses(r.data))
      .catch((e) => setError(apiError(e)));
    setSrcClassId("");
    setSrcSectionId("");
  }, [srcYearId]);

  // Load classes for target year
  useEffect(() => {
    if (tgtYearId === "") return;
    api
      .get<SchoolClass[]>("/api/v1/school/classes", {
        params: { academic_year_id: tgtYearId },
      })
      .then((r) => setTgtClasses(r.data))
      .catch((e) => setError(apiError(e)));
    setTgtClassId("");
    setTgtSectionId("");
  }, [tgtYearId]);

  // Load roster when source section picked
  useEffect(() => {
    if (srcSectionId === "" || srcYearId === "") {
      setRoster([]);
      setSelected(new Set());
      return;
    }
    api
      .get<{ items: PromoteStudent[] }>("/api/v1/school/students", {
        params: {
          academic_year_id: srcYearId,
          section_id: srcSectionId,
          status: "active",
          page_size: 200,
        },
      })
      .then((r) => {
        setRoster(r.data.items);
        setSelected(new Set(r.data.items.map((s) => s.id)));
      })
      .catch((e) => setError(apiError(e)));
  }, [srcSectionId, srcYearId]);

  function toggleStudent(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!srcSectionId || !tgtSectionId) {
      setError("Pick source and target sections");
      return;
    }
    if (srcYearId === tgtYearId) {
      setError("Target year must be different from source year");
      return;
    }
    const ids = promoteAll ? undefined : Array.from(selected);
    if (!promoteAll && (!ids || ids.length === 0)) {
      setError("Pick at least one student or choose 'Promote all'");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post("/api/v1/school/students/promote", {
        source_section_id: srcSectionId,
        target_section_id: tgtSectionId,
        student_ids: ids,
      });
      onDone(data.promoted.length);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Promote students" size="lg">
      <div className="space-y-5">
        {/* Source */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            From
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-muted">Year *</span>
              <select
                value={srcYearId}
                onChange={(e) =>
                  setSrcYearId(e.target.value ? Number(e.target.value) : "")
                }
                className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
                required
              >
                <option value="">Select…</option>
                {years.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-muted">Class *</span>
              <select
                value={srcClassId}
                onChange={(e) => {
                  setSrcClassId(e.target.value ? Number(e.target.value) : "");
                  setSrcSectionId("");
                }}
                className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
                required
              >
                <option value="">Select…</option>
                {srcClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-muted">Section *</span>
              <select
                value={srcSectionId}
                onChange={(e) =>
                  setSrcSectionId(e.target.value ? Number(e.target.value) : "")
                }
                className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
                disabled={!srcSelectedClass}
                required
              >
                <option value="">Select…</option>
                {srcSelectedClass?.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Target */}
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
            To
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-muted">Year *</span>
              <select
                value={tgtYearId}
                onChange={(e) =>
                  setTgtYearId(e.target.value ? Number(e.target.value) : "")
                }
                className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
                required
              >
                <option value="">Select…</option>
                {years
                  .filter((y) => y.id !== srcYearId)
                  .map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-muted">Class *</span>
              <select
                value={tgtClassId}
                onChange={(e) => {
                  setTgtClassId(e.target.value ? Number(e.target.value) : "");
                  setTgtSectionId("");
                }}
                className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
                required
              >
                <option value="">Select…</option>
                {tgtClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-muted">Section *</span>
              <select
                value={tgtSectionId}
                onChange={(e) =>
                  setTgtSectionId(e.target.value ? Number(e.target.value) : "")
                }
                className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
                disabled={!tgtSelectedClass}
                required
              >
                <option value="">Select…</option>
                {tgtSelectedClass?.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {tgtClasses.length === 0 && tgtYearId !== "" && (
            <p className="mt-2 text-xs text-warning">
              No classes exist in the target year yet. Create one in Classes
              first.
            </p>
          )}
        </div>

        {/* Selection */}
        {roster.length > 0 && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Students ({roster.length})
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={promoteAll}
                  onChange={(e) => setPromoteAll(e.target.checked)}
                  className="rounded border-surface-border"
                />
                Promote all
              </label>
            </div>
            {!promoteAll && (
              <div className="max-h-56 overflow-y-auto rounded-md border border-surface-border">
                <table className="min-w-full text-[13px]">
                  <thead className="sticky top-0 bg-surface-subtle text-left text-xs uppercase text-ink-muted">
                    <tr>
                      <th className="px-4 py-3 w-8" />
                      <th className="px-4 py-3 font-bold">Roll</th>
                      <th className="px-4 py-3 font-bold">Admission #</th>
                      <th className="px-4 py-3 font-bold">Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((s) => (
                      <tr
                        key={s.id}
                        className="hover:bg-surface-subtle cursor-pointer"
                        onClick={() => toggleStudent(s.id)}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(s.id)}
                            onChange={() => toggleStudent(s.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-surface-border"
                          />
                        </td>
                        <td className="px-4 py-3 text-ink-muted">{s.roll_no}</td>
                        <td className="px-4 py-3 font-mono text-ink-muted">
                          {s.admission_no}
                        </td>
                        <td className="px-4 py-3 font-medium text-ink">
                          {s.full_name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-ink-muted">
              {promoteAll
                ? `All ${roster.length} active students will be promoted.`
                : `${selected.size} of ${roster.length} selected.`}
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={submit}
            loading={submitting}
            disabled={!srcSectionId || !tgtSectionId}
          >
            Promote
          </Button>
        </div>
      </div>
    </Modal>
  );
}
