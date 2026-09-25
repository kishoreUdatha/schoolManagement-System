"use client";

import {
  AlertTriangle,
  CalendarDays,
  Copy,
  Pencil,
  Plus,
  Send,
  UserSquare2,
} from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";
import { cn } from "@/lib/utils";

import { Segmented, TimetableFrame, type SideTab } from "./TimetableFrame";
import { DAY_NAMES, shortTime } from "./TimetableGrid";
import type {
  Clash,
  GridCell,
  Period,
  Scope,
  SectionEntry,
  SectionTimetable,
  TeacherLite,
  TeacherWeek,
} from "./types";

type ViewType = "class" | "teacher";

const selectCls =
  "w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink shadow-sm disabled:opacity-50";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-[9rem] flex-1 flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

/**
 * Timetable workspace for school admin, principal and HOD. The backend decides
 * which sections the user may manage (`/timetable/scope`), so the same UI
 * serves all three roles.
 */
export function TimetableWorkspace({
  heading = "Timetable",
  periodsHref,
}: {
  heading?: string;
  /** Link to period setup; only the school admin can edit periods. */
  periodsHref?: string;
}) {
  const [scope, setScope] = useState<Scope | null>(null);
  const [teachers, setTeachers] = useState<TeacherLite[]>([]);
  const [yearId, setYearId] = useState<number | "">("");
  const [classId, setClassId] = useState<number | "">("");
  const [sectionId, setSectionId] = useState<number | "">("");
  const [teacherId, setTeacherId] = useState<number | "">("");
  const [viewType, setViewType] = useState<ViewType>("class");
  const [editMode, setEditMode] = useState(false);

  const [tt, setTt] = useState<SectionTimetable | null>(null);
  const [tw, setTw] = useState<TeacherWeek | null>(null);
  const [clashes, setClashes] = useState<Clash[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ period: Period; entry?: SectionEntry } | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const classesInYear = useMemo(
    () => scope?.classes.filter((c) => c.academic_year_id === yearId) ?? [],
    [scope, yearId]
  );
  const selectedClass = classesInYear.find((c) => c.id === classId) ?? null;

  const loadClashes = useCallback(() => {
    api
      .get<Clash[]>("/api/v1/timetable/clashes")
      .then((r) => setClashes(r.data))
      .catch(() => setClashes([]));
  }, []);

  const loadScope = useCallback(async () => {
    const [s, t] = await Promise.all([
      api.get<Scope>("/api/v1/timetable/scope"),
      api.get<TeacherLite[]>("/api/v1/timetable/teachers"),
    ]);
    setScope(s.data);
    setTeachers(t.data);
    return s.data;
  }, []);

  useEffect(() => {
    loadScope()
      .then((s) => {
        const year =
          s.academic_years.find((y) => y.is_current) ?? s.academic_years[0];
        if (year) setYearId(year.id);
      })
      .catch((e) => setError(apiError(e)));
    loadClashes();
  }, [loadScope, loadClashes]);

  // Default to the first class/section of the chosen year, but keep the
  // current pick when scope is merely refreshed (e.g. after publishing).
  useEffect(() => {
    if (classesInYear.some((c) => c.id === classId)) return;
    const first = classesInYear[0];
    setClassId(first?.id ?? "");
    setSectionId(first?.sections[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classesInYear]);

  const loadSection = useCallback(async () => {
    if (!sectionId) {
      setTt(null);
      return;
    }
    try {
      const { data } = await api.get<SectionTimetable>(
        `/api/v1/timetable/sections/${sectionId}`
      );
      setTt(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }, [sectionId]);

  const loadTeacher = useCallback(async () => {
    if (!teacherId) {
      setTw(null);
      return;
    }
    try {
      const { data } = await api.get<TeacherWeek>(
        `/api/v1/timetable/teachers/${teacherId}`
      );
      setTw(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }, [teacherId]);

  useEffect(() => {
    if (viewType === "class") loadSection();
  }, [viewType, loadSection]);

  useEffect(() => {
    if (viewType === "teacher") loadTeacher();
  }, [viewType, loadTeacher]);

  useEffect(() => {
    if (viewType === "teacher" && !teacherId && teachers[0]) setTeacherId(teachers[0].id);
  }, [viewType, teacherId, teachers]);

  function afterChange(data?: SectionTimetable) {
    if (data) setTt(data);
    else loadSection();
    loadClashes();
  }

  async function togglePublish() {
    if (!tt) return;
    const path = tt.timetable_published_at ? "unpublish" : "publish";
    try {
      const { data } = await api.post<SectionTimetable>(
        `/api/v1/timetable/sections/${tt.section_id}/${path}`
      );
      setTt(data);
      setNotice(
        data.timetable_published_at
          ? "Timetable published — now visible to teachers and parents."
          : "Timetable moved back to draft."
      );
      loadScope();
    } catch (e) {
      setError(apiError(e));
    }
  }

  // ----- Build grid cells + side panel for the active view -----
  const classCells = useMemo(() => {
    const m = new Map<number, GridCell>();
    tt?.entries.forEach((e) =>
      m.set(e.period_id, {
        key: e.id,
        subject_name: e.subject_name,
        subject_code: e.subject_code,
        subtitle: e.teacher_name,
        notes: e.notes,
      })
    );
    return m;
  }, [tt]);

  const teacherCells = useMemo(() => {
    const m = new Map<number, GridCell>();
    tw?.entries.forEach((e) =>
      m.set(e.period_id, {
        key: e.id,
        subject_name: e.subject_name,
        subject_code: e.subject_code,
        subtitle: e.section_label,
        notes: e.notes,
        draft: !e.published,
      })
    );
    return m;
  }, [tw]);

  const openTeacher = useCallback(
    (id: number) => {
      if (!teachers.some((t) => t.id === id)) return;
      setTeacherId(id);
      setViewType("teacher");
      setEditMode(false);
    },
    [teachers]
  );

  const classSideTabs = useMemo<SideTab[]>(() => {
    if (!tt) return [];
    const count = new Map<number, number>();
    tt.entries.forEach((e) =>
      count.set(e.class_subject_id, (count.get(e.class_subject_id) ?? 0) + 1)
    );
    const subjects = tt.class_subjects.map((cs) => ({
      key: cs.id,
      title: cs.subject_name,
      subtitle: cs.teacher_name,
      count: count.get(cs.id) ?? 0,
      subject: { name: cs.subject_name, code: cs.subject_code },
    }));
    const byTeacher = new Map<number, { name: string; count: number; subjects: Set<string> }>();
    tt.entries.forEach((e) => {
      if (!e.teacher_user_id) return;
      const t = byTeacher.get(e.teacher_user_id) ?? {
        name: e.teacher_name ?? "—",
        count: 0,
        subjects: new Set<string>(),
      };
      t.count += 1;
      t.subjects.add(e.subject_name);
      byTeacher.set(e.teacher_user_id, t);
    });
    const teacherItems = Array.from(byTeacher.entries())
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([id, t]) => ({
        key: id,
        title: t.name,
        subtitle: Array.from(t.subjects).join(", "),
        count: t.count,
        onClick: teachers.some((x) => x.id === id) ? () => openTeacher(id) : undefined,
      }));
    return [
      { key: "subjects", label: "Subjects", items: subjects },
      { key: "teachers", label: "Teachers", items: teacherItems },
    ];
  }, [tt, teachers, openTeacher]);

  const teacherSideTabs = useMemo<SideTab[]>(() => {
    if (!tw) return [];
    const subj = new Map<string, { name: string; code: string; count: number }>();
    const secs = new Map<number, { label: string; count: number }>();
    tw.entries.forEach((e) => {
      const s = subj.get(e.subject_code) ?? { name: e.subject_name, code: e.subject_code, count: 0 };
      s.count += 1;
      subj.set(e.subject_code, s);
      const c = secs.get(e.section_id) ?? { label: e.section_label, count: 0 };
      c.count += 1;
      secs.set(e.section_id, c);
    });
    return [
      {
        key: "subjects",
        label: "Subjects",
        items: Array.from(subj.values()).map((s) => ({
          key: s.code,
          title: s.name,
          count: s.count,
          subject: { name: s.name, code: s.code },
        })),
      },
      {
        key: "sections",
        label: "Sections",
        items: Array.from(secs.entries()).map(([id, s]) => ({
          key: id,
          title: s.label,
          count: s.count,
        })),
      },
    ];
  }, [tw]);

  if (!scope) {
    return error ? (
      <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
    ) : (
      <div className="text-sm text-ink-muted">Loading…</div>
    );
  }

  const noSections = scope.classes.length === 0;
  const yearName = scope.academic_years.find((y) => y.id === yearId)?.name;
  const published = !!tt?.timetable_published_at;
  const canEditHere = viewType === "class" && !!tt;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div className="flex items-start gap-3">
          <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/15 text-brand-600">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-ink">{heading}</h1>
            <p className="mt-0.5 text-sm text-ink-muted">
              {scope.school_wide
                ? "Create, manage and view class-wise timetables"
                : "Create and manage timetables for the sections assigned to you"}
              {yearName ? ` for the academic year ${yearName}` : ""}.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <HeaderButton
            active={viewType === "class" && !editMode}
            onClick={() => {
              setViewType("class");
              setEditMode(false);
            }}
            icon={<CalendarDays className="h-4 w-4" />}
          >
            View Timetable
          </HeaderButton>
          <HeaderButton
            active={viewType === "teacher"}
            onClick={() => {
              setViewType("teacher");
              setEditMode(false);
            }}
            icon={<UserSquare2 className="h-4 w-4" />}
          >
            Teacher View
          </HeaderButton>
          <Button
            onClick={() => {
              setViewType("class");
              setEditMode(true);
            }}
            disabled={noSections}
            className="gap-2"
          >
            {editMode ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            Create / Edit Timetable
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="print:hidden">
        <CardBody className="flex flex-wrap items-end gap-4">
          <Field label="Academic Year">
            <select
              value={yearId}
              onChange={(e) => setYearId(e.target.value ? Number(e.target.value) : "")}
              className={selectCls}
            >
              {scope.academic_years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </Field>
          {viewType === "class" ? (
            <>
              <Field label="Class">
                <select
                  value={classId}
                  onChange={(e) => {
                    const id = e.target.value ? Number(e.target.value) : "";
                    setClassId(id);
                    const cls = classesInYear.find((c) => c.id === id);
                    setSectionId(cls?.sections[0]?.id ?? "");
                  }}
                  className={selectCls}
                >
                  {classesInYear.length === 0 && <option value="">No classes</option>}
                  {classesInYear.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Section">
                <select
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
                  className={selectCls}
                  disabled={!selectedClass}
                >
                  {selectedClass?.sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.published ? "" : " (draft)"}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : (
            <Field label="Teacher">
              <select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value ? Number(e.target.value) : "")}
                className={selectCls}
              >
                {teachers.length === 0 && <option value="">No teachers</option>}
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink">View Type</span>
            <Segmented
              value={viewType}
              onChange={(v) => {
                setViewType(v);
                if (v === "teacher") setEditMode(false);
              }}
              options={[
                { value: "class", label: "Class" },
                { value: "teacher", label: "Teacher" },
              ]}
            />
          </div>
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 print:hidden">{error}</div>
      )}
      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 print:hidden">
          <span className="whitespace-pre-line">{notice}</span>
          <button onClick={() => setNotice(null)} className="text-emerald-700/70 hover:text-emerald-700">
            ✕
          </button>
        </div>
      )}

      {noSections && (
        <Card>
          <CardBody className="text-sm text-ink-muted">
            {scope.school_wide
              ? "No classes or sections yet. Create them under Classes & Sections first."
              : "No sections are assigned to you yet. Ask your school admin to add you as HOD for your classes."}
          </CardBody>
        </Card>
      )}

      {viewType === "class" && tt && (
        <TimetableFrame
          key={`class-${tt.section_id}`}
          title={`${tt.class_name ?? ""} - Section ${tt.section_name ?? ""}`}
          subtitle={
            <>
              Weekly timetable
              {editMode && " · click any slot to assign or change a subject"}
            </>
          }
          badge={
            published ? (
              <Badge tone="emerald">Published</Badge>
            ) : (
              <Badge tone="amber">Draft</Badge>
            )
          }
          actions={
            editMode && canEditHere ? (
              <>
                <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setCopyOpen(true)}>
                  <Copy className="h-3.5 w-3.5" /> Copy from…
                </Button>
                <Button
                  variant={published ? "secondary" : "primary"}
                  size="sm"
                  className="gap-1.5"
                  onClick={togglePublish}
                >
                  <Send className="h-3.5 w-3.5" />
                  {published ? "Unpublish" : "Publish"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>
                  Done
                </Button>
              </>
            ) : null
          }
          periods={tt.periods}
          cells={classCells}
          editable={editMode}
          onCellClick={(period) =>
            setEditing({
              period,
              entry: tt.entries.find((e) => e.period_id === period.id),
            })
          }
          sideTabs={classSideTabs}
        />
      )}

      {viewType === "teacher" && tw && (
        <TimetableFrame
          key={`teacher-${tw.teacher_user_id}`}
          title={tw.teacher_name}
          subtitle={`Weekly timetable · ${tw.entries.length} class${tw.entries.length === 1 ? "" : "es"} across all sections`}
          periods={tw.periods}
          cells={teacherCells}
          sideTabs={teacherSideTabs}
        />
      )}

      {editMode && periodsHref && tt && (
        <p className="text-xs text-ink-subtle print:hidden">
          Period timings and breaks are set up under{" "}
          <a href={periodsHref} className="text-brand-600 hover:underline">
            Periods
          </a>
          .
        </p>
      )}

      {clashes.length > 0 && (
        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              Teacher clashes ({clashes.length})
            </CardTitle>
          </CardHeader>
          <CardBody className="grid gap-2 text-sm md:grid-cols-2">
            {clashes.map((c, i) => (
              <div key={i} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                <div className="font-medium text-rose-700">
                  {c.teacher_name} — {DAY_NAMES[c.day_of_week - 1]}, period {c.period_number}
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

      {editing && tt && (
        <AssignSlotModal
          timetable={tt}
          period={editing.period}
          entry={editing.entry}
          onClose={() => setEditing(null)}
          onSaved={(data) => {
            setEditing(null);
            afterChange(data);
          }}
        />
      )}

      {copyOpen && tt && selectedClass && (
        <CopyModal
          sectionId={tt.section_id}
          otherSections={selectedClass.sections.filter((s) => s.id !== tt.section_id)}
          onClose={() => setCopyOpen(false)}
          onDone={(data) => {
            setCopyOpen(false);
            setNotice(
              data.skipped.length
                ? `Copied, but ${data.skipped.length} slot(s) were skipped:\n• ${data.skipped.join("\n• ")}`
                : "Timetable copied."
            );
            afterChange(data);
          }}
        />
      )}
    </div>
  );
}

function HeaderButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition",
        active
          ? "border-brand-300 bg-brand-500/10 text-brand-600"
          : "border-surface-border bg-surface-raised text-ink-muted hover:bg-surface-hover hover:text-ink"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function AssignSlotModal({
  timetable,
  period,
  entry,
  onClose,
  onSaved,
}: {
  timetable: SectionTimetable;
  period: Period;
  entry?: SectionEntry;
  onClose: () => void;
  onSaved: (data?: SectionTimetable) => void;
}) {
  const [csId, setCsId] = useState<number | "">(entry?.class_subject_id ?? "");
  const [notes, setNotes] = useState(entry?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/v1/timetable/sections/${timetable.section_id}/slots/${period.id}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!csId) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.put<SectionTimetable>(base, {
        class_subject_id: csId,
        notes: notes.trim() || null,
      });
      onSaved(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      await api.delete(base);
      onSaved();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${DAY_NAMES[period.day_of_week - 1]} · ${period.label ?? `Period ${period.period_number}`}`}
    >
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ink-muted">
          {timetable.section_label} · {shortTime(period.start_time)} – {shortTime(period.end_time)}
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink">Subject *</span>
          <select
            value={csId}
            onChange={(e) => setCsId(e.target.value ? Number(e.target.value) : "")}
            className={selectCls}
            required
          >
            <option value="">Select…</option>
            {timetable.class_subjects.map((cs) => (
              <option key={cs.id} value={cs.id}>
                {cs.subject_name} — {cs.teacher_name ?? "no teacher"}
              </option>
            ))}
          </select>
          {timetable.class_subjects.length === 0 && (
            <span className="text-xs text-ink-subtle">
              No subjects are assigned to {timetable.class_name} yet. Add them under Classes → Subjects.
            </span>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-ink">Notes</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={200}
            placeholder="Optional, e.g. Lab session"
            className={selectCls}
          />
        </label>
        {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex items-center justify-between gap-2">
          {entry ? (
            <Button type="button" variant="danger" onClick={clear} disabled={busy}>
              Clear slot
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!csId}>
              Save
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function CopyModal({
  sectionId,
  otherSections,
  onClose,
  onDone,
}: {
  sectionId: number;
  otherSections: { id: number; name: string }[];
  onClose: () => void;
  onDone: (data: SectionTimetable) => void;
}) {
  const [sourceId, setSourceId] = useState<number | "">("");
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!sourceId) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<SectionTimetable>(
        `/api/v1/timetable/sections/${sectionId}/copy`,
        { source_section_id: sourceId, overwrite }
      );
      onDone(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Copy from another section">
      {otherSections.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No other sections of this class that you manage.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink">Source section *</span>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : "")}
              className={selectCls}
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
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="rounded border-surface-border"
            />
            Overwrite existing entries in this section
          </label>
          <p className="text-xs text-ink-subtle">
            Slots where the teacher is already busy in another section are skipped and listed afterwards.
          </p>
          {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Copy
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
