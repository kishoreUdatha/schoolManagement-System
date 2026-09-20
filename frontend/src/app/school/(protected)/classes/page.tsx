"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type AcademicYear = {
  id: number;
  name: string;
  is_current: boolean;
  is_archived: boolean;
};

type Section = {
  id: number;
  class_id: number;
  name: string;
  capacity: number;
  class_teacher_user_id: number | null;
};

type SchoolClass = {
  id: number;
  academic_year_id: number;
  name: string;
  display_order: number;
  sections: Section[];
};

export default function ClassesPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState<number | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openCreateClass, setOpenCreateClass] = useState(false);
  const [openCreateSection, setOpenCreateSection] = useState<number | null>(null);
  const [editClass, setEditClass] = useState<SchoolClass | null>(null);
  const [editSection, setEditSection] = useState<Section | null>(null);
  const [manageSubjectsClass, setManageSubjectsClass] = useState<SchoolClass | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedYear = useMemo(
    () => years.find((y) => y.id === yearId) ?? null,
    [years, yearId]
  );

  async function loadYears() {
    try {
      const { data } = await api.get<AcademicYear[]>(
        "/api/v1/school/academic-years"
      );
      setYears(data);
      if (yearId == null) {
        const current = data.find((y) => y.is_current) ?? data[0];
        if (current) setYearId(current.id);
      }
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function loadClasses(year: number) {
    try {
      const { data } = await api.get<SchoolClass[]>("/api/v1/school/classes", {
        params: { academic_year_id: year },
      });
      setClasses(data);
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
    if (yearId != null) loadClasses(yearId);
  }, [yearId]);

  async function move(classId: number, dir: -1 | 1) {
    const idx = classes.findIndex((c) => c.id === classId);
    const target = idx + dir;
    if (target < 0 || target >= classes.length) return;
    const reordered = [...classes];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    setBusy(true);
    try {
      await api.post(
        `/api/v1/school/classes/reorder?academic_year_id=${yearId}`,
        { class_ids: reordered.map((c) => c.id) }
      );
      await loadClasses(yearId!);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteClass(c: SchoolClass) {
    if (!window.confirm(`Delete class "${c.name}" and all its sections?`)) return;
    setBusy(true);
    try {
      await api.delete(`/api/v1/school/classes/${c.id}`);
      setNotice(`Deleted ${c.name}.`);
      await loadClasses(yearId!);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function deleteSection(s: Section, className: string) {
    if (!window.confirm(`Delete section "${className} ${s.name}"?`)) return;
    setBusy(true);
    try {
      await api.delete(`/api/v1/school/sections/${s.id}`);
      setNotice(`Deleted section ${className} ${s.name}.`);
      await loadClasses(yearId!);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  if (years.length === 0 && !error) {
    return (
      <div className="space-y-4">
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Classes</h1>
        <Card className="p-8 text-center text-slate-500">
          You don&apos;t have any academic years yet.{" "}
          <Link
            href="/school/academic-years"
            className="font-medium text-brand-700 hover:underline"
          >
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
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Classes & sections</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Classes are scoped to an academic year. Drag the order with the
            arrows. Sections live inside a class.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[12px] font-bold text-ink-muted">Academic year:</span>
            <select
              value={yearId ?? ""}
              onChange={(e) => setYearId(Number(e.target.value))}
              className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                  {y.is_current ? " (current)" : ""}
                  {y.is_archived ? " (archived)" : ""}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={() => setOpenCreateClass(true)}
            disabled={!selectedYear || selectedYear.is_archived}
          >
            + New class
          </Button>
        </div>
      </div>

      {selectedYear?.is_archived && (
        <div className="rounded-lg bg-[#FFF3D8] px-4 py-3 text-[13px] font-medium text-[#8E5C05] dark:bg-amber-500/15 dark:text-amber-200">
          This year is archived — classes are read-only.
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-[#E9F7F0] px-4 py-3 text-[13px] font-medium text-[#07845E] dark:bg-emerald-500/15 dark:text-emerald-200">
          {notice}
        </div>
      )}

      <div className="space-y-4">
        {classes.map((c, i) => (
          <Card key={c.id}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <button
                    onClick={() => move(c.id, -1)}
                    disabled={busy || i === 0 || selectedYear?.is_archived}
                    className="text-xs text-slate-400 hover:text-brand-700 disabled:opacity-30"
                    title="Move up"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => move(c.id, 1)}
                    disabled={
                      busy ||
                      i === classes.length - 1 ||
                      selectedYear?.is_archived
                    }
                    className="text-xs text-slate-400 hover:text-brand-700 disabled:opacity-30"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>
                <CardTitle>{c.name}</CardTitle>
                <Badge tone="neutral">
                  {c.sections.length} section{c.sections.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setEditClass(c)}
                  disabled={selectedYear?.is_archived}
                >
                  Rename
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setOpenCreateSection(c.id)}
                  disabled={selectedYear?.is_archived}
                >
                  + Section
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setManageSubjectsClass(c)}
                  disabled={selectedYear?.is_archived}
                >
                  Subjects
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => deleteClass(c)}
                  disabled={selectedYear?.is_archived}
                >
                  Delete
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              {c.sections.length === 0 ? (
                <div className="text-sm text-slate-500">
                  No sections yet. Click <strong>+ Section</strong> to add one.
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {c.sections.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                    >
                      <span className="font-semibold text-slate-900">
                        {c.name} {s.name}
                      </span>
                      <span className="text-xs text-slate-500">
                        capacity {s.capacity || "—"}
                      </span>
                      <button
                        onClick={() => setEditSection(s)}
                        disabled={selectedYear?.is_archived}
                        className="text-xs text-brand-700 hover:underline disabled:opacity-50"
                      >
                        edit
                      </button>
                      <button
                        onClick={() => deleteSection(s, c.name)}
                        disabled={selectedYear?.is_archived}
                        className="text-xs text-rose-600 hover:underline disabled:opacity-50"
                      >
                        delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        ))}
        {classes.length === 0 && (
          <Card className="p-8 text-center text-slate-500">
            No classes for this year yet. Click <strong>+ New class</strong>.
          </Card>
        )}
      </div>

      <CreateClassModal
        open={openCreateClass}
        onClose={() => setOpenCreateClass(false)}
        academicYearId={yearId}
        onCreated={(name) => {
          setOpenCreateClass(false);
          setNotice(`Created class ${name}.`);
          if (yearId != null) loadClasses(yearId);
        }}
      />
      {openCreateSection != null && (
        <CreateSectionModal
          open={openCreateSection != null}
          classId={openCreateSection}
          onClose={() => setOpenCreateSection(null)}
          onCreated={(name) => {
            setOpenCreateSection(null);
            setNotice(`Added section ${name}.`);
            if (yearId != null) loadClasses(yearId);
          }}
        />
      )}
      {editClass && (
        <EditClassModal
          klass={editClass}
          onClose={() => setEditClass(null)}
          onSaved={() => {
            setEditClass(null);
            setNotice("Class updated.");
            if (yearId != null) loadClasses(yearId);
          }}
        />
      )}
      {editSection && (
        <EditSectionModal
          section={editSection}
          onClose={() => setEditSection(null)}
          onSaved={() => {
            setEditSection(null);
            setNotice("Section updated.");
            if (yearId != null) loadClasses(yearId);
          }}
        />
      )}
      {manageSubjectsClass && (
        <ManageSubjectsModal
          klass={manageSubjectsClass}
          onClose={() => setManageSubjectsClass(null)}
          onChanged={() => setNotice("Subject assignments updated.")}
        />
      )}
    </div>
  );
}

function CreateClassModal({
  open,
  onClose,
  academicYearId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  academicYearId: number | null;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (academicYearId == null) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/school/classes", {
        academic_year_id: academicYearId,
        name,
      });
      onCreated(name);
      setName("");
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New class">
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Class name *"
          placeholder="e.g. KG, Grade 1, Grade 12"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
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

function CreateSectionModal({
  open,
  onClose,
  classId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  classId: number;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(40);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/classes/${classId}/sections`, {
        name,
        capacity,
      });
      onCreated(name);
      setName("");
      setCapacity(40);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New section">
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Section name *"
          placeholder="e.g. A, B, C"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="Capacity (0 = uncapped)"
          type="number"
          min="0"
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        />
        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Add
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditClassModal({
  klass,
  onClose,
  onSaved,
}: {
  klass: SchoolClass;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(klass.name);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/api/v1/school/classes/${klass.id}`, { name });
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Rename ${klass.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Class name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
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

type Subject = {
  id: number;
  name: string;
  code: string;
  kind: "core" | "elective";
  is_active: boolean;
};

type ClassSubject = {
  id: number;
  class_id: number;
  subject_id: number;
  teacher_user_id: number | null;
  is_optional: boolean;
  subject: Subject;
};

function ManageSubjectsModal({
  klass,
  onClose,
  onChanged,
}: {
  klass: SchoolClass;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [assigned, setAssigned] = useState<ClassSubject[]>([]);
  const [teachers, setTeachers] = useState<{ user_id: number; full_name: string }[]>([]);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [subs, cs, ts] = await Promise.all([
        api.get<Subject[]>("/api/v1/school/subjects?active_only=true"),
        api.get<ClassSubject[]>(`/api/v1/school/classes/${klass.id}/subjects`),
        api.get<{ user_id: number; full_name: string }[]>(
          "/api/v1/school/staff?role=teacher&status=active"
        ),
      ]);
      setAllSubjects(subs.data);
      setAssigned(cs.data);
      setTeachers(ts.data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klass.id]);

  const assignedBySubject = new Map(assigned.map((a) => [a.subject_id, a]));

  async function toggle(subject: Subject) {
    setBusy(subject.id);
    setError(null);
    try {
      const existing = assignedBySubject.get(subject.id);
      if (existing) {
        await api.delete(`/api/v1/school/class-subjects/${existing.id}`);
      } else {
        await api.post(`/api/v1/school/classes/${klass.id}/subjects`, {
          subject_id: subject.id,
        });
      }
      await load();
      onChanged();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggleOptional(cs: ClassSubject) {
    setBusy(cs.subject_id);
    setError(null);
    try {
      await api.patch(`/api/v1/school/class-subjects/${cs.id}`, {
        is_optional: !cs.is_optional,
      });
      await load();
      onChanged();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(null);
    }
  }

  async function setTeacher(cs: ClassSubject, userId: number | null) {
    setBusy(cs.subject_id);
    setError(null);
    try {
      await api.patch(`/api/v1/school/class-subjects/${cs.id}`, {
        teacher_user_id: userId,
      });
      await load();
      onChanged();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Subjects for ${klass.name}`}
      size="lg"
    >
      {error && (
        <div className="mb-3 rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}
      {allSubjects.length === 0 ? (
        <div className="rounded-lg bg-[#FFF3D8] px-4 py-3 text-[13px] font-medium text-[#8E5C05] dark:bg-amber-500/15 dark:text-amber-200">
          No subjects exist yet. Go to <strong>Subjects</strong> and create some first.
        </div>
      ) : (
        <div className="space-y-2">
          {allSubjects.map((s) => {
            const cs = assignedBySubject.get(s.id);
            const isAssigned = !!cs;
            const loading = busy === s.id;
            return (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
              >
                <div>
                  <div className="font-medium text-slate-900">
                    {s.name}{" "}
                    <span className="text-xs font-normal text-slate-500">
                      ({s.code})
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">{s.kind}</div>
                </div>
                <div className="flex items-center gap-3">
                  {isAssigned && cs && (
                    <>
                      <select
                        value={cs.teacher_user_id ?? ""}
                        onChange={(e) =>
                          setTeacher(cs, e.target.value ? Number(e.target.value) : null)
                        }
                        disabled={loading}
                        className="rounded border border-slate-300 px-2 py-1 text-xs"
                      >
                        <option value="">No teacher</option>
                        {teachers.map((t) => (
                          <option key={t.user_id} value={t.user_id}>
                            {t.full_name}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={cs.is_optional}
                          onChange={() => toggleOptional(cs)}
                          disabled={loading}
                          className="rounded border-slate-300"
                        />
                        optional
                      </label>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant={isAssigned ? "danger" : "primary"}
                    loading={loading}
                    onClick={() => toggle(s)}
                  >
                    {isAssigned ? "Unassign" : "Assign"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Modal>
  );
}

type TeacherOption = { id: number; user_id: number; full_name: string };

function EditSectionModal({
  section,
  onClose,
  onSaved,
}: {
  section: Section;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(section.name);
  const [capacity, setCapacity] = useState(section.capacity);
  const [teacherUserId, setTeacherUserId] = useState<number | "">(
    section.class_teacher_user_id ?? ""
  );
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TeacherOption[]>("/api/v1/school/staff?role=teacher&status=active")
      .then((r) => setTeachers(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.patch(`/api/v1/school/sections/${section.id}`, {
        name,
        capacity,
        class_teacher_user_id: teacherUserId === "" ? null : teacherUserId,
      });
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit section ${section.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Section name *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="Capacity (0 = uncapped)"
          type="number"
          min="0"
          value={capacity}
          onChange={(e) => setCapacity(Number(e.target.value))}
        />
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Class teacher</span>
          <select
            value={teacherUserId}
            onChange={(e) =>
              setTeacherUserId(e.target.value ? Number(e.target.value) : "")
            }
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="">— Unassigned —</option>
            {teachers.map((t) => (
              <option key={t.user_id} value={t.user_id}>
                {t.full_name}
              </option>
            ))}
          </select>
          {teachers.length === 0 && (
            <span className="text-xs text-slate-500">
              No active teachers yet. Add one in <strong>Staff</strong>.
            </span>
          )}
        </label>
        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">
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
