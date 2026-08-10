"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type ExamKind = "unit_test" | "mid_term" | "term" | "final" | "other";

type Paper = {
  id: number;
  exam_id: number;
  class_subject_id: number;
  subject_name: string | null;
  subject_code: string | null;
  class_name: string | null;
  max_marks: number;
  pass_marks: number;
  exam_date: string;
  duration_minutes: number | null;
  marks_entered_count: number;
};

type Exam = {
  id: number;
  academic_year_id: number;
  academic_year_name: string | null;
  name: string;
  kind: ExamKind;
  start_date: string;
  end_date: string;
  is_published: boolean;
  published_at: string | null;
  papers: Paper[];
  papers_count: number;
  total_marks_entered: number;
};

type AcademicYear = { id: number; name: string; is_current: boolean };
type SchoolClass = { id: number; name: string };
type ClassSubject = {
  id: number;
  class_id: number;
  subject: { name: string; code: string };
};
type Section = { id: number; name: string; class_id: number };

const kindLabel: Record<ExamKind, string> = {
  unit_test: "Unit test",
  mid_term: "Mid-term",
  term: "Term",
  final: "Final",
  other: "Other",
};

export default function ExamsPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState<number | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<Exam | null>(null);
  const [paperFor, setPaperFor] = useState<Exam | null>(null);
  const [bulkFor, setBulkFor] = useState<Exam | null>(null);

  async function loadYears() {
    try {
      const { data } = await api.get<AcademicYear[]>("/api/v1/school/academic-years");
      setYears(data);
      const cur = data.find((y) => y.is_current) ?? data[0];
      if (cur && yearId == null) setYearId(cur.id);
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function load() {
    if (!yearId) return;
    try {
      const { data } = await api.get<Exam[]>("/api/v1/school/exams", {
        params: { academic_year_id: yearId },
      });
      setExams(data);
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId]);

  async function setPublished(e: Exam, on: boolean) {
    try {
      await api.post(`/api/v1/school/exams/${e.id}/${on ? "publish" : "unpublish"}`);
      setNotice(on ? `Published ${e.name}.` : `Unpublished ${e.name}.`);
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function remove(e: Exam) {
    if (!window.confirm(`Delete ${e.name}?`)) return;
    try {
      await api.delete(`/api/v1/school/exams/${e.id}`);
      setNotice("Deleted.");
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function removePaper(p: Paper) {
    if (
      !window.confirm(`Remove ${p.subject_name} paper from this exam?`)
    )
      return;
    try {
      await api.delete(`/api/v1/school/exams/papers/${p.id}`);
      setNotice("Paper removed.");
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Exams</h1>
          <p className="mt-1 text-sm text-slate-500">
            Define exams and their subject papers. Teachers enter marks against
            these (Story 3.7b). Parents see results only when published (3.7c).
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)} disabled={!yearId}>
          + New exam
        </Button>
      </div>

      <label className="flex flex-col gap-1 text-sm max-w-xs">
        <span className="text-slate-600">Academic year</span>
        <select
          value={yearId ?? ""}
          onChange={(e) => setYearId(Number(e.target.value))}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
              {y.is_current ? " (current)" : ""}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>
      )}

      <div className="space-y-4">
        {exams.map((e) => (
          <Card key={e.id} className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">{e.name}</h3>
                  <Badge tone="brand">{kindLabel[e.kind]}</Badge>
                  {e.is_published ? (
                    <Badge tone="emerald">published</Badge>
                  ) : (
                    <Badge tone="amber">draft</Badge>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {e.start_date} → {e.end_date} · {e.papers_count} paper(s)
                  {e.total_marks_entered > 0 && (
                    <> · {e.total_marks_entered} marks entered</>
                  )}
                </div>

                {e.papers.length > 0 && (
                  <table className="mt-3 min-w-full text-sm">
                    <thead className="text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="py-1 font-medium">Subject</th>
                        <th className="py-1 font-medium">Class</th>
                        <th className="py-1 font-medium">Date</th>
                        <th className="py-1 font-medium">Max / Pass</th>
                        <th className="py-1 font-medium">Duration</th>
                        <th className="py-1 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {e.papers.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2 font-medium">
                            {p.subject_name}{" "}
                            <span className="text-xs text-slate-500">
                              ({p.subject_code})
                            </span>
                          </td>
                          <td className="py-2 text-slate-600">{p.class_name}</td>
                          <td className="py-2 text-slate-600">{p.exam_date}</td>
                          <td className="py-2">
                            {p.max_marks}/{p.pass_marks}
                          </td>
                          <td className="py-2 text-slate-600">
                            {p.duration_minutes ? `${p.duration_minutes} min` : "—"}
                          </td>
                          <td className="py-2 text-right">
                            {!e.is_published &&
                              p.marks_entered_count === 0 && (
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => removePaper(p)}
                                >
                                  Remove
                                </Button>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex flex-col gap-2">
                {!e.is_published && (
                  <Button size="sm" onClick={() => setPaperFor(e)}>
                    + Paper
                  </Button>
                )}
                {e.is_published && (
                  <Button size="sm" onClick={() => setBulkFor(e)}>
                    Report cards
                  </Button>
                )}
                {e.is_published ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPublished(e, false)}
                  >
                    Unpublish
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setPublished(e, true)}
                    disabled={e.papers_count === 0}
                  >
                    Publish
                  </Button>
                )}
                {!e.is_published && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(e)}
                  >
                    Edit
                  </Button>
                )}
                {!e.is_published && e.total_marks_entered === 0 && (
                  <Button size="sm" variant="danger" onClick={() => remove(e)}>
                    Delete
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
        {exams.length === 0 && (
          <Card className="p-8 text-center text-slate-500">
            No exams for this year yet — click <strong>New exam</strong>.
          </Card>
        )}
      </div>

      {openCreate && yearId && (
        <ExamFormModal
          existing={null}
          yearId={yearId}
          onClose={() => setOpenCreate(false)}
          onSaved={() => {
            setOpenCreate(false);
            setNotice("Exam created.");
            load();
          }}
        />
      )}
      {editing && (
        <ExamFormModal
          existing={editing}
          yearId={editing.academic_year_id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice("Exam updated.");
            load();
          }}
        />
      )}
      {paperFor && (
        <PaperFormModal
          exam={paperFor}
          onClose={() => setPaperFor(null)}
          onSaved={() => {
            setPaperFor(null);
            setNotice("Paper added.");
            load();
          }}
        />
      )}
      {bulkFor && (
        <BulkReportCardModal
          exam={bulkFor}
          onClose={() => setBulkFor(null)}
        />
      )}
    </div>
  );
}

function BulkReportCardModal({
  exam,
  onClose,
}: {
  exam: Exam;
  onClose: () => void;
}) {
  const classOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of exam.papers) {
      if (p.class_name) seen.set(p.class_name, p.class_name);
    }
    return Array.from(seen.values());
  }, [exam.papers]);

  const [allClasses, setAllClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState<number | "">("");
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState<number | "">("");
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SchoolClass[]>("/api/v1/school/classes", {
        params: { academic_year_id: exam.academic_year_id },
      })
      .then((r) => {
        const usable = r.data.filter((c) => classOptions.includes(c.name));
        setAllClasses(usable);
      })
      .catch((e) => setError(apiError(e)));
  }, [exam.academic_year_id, classOptions]);

  useEffect(() => {
    if (!classId) {
      setSections([]);
      return;
    }
    api
      .get<Section[]>(`/api/v1/school/classes/${classId}/sections`)
      .then((r) => setSections(r.data))
      .catch((e) => setError(apiError(e)));
  }, [classId]);

  async function download() {
    if (!sectionId) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await api.get<Blob>(
        `/api/v1/school/exams/${exam.id}/sections/${sectionId}/report-cards.pdf`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-cards-${exam.name.replace(/ /g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Bulk report cards — ${exam.name}`}>
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Generates one PDF containing the report card for every active student in
          the chosen section.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Class *</span>
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value ? Number(e.target.value) : "");
                setSectionId("");
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
            >
              <option value="">Select…</option>
              {allClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Section *</span>
            <select
              value={sectionId}
              onChange={(e) =>
                setSectionId(e.target.value ? Number(e.target.value) : "")
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
              disabled={!classId}
            >
              <option value="">Select…</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
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
          <Button onClick={download} loading={downloading} disabled={!sectionId}>
            Download PDF
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ExamFormModal({
  existing,
  yearId,
  onClose,
  onSaved,
}: {
  existing: Exam | null;
  yearId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    kind: (existing?.kind ?? "term") as ExamKind,
    start_date: existing?.start_date ?? "",
    end_date: existing?.end_date ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (existing) {
        await api.patch(`/api/v1/school/exams/${existing.id}`, form);
      } else {
        await api.post("/api/v1/school/exams", { ...form, academic_year_id: yearId });
      }
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={existing ? "Edit exam" : "New exam"}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Name *"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="e.g. Mid-term"
          required
        />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Kind *</span>
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as ExamKind })}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
          >
            <option value="unit_test">Unit test</option>
            <option value="mid_term">Mid-term</option>
            <option value="term">Term</option>
            <option value="final">Final</option>
            <option value="other">Other</option>
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Start date *"
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            required
          />
          <Input
            label="End date *"
            type="date"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            required
          />
        </div>
        {error && (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {existing ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PaperFormModal({
  exam,
  onClose,
  onSaved,
}: {
  exam: Exam;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState<number | "">("");
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [form, setForm] = useState({
    class_subject_id: "" as number | "",
    max_marks: 100,
    pass_marks: 35,
    exam_date: exam.start_date,
    duration_minutes: 90,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SchoolClass[]>("/api/v1/school/classes", {
        params: { academic_year_id: exam.academic_year_id },
      })
      .then((r) => setClasses(r.data))
      .catch((e) => setError(apiError(e)));
  }, [exam.academic_year_id]);

  useEffect(() => {
    if (!classId) {
      setClassSubjects([]);
      return;
    }
    api
      .get<ClassSubject[]>(`/api/v1/school/classes/${classId}/subjects`)
      .then((r) => setClassSubjects(r.data))
      .catch((e) => setError(apiError(e)));
  }, [classId]);

  const usedSubjectIds = useMemo(
    () => new Set(exam.papers.map((p) => p.class_subject_id)),
    [exam.papers]
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.class_subject_id) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/exams/${exam.id}/papers`, form);
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Add paper to ${exam.name}`} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Class *</span>
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value ? Number(e.target.value) : "");
                setForm({ ...form, class_subject_id: "" });
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
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
            <span className="text-sm font-medium text-slate-700">Subject *</span>
            <select
              value={form.class_subject_id}
              onChange={(e) =>
                setForm({
                  ...form,
                  class_subject_id: e.target.value ? Number(e.target.value) : "",
                })
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
              required
              disabled={!classId}
            >
              <option value="">Select…</option>
              {classSubjects.map((cs) => {
                const used = usedSubjectIds.has(cs.id);
                return (
                  <option key={cs.id} value={cs.id} disabled={used}>
                    {cs.subject.name} ({cs.subject.code})
                    {used ? " — already added" : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <Input
            label="Max marks *"
            type="number"
            min="1"
            max="999"
            value={form.max_marks}
            onChange={(e) => setForm({ ...form, max_marks: Number(e.target.value) })}
            required
          />
          <Input
            label="Pass marks *"
            type="number"
            min="0"
            max="999"
            value={form.pass_marks}
            onChange={(e) =>
              setForm({ ...form, pass_marks: Number(e.target.value) })
            }
            required
          />
          <Input
            label="Exam date *"
            type="date"
            value={form.exam_date}
            min={exam.start_date}
            max={exam.end_date}
            onChange={(e) => setForm({ ...form, exam_date: e.target.value })}
            required
          />
          <Input
            label="Duration (min)"
            type="number"
            min="1"
            max="600"
            value={form.duration_minutes}
            onChange={(e) =>
              setForm({ ...form, duration_minutes: Number(e.target.value) })
            }
          />
        </div>
        {error && (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Add paper
          </Button>
        </div>
      </form>
    </Modal>
  );
}
