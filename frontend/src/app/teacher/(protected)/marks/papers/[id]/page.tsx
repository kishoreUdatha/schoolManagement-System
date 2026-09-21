"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Status = "scored" | "absent" | "exempt";

type Section = { id: number; name: string };
type SchoolClass = { id: number; name: string; sections: Section[] };

type Row = {
  student_id: number;
  admission_no: string;
  roll_no: number;
  full_name: string;
  status: Status | null;
  marks_obtained: number | null;
  grade: string | null;
  is_pass: boolean | null;
  remark: string | null;
};

type View = {
  exam_id: number;
  exam_name: string;
  exam_paper_id: number;
  subject_name: string | null;
  subject_code: string | null;
  class_id: number;
  class_name: string | null;
  section_id: number;
  section_label: string | null;
  max_marks: number;
  pass_marks: number;
  exam_date: string;
  is_published: boolean;
  is_editable: boolean;
  rows: Row[];
  summary: {
    scored: number;
    absent: number;
    exempt: number;
    unmarked: number;
    pass: number;
    fail: number;
  };
};

const STATUSES: { value: Status; label: string; tone: "emerald" | "rose" | "neutral" }[] = [
  { value: "scored", label: "S", tone: "emerald" },
  { value: "absent", label: "A", tone: "rose" },
  { value: "exempt", label: "E", tone: "neutral" },
];

