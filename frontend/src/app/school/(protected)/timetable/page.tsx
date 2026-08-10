"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type AcademicYear = { id: number; name: string; is_current: boolean };
type SectionLite = { id: number; name: string; capacity: number };
type SchoolClass = { id: number; name: string; sections: SectionLite[] };

type Period = {
  id: number;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  label: string | null;
  is_break: boolean;
};

type Entry = {
  id: number;
  section_id: number;
  period_id: number;
  class_subject_id: number;
  subject_name: string;
  subject_code: string;
  teacher_user_id: number | null;
  teacher_name: string | null;
};

type Timetable = {
  section_id: number;
  section_label: string | null;
  timetable_published_at: string | null;
  periods: Period[];
  entries: Entry[];
};

type ClassSubject = {
  id: number;
  class_id: number;
  subject_id: number;
  is_optional: boolean;
  teacher_user_id: number | null;
  subject: { id: number; name: string; code: string };
};

type Clash = {
  teacher_user_id: number;
  teacher_name: string | null;
  day_of_week: number;
  period_number: number;
  sections: { section_id: number; section_label: string; subject_name: string }[];
};

function trim(t: string) {
  return t?.slice(0, 5) ?? "";
}

export default function TimetablePage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState<number | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState<number | "">("");
  const [sectionId, setSectionId] = useState<number | "">("");

  const [tt, setTt] = useState<Timetable | null>(null);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [clashes, setClashes] = useState<Clash[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ period: Period; entry?: Entry } | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId]
  );

  async function loadYears() {
    const { data } = await api.get<AcademicYear[]>("/api/v1/school/academic-years");
    setYears(data);
    if (yearId == null) {
      const cur = data.find((y) => y.is_current) ?? data[0];
      if (cur) setYearId(cur.id);
    }
  }

  async function loadClasses(yId: number) {
    const { data } = await api.get<SchoolClass[]>("/api/v1/school/classes", {
      params: { academic_year_id: yId },
    });
    setClasses(data);
  }

  async function loadTimetable() {
    if (!sectionId) {
      setTt(null);
      return;
    }
    try {
      const [ttRes, csRes] = await Promise.all([
        api.get<Timetable>(`/api/v1/school/sections/${sectionId}/timetable`),
        api.get<ClassSubject[]>(`/api/v1/school/classes/${classId}/subjects`),
      ]);
      setTt(ttRes.data);
      setClassSubjects(csRes.data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function loadClashes() {
    try {
      const { data } = await api.get<Clash[]>("/api/v1/school/sections/clashes");
      setClashes(data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    loadYears();
    loadClashes();
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
    loadTimetable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, classId]);

  async function clearCell(periodId: number) {
    if (!sectionId) return;
    try {
      await api.delete(
        `/api/v1/school/sections/${sectionId}/timetable/${periodId}`
      );
      loadTimetable();
      loadClashes();
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function togglePublish() {
    if (!sectionId || !tt) return;
    const path = tt.timetable_published_at ? "unpublish" : "publish";
    try {
      const { data } = await api.post<Timetable>(
        `/api/v1/school/sections/${sectionId}/timetable/${path}`
      );
      setTt(data);
      setNotice(
        data.timetable_published_at
          ? "Timetable published — visible to parents and teachers."
          : "Timetable unpublished."
      );
    } catch (e) {
      setError(apiError(e));
    }
  }

  const entriesByPeriod = useMemo(() => {
    const m = new Map<number, Entry>();
    tt?.entries.forEach((e) => m.set(e.period_id, e));
    return m;
  }, [tt]);

  // Group periods by period_number into rows; columns are days
  const periodNumbers = useMemo(
    () =>
      Array.from(
        new Set(tt?.periods.map((p) => p.period_number) ?? [])
      ).sort((a, b) => a - b),
    [tt]
  );
  const periodMatrix = useMemo(() => {
    const m: Record<string, Period | undefined> = {};
    tt?.periods.forEach((p) => {
      m[`${p.day_of_week}-${p.period_number}`] = p;
    });
    return m;
  }, [tt]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Timetable</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pick a section, then click any slot to assign a subject. Period
            slots come from{" "}
            <Link className="text-brand-700 hover:underline" href="/school/periods">
              Periods
            </Link>
            .
          </p>
        </div>
        {tt && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCopyOpen(true)}>
              Copy from…
            </Button>
            <Button
              variant={tt.timetable_published_at ? "secondary" : "primary"}
              onClick={togglePublish}
            >
              {tt.timetable_published_at ? "Unpublish" : "Publish"}
            </Button>
          </div>
        )}
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Year</span>
          <select
            value={yearId ?? ""}
            onChange={(e) => setYearId(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Class</span>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value ? Number(e.target.value) : "");
              setSectionId("");
            }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">Select…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Section</span>
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
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
      </form>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>
      )}

      {tt && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">
              <strong>{tt.section_label}</strong>
            </span>
            {tt.timetable_published_at ? (
              <Badge tone="emerald">
                published {new Date(tt.timetable_published_at).toLocaleDateString()}
              </Badge>
            ) : (
              <Badge tone="amber">draft</Badge>
            )}
          </div>

          <Card>
            <table className="min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-slate-50 text-xs uppercase text-slate-500">
                  <th className="w-32 border-b border-slate-200 px-3 py-2 text-left font-medium">
                    Period
                  </th>
                  {DAYS.map((d, i) => (
                    <th
                      key={i}
                      className="border-b border-slate-200 px-3 py-2 text-left font-medium"
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periodNumbers.map((pn) => (
                  <tr key={pn}>
                    <td className="border-b border-slate-100 px-3 py-2 font-mono text-xs text-slate-500">
                      P{pn}
                    </td>
                    {DAYS.map((_, i) => {
                      const day = i + 1;
                      const period = periodMatrix[`${day}-${pn}`];
                      if (!period) {
                        return (
                          <td
                            key={day}
                            className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-300"
                          >
                            —
                          </td>
                        );
                      }
                      const entry = entriesByPeriod.get(period.id);
                      return (
                        <td
                          key={day}
                          className="border-b border-slate-100 px-2 py-2"
                        >
                          <button
                            onClick={() => setEditing({ period, entry })}
                            disabled={period.is_break}
                            className={
                              "block w-full rounded-md border px-2 py-1.5 text-left text-xs transition " +
                              (period.is_break
                                ? "border-amber-200 bg-amber-50 text-amber-700 cursor-default"
                                : entry
                                ? "border-brand-200 bg-brand-50 text-brand-900 hover:bg-brand-100"
                                : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50")
                            }
                          >
                            <div className="font-mono text-[10px] text-slate-400">
                              {trim(period.start_time)} – {trim(period.end_time)}
                            </div>
                            {period.is_break ? (
                              <div className="font-semibold">
                                {period.label ?? "Break"}
                              </div>
                            ) : entry ? (
                              <>
                                <div className="mt-0.5 font-semibold">
                                  {entry.subject_code}
                                </div>
                                <div className="text-[11px] text-slate-600">
                                  {entry.teacher_name ?? "no teacher"}
                                </div>
                              </>
                            ) : (
                              <div className="mt-0.5">+ assign</div>
                            )}
                          </button>
                          {entry && !period.is_break && (
                            <button
                              onClick={() => clearCell(period.id)}
                              className="mt-1 text-[10px] text-rose-600 hover:underline"
                            >
                              clear
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {periodNumbers.length === 0 && (
                  <tr>
                    <td
                      colSpan={DAYS.length + 1}
                      className="px-3 py-6 text-center text-slate-500"
                    >
                      No periods defined yet. Add some in{" "}
                      <Link
                        href="/school/periods"
                        className="font-medium text-brand-700 hover:underline"
                      >
                        Periods
                      </Link>
                      .
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {clashes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>School-wide teacher clashes ({clashes.length})</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            {clashes.map((c, i) => (
              <div
                key={i}
                className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2"
              >
                <div className="font-medium text-rose-700">
                  {c.teacher_name} — {DAYS[c.day_of_week - 1]} period{" "}
                  {c.period_number}
                </div>
                <ul className="mt-1 list-disc pl-5 text-xs text-rose-900">
                  {c.sections.map((s, j) => (
                    <li key={j}>
                      {s.section_label} — {s.subject_name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {editing && (
        <AssignCellModal
          period={editing.period}
          existingEntry={editing.entry}
          classSubjects={classSubjects}
          sectionId={Number(sectionId)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadTimetable();
            loadClashes();
          }}
        />
      )}

      {copyOpen && selectedClass && sectionId && (
        <CopyTimetableModal
          sectionId={Number(sectionId)}
          otherSections={selectedClass.sections.filter(
            (s) => s.id !== sectionId
          )}
          onClose={() => setCopyOpen(false)}
          onDone={() => {
            setCopyOpen(false);
            setNotice("Copied.");
            loadTimetable();
            loadClashes();
          }}
        />
      )}
    </div>
  );
}

function AssignCellModal({
  period,
  existingEntry,
  classSubjects,
  sectionId,
  onClose,
  onSaved,
}: {
  period: Period;
  existingEntry?: Entry;
  classSubjects: ClassSubject[];
  sectionId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [csId, setCsId] = useState<number | "">(
    existingEntry?.class_subject_id ?? ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!csId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.put(
        `/api/v1/school/sections/${sectionId}/timetable/${period.id}`,
        { class_subject_id: csId }
      );
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Assign to P${period.period_number}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">
          Slot: <strong>{period.label ?? `Period ${period.period_number}`}</strong>{" "}
          ({trim(period.start_time)} – {trim(period.end_time)})
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Subject *</span>
          <select
            value={csId}
            onChange={(e) => setCsId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
            required
          >
            <option value="">Select…</option>
            {classSubjects.map((cs) => (
              <option key={cs.id} value={cs.id}>
                {cs.subject.name} ({cs.subject.code})
                {cs.teacher_user_id ? "" : " — no teacher"}
              </option>
            ))}
          </select>
          {classSubjects.length === 0 && (
            <span className="text-xs text-slate-500">
              No subjects assigned to this class yet. Go to{" "}
              <Link href="/school/classes" className="text-brand-700 hover:underline">
                Classes → Subjects
              </Link>{" "}
              first.
            </span>
          )}
        </label>
        {error && (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} disabled={!csId}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CopyTimetableModal({
  sectionId,
  otherSections,
  onClose,
  onDone,
}: {
  sectionId: number;
  otherSections: SectionLite[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [sourceId, setSourceId] = useState<number | "">("");
  const [overwrite, setOverwrite] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!sourceId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(
        `/api/v1/school/sections/${sectionId}/timetable/copy`,
        { source_section_id: sourceId, overwrite }
      );
      onDone();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Copy from another section">
      {otherSections.length === 0 ? (
        <p className="text-sm text-slate-500">
          No other sections in this class to copy from.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Source section *</span>
            <select
              value={sourceId}
              onChange={(e) =>
                setSourceId(e.target.value ? Number(e.target.value) : "")
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
              required
            >
              <option value="">Select…</option>
              {otherSections.map((s) => (
                <option key={s.id} value={s.id}>
                  Section {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="rounded border-slate-300"
            />
            Overwrite existing entries in this section
          </label>
          {error && (
            <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Copy
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
