"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";
import { dateTime, hhmm } from "@/lib/dates";

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
  room_id: number | null;
  room_name: string | null;
};

type ExamRoom = { id: number; name: string; capacity: number };

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

/** Building one section's week by hand.
 *
 *  The generator fills a week in bulk; this is for the corrections afterwards,
 *  and for the schools that would rather place every lesson themselves.
 */
export default function TimetableSetupPage() {
  return (
    <Suspense fallback={null}>
      <TimetableSetup />
    </Suspense>
  );
}

function TimetableSetup() {
  const search = useSearchParams();
  const preset = search.get("section");
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState<number | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState<number | "">("");
  const [sectionId, setSectionId] = useState<number | "">("");

  const [tt, setTt] = useState<Timetable | null>(null);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ period: Period; entry?: Entry } | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId]
  );

  useEffect(() => {
    api
      .get<AcademicYear[]>("/api/v1/school/academic-years")
      .then((r) => {
        setYears(r.data);
        const cur = r.data.find((y) => y.is_current) ?? r.data[0];
        if (cur) setYearId(cur.id);
      })
      .catch((e) => setError(apiError(e)));
  }, []);

  useEffect(() => {
    if (!yearId) return;
    api
      .get<SchoolClass[]>("/api/v1/school/classes", {
        params: { academic_year_id: yearId },
      })
      .then((r) => {
        setClasses(r.data);
        // Arriving from the dashboard with a section in the URL: find the
        // class that holds it, since the pickers cascade.
        const want = preset ? Number(preset) : null;
        const owner = want
          ? r.data.find((c) => c.sections.some((s) => s.id === want))
          : undefined;
        if (owner) {
          setClassId(owner.id);
          setSectionId(want as number);
        } else {
          setClassId("");
          setSectionId("");
        }
      })
      .catch((e) => setError(apiError(e)));
  }, [yearId, preset]);

  async function loadTimetable() {
    if (!sectionId || !classId) {
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

  useEffect(() => {
    loadTimetable();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, classId]);

  async function clearCell(periodId: number) {
    if (!sectionId) return;
    try {
      await api.delete(`/api/v1/school/sections/${sectionId}/timetable/${periodId}`);
      loadTimetable();
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
          ? "Published — parents and teachers can see it now."
          : "Unpublished."
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

  const periodNumbers = useMemo(
    () =>
      Array.from(new Set(tt?.periods.map((p) => p.period_number) ?? [])).sort(
        (a, b) => a - b
      ),
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
      <PageHeader
        title="Build a timetable"
        subtitle="Pick a section, then click any slot to put a subject in it."
        actions={
          tt && (
            <>
              <Link href="/school/timetable">
                <Button variant="secondary">All timetables</Button>
              </Link>
              <Button variant="secondary" onClick={() => setCopyOpen(true)}>
                Copy from…
              </Button>
              <Button
                variant={tt.timetable_published_at ? "secondary" : "primary"}
                onClick={togglePublish}
              >
                {tt.timetable_published_at ? "Unpublish" : "Publish"}
              </Button>
            </>
          )
        }
      />

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Select
            label="Year"
            value={yearId ?? ""}
            onChange={(e) => setYearId(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
          <Select
            label="Class"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value ? Number(e.target.value) : "");
              setSectionId("");
            }}
          >
            <option value="">Select…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            label="Section"
            value={sectionId}
            disabled={!selectedClass}
            onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select…</option>
            {selectedClass?.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <p className="ml-auto text-[12px] text-ink-subtle">
            Slots come from{" "}
            <Link className="font-bold text-brand-600 hover:underline" href="/school/periods">
              Periods
            </Link>
            .
          </p>
        </CardBody>
      </Card>

      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {tt && (
        <Card>
          <CardHeader>
            <CardTitle>{tt.section_label}</CardTitle>
            {tt.timetable_published_at ? (
              <Badge tone="emerald">
                Published {dateTime(tt.timetable_published_at)}
              </Badge>
            ) : (
              <Badge tone="amber">Draft</Badge>
            )}
          </CardHeader>
          <CardBody className="p-0">
            {/* A week never fits a phone, so the grid keeps its shape and
                scrolls inside the panel rather than squashing the columns. */}
            <div className="overflow-x-auto">
              <table className="min-w-[760px] border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                    <th className="w-28 border-b border-surface-border px-4 py-3">Period</th>
                    {DAYS.map((d, i) => (
                      <th key={i} className="border-b border-surface-border px-4 py-3">
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodNumbers.map((pn) => (
                    <tr key={pn}>
                      <td className="border-b border-surface-border px-4 py-2 text-[12px] font-bold tabular-nums text-ink-muted">
                        P{pn}
                      </td>
                      {DAYS.map((_, i) => {
                        const day = i + 1;
                        const period = periodMatrix[`${day}-${pn}`];
                        if (!period) {
                          return (
                            <td
                              key={day}
                              className="border-b border-surface-border bg-surface-subtle px-4 py-2 text-center text-[12px] text-ink-subtle"
                            >
                              —
                            </td>
                          );
                        }
                        const entry = entriesByPeriod.get(period.id);
                        return (
                          <td key={day} className="border-b border-surface-border px-2 py-2 align-top">
                            <button
                              onClick={() => setEditing({ period, entry })}
                              disabled={period.is_break}
                              className={
                                "block w-full rounded-lg border px-3 py-2 text-left text-[12px] transition-colors " +
                                (period.is_break
                                  ? "cursor-default border-transparent bg-warning-bg text-warning dark:bg-amber-500/15 dark:text-amber-200"
                                  : entry
                                  ? "border-transparent bg-brand-50 text-brand-600 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-200"
                                  : "border-dashed border-surface-border bg-surface-raised text-ink-subtle hover:bg-surface-hover hover:text-ink-muted")
                              }
                            >
                              <div className="text-[10px] tabular-nums text-ink-subtle">
                                {hhmm(period.start_time)} – {hhmm(period.end_time)}
                              </div>
                              {period.is_break ? (
                                <div className="mt-0.5 font-extrabold">
                                  {period.label ?? "Break"}
                                </div>
                              ) : entry ? (
                                <>
                                  <div className="mt-0.5 font-extrabold">{entry.subject_code}</div>
                                  <div className="text-[11px] text-ink-muted">
                                    {entry.teacher_name ?? "no teacher"}
                                  </div>
                                </>
                              ) : (
                                <div className="mt-0.5 font-bold">+ assign</div>
                              )}
                            </button>
                            {entry && !period.is_break && (
                              <button
                                onClick={() => clearCell(period.id)}
                                className="mt-1 text-[10px] font-bold text-danger hover:underline"
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
                        className="px-4 py-10 text-center text-[13px] text-ink-muted"
                      >
                        No periods set up yet. Add some in{" "}
                        <Link
                          href="/school/periods"
                          className="font-bold text-brand-600 hover:underline"
                        >
                          Periods
                        </Link>
                        .
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}

      {editing && sectionId && (
        <AssignCellModal
          period={editing.period}
          existingEntry={editing.entry}
          classSubjects={classSubjects}
          sectionId={Number(sectionId)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadTimetable();
          }}
        />
      )}

      {copyOpen && selectedClass && sectionId && (
        <CopyTimetableModal
          sectionId={Number(sectionId)}
          otherSections={selectedClass.sections.filter((s) => s.id !== sectionId)}
          onClose={() => setCopyOpen(false)}
          onDone={() => {
            setCopyOpen(false);
            setNotice("Copied.");
            loadTimetable();
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
  const [csId, setCsId] = useState<number | "">(existingEntry?.class_subject_id ?? "");
  const [roomId, setRoomId] = useState<number | "">(existingEntry?.room_id ?? "");
  const [rooms, setRooms] = useState<ExamRoom[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ExamRoom[]>("/api/v1/school/exam-ops/rooms")
      .then((r) => setRooms(r.data))
      .catch(() => setRooms([]));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!csId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.put(`/api/v1/school/sections/${sectionId}/timetable/${period.id}`, {
        class_subject_id: csId,
        // Most classes sit in their own room all day; it matters for the
        // shared ones, where two sections can be sent to the same lab.
        room_id: roomId === "" ? null : roomId,
      });
      onSaved();
    } catch (e) {
      // A 409 here names the other class the teacher is already in. Shown as
      // it comes back, because the fix depends on which one it is.
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Assign to P${period.period_number}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-[13px] text-ink-muted">
          Slot: <strong>{period.label ?? `Period ${period.period_number}`}</strong> (
          {hhmm(period.start_time)} – {hhmm(period.end_time)})
        </p>
        <div className="flex flex-col gap-1">
          <Select
            label="Subject"
            value={csId}
            onChange={(e) => setCsId(e.target.value ? Number(e.target.value) : "")}
            required
          >
            <option value="">Select…</option>
            {classSubjects.map((cs) => (
              <option key={cs.id} value={cs.id}>
                {cs.subject.name} ({cs.subject.code})
                {cs.teacher_user_id ? "" : " — no teacher"}
              </option>
            ))}
          </Select>
          <Select
            label="Room (optional)"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Their own classroom</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.capacity ? ` — seats ${r.capacity}` : ""}
              </option>
            ))}
          </Select>
          {classSubjects.length === 0 && (
            <span className="text-[12px] text-ink-muted">
              No subjects assigned to this class yet. Go to{" "}
              <Link href="/school/classes" className="font-bold text-brand-600 hover:underline">
                Classes → Subjects
              </Link>{" "}
              first.
            </span>
          )}
        </div>
        <ErrorBox>{error}</ErrorBox>
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
      await api.post(`/api/v1/school/sections/${sectionId}/timetable/copy`, {
        source_section_id: sourceId,
        overwrite,
      });
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
        <p className="text-[13px] text-ink-muted">
          No other sections in this class to copy from.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Select
            label="Source section"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : "")}
            required
          >
            <option value="">Select…</option>
            {otherSections.map((s) => (
              <option key={s.id} value={s.id}>
                Section {s.name}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
            />
            Overwrite what is already in this section
          </label>
          <p className="text-[12px] text-ink-subtle">
            A slot that would double-book a teacher is skipped rather than copied, so
            the result may be short of the source.
          </p>
          <ErrorBox>{error}</ErrorBox>
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