export default function MarksEntryPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const classIdParam = search.get("class_id");

  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState<number | "">("");
  const [view, setView] = useState<View | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!classIdParam) return;
    api
      .get<SchoolClass[]>("/api/v1/school/classes")
      .then((r) => {
        // School-class list isn't teacher-accessible; instead fetch class detail another way.
      })
      .catch(() => {});
    // We instead get sections via the my-classes endpoint
    api
      .get<{
        subject_teacher_of: {
          class_id: number;
          sections: { section_id: number; section_name: string }[];
        }[];
      }>("/api/v1/teacher/my-classes")
      .then((r) => {
        const cs = r.data.subject_teacher_of.find(
          (c) => c.class_id === Number(classIdParam)
        );
        const secs =
          cs?.sections.map((s) => ({ id: s.section_id, name: s.section_name })) ??
          [];
        setSections(secs);
        if (secs.length > 0) setSectionId(secs[0].id);
      })
      .catch((e) => setError(apiError(e)));
  }, [classIdParam]);

  async function load() {
    if (!sectionId) return;
    try {
      const { data } = await api.get<View>(
        `/api/v1/teacher/marks/papers/${params.id}?section_id=${sectionId}`
      );
      setView(data);
      setRows(data.rows);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId]);

  function setStatus(sid: number, s: Status) {
    setRows((prev) =>
      prev.map((r) =>
        r.student_id === sid
          ? {
              ...r,
              status: s,
              // Clear marks when switching to absent/exempt
              marks_obtained: s === "scored" ? r.marks_obtained ?? 0 : null,
            }
          : r
      )
    );
  }

  function setMarks(sid: number, marks: number | null) {
    setRows((prev) =>
      prev.map((r) => (r.student_id === sid ? { ...r, marks_obtained: marks } : r))
    );
  }

  function setRemark(sid: number, rk: string) {
    setRows((prev) =>
      prev.map((r) => (r.student_id === sid ? { ...r, remark: rk } : r))
    );
  }

  function previewGrade(marks: number | null): string {
    if (marks == null || !view) return "—";
    const pct = (marks / view.max_marks) * 100;
    if (pct >= 90) return "A+";
    if (pct >= 80) return "A";
    if (pct >= 70) return "B+";
    if (pct >= 60) return "B";
    if (pct >= 50) return "C";
    if (pct >= 40) return "D";
    return "F";
  }

  async function save() {
    if (!view || !sectionId) return;
    const entries = rows
      .filter((r) => r.status !== null)
      .map((r) => ({
        student_id: r.student_id,
        status: r.status,
        marks_obtained:
          r.status === "scored" ? r.marks_obtained ?? 0 : null,
        remark: r.remark || null,
      }));
    if (entries.length === 0) {
      setError("Nothing to save — mark at least one student.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post(
        `/api/v1/teacher/marks/papers/${params.id}/save`,
        { section_id: sectionId, entries }
      );
      if (data.errors && data.errors.length > 0) {
        setError(
          `Saved ${data.saved}, but ${data.errors.length} skipped: ` +
            data.errors
              .map((e: { error: string }) => e.error)
              .join("; ")
        );
      } else {
        setNotice(`Saved ${data.saved} entries.`);
      }
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  async function markAllAbsent() {
    if (!sectionId) return;
    if (
      !window.confirm("Mark all unmarked students as absent? Already-marked rows are not touched.")
    )
      return;
    try {
      const { data } = await api.post(
        `/api/v1/teacher/marks/papers/${params.id}/mark-all-absent?section_id=${sectionId}`
      );
      setNotice(`Marked ${data.saved} as absent.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  const canEdit = view?.is_editable ?? false;

  return (
    <div className="space-y-6">
      <Link href="/teacher/marks" className="text-sm text-brand-700 hover:underline">
        ← Back to all papers
      </Link>

      {view && (
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">
              {view.exam_name} — {view.subject_name}
            </h1>
            {view.is_published ? (
              <Badge tone="emerald">published</Badge>
            ) : (
              <Badge tone="amber">draft</Badge>
            )}
          </div>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            {view.class_name} · {view.exam_date} · max {view.max_marks} · pass{" "}
            {view.pass_marks}
          </p>
          {/* Forty scripts and a spreadsheet beats forty trips to a text box. */}
          <Link
            href={`/teacher/marks/papers/${params.id}/import${
              classIdParam ? `?class_id=${classIdParam}` : ""
            }`}
            className="mt-2 inline-block text-[13px] font-bold text-brand-600 hover:underline"
          >
            Upload marks from a spreadsheet
          </Link>
        </div>
      )}

      {sections.length === 0 ? (
        <Card className="p-6 text-center text-ink-muted">No sections in this class.</Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
              <span className="text-[12px] font-bold text-ink-muted">Section</span>
              <select
                value={sectionId}
                onChange={(e) =>
                  setSectionId(e.target.value ? Number(e.target.value) : "")
                }
                className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {canEdit && (
              <>
                <Button variant="secondary" size="sm" onClick={markAllAbsent}>
                  Mark all unmarked as absent
                </Button>
                <Button onClick={save} loading={saving}>
                  Save
                </Button>
              </>
            )}
          </div>

          {!canEdit && view && (
            <div className="rounded-md bg-surface-subtle px-3 py-2 text-sm text-ink-muted">
              Exam is published — marks are read-only. Ask school admin to
              unpublish if you need to edit.
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
          )}
          {notice && (
            <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>
          )}

          {view && (
            <>
              <div className="grid gap-3 sm:grid-cols-6">
                <StatCard label="Scored" value={view.summary.scored} accent="emerald" />
                <StatCard label="Absent" value={view.summary.absent} accent="rose" />
                <StatCard label="Exempt" value={view.summary.exempt} />
                <StatCard label="Unmarked" value={view.summary.unmarked} accent={view.summary.unmarked > 0 ? "amber" : "emerald"} />
                <StatCard label="Pass" value={view.summary.pass} accent="emerald" />
                <StatCard label="Fail" value={view.summary.fail} accent="rose" />
              </div>

              <Card>
                <table className="min-w-full divide-y divide-surface-border text-[13px]">
                  <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                    <tr>
                      <th className="px-4 py-3 font-bold">Roll</th>
                      <th className="px-4 py-3 font-bold">Name</th>
                      <th className="px-4 py-3 font-bold">Status</th>
                      <th className="px-4 py-3 font-bold">Marks</th>
                      <th className="px-4 py-3 font-bold">Grade</th>
                      <th className="px-4 py-3 font-bold">Pass</th>
                      <th className="px-4 py-3 font-bold">Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border">
                    {rows.map((r) => {
                      const liveGrade = r.status === "scored" ? previewGrade(r.marks_obtained) : r.grade ?? "—";
                      const livePass =
                        r.status === "scored" && r.marks_obtained != null && view
                          ? r.marks_obtained >= view.pass_marks
                          : r.is_pass;
                      return (
                        <tr key={r.student_id} className="hover:bg-surface-subtle">
                          <td className="px-4 py-3 text-[12px] tabular-nums text-ink-muted">{r.roll_no}</td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-ink">{r.full_name}</div>
                            <div className="text-xs text-ink-muted">{r.admission_no}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1">
                              {STATUSES.map((s) => {
                                const active = r.status === s.value;
                                return (
                                  <button
                                    key={s.value}
                                    type="button"
                                    disabled={!canEdit}
                                    onClick={() => setStatus(r.student_id, s.value)}
                                    className={cn(
                                      "w-8 h-8 rounded-md border text-xs font-bold transition disabled:opacity-50 disabled:cursor-not-allowed",
                                      active && s.tone === "emerald" && "border-emerald-600 bg-emerald-600 text-white",
                                      active && s.tone === "rose" && "border-rose-600 bg-rose-600 text-white",
                                      active && s.tone === "neutral" && "border-ink bg-ink text-surface-raised",
                                      !active && "border-surface-border bg-white text-ink-muted hover:bg-surface-subtle"
                                    )}
                                    title={s.value}
                                  >
                                    {s.label}
                                  </button>
                                );
                              })}
                              {!r.status && (
                                <Badge tone="neutral" className="ml-1 self-center">
                                  unmarked
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {r.status === "scored" ? (
                              <input
                                type="number"
                                min="0"
                                max={view.max_marks}
                                value={r.marks_obtained ?? ""}
                                onChange={(e) =>
                                  setMarks(
                                    r.student_id,
                                    e.target.value === "" ? null : Number(e.target.value)
                                  )
                                }
                                disabled={!canEdit}
                                className="w-20 rounded-md border border-surface-border px-2 py-1 text-sm disabled:bg-surface-subtle"
                              />
                            ) : (
                              <span className="text-xs text-ink-subtle">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              tone={
                                liveGrade === "—"
                                  ? "neutral"
                                  : liveGrade === "F"
                                  ? "rose"
                                  : liveGrade.startsWith("A")
                                  ? "emerald"
                                  : "brand"
                              }
                            >
                              {liveGrade}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {livePass == null ? (
                              "—"
                            ) : livePass ? (
                              <span className="text-emerald-700 font-medium">Pass</span>
                            ) : (
                              <span className="text-rose-700 font-medium">Fail</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={r.remark ?? ""}
                              onChange={(e) => setRemark(r.student_id, e.target.value)}
                              disabled={!canEdit}
                              placeholder={canEdit ? "optional" : ""}
                              className="w-full rounded-md border border-surface-border px-2 py-1 text-xs disabled:bg-surface-subtle"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
