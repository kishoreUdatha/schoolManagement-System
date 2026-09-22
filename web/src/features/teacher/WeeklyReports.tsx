"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, pct } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, KV, Note, addDays, mondayOf, usePageAction } from "@/features/self/kit";
import type { MyClasses, WeeklyReport } from "./types";

const BASE = "/api/v1/teacher/weekly-reports";

/** The Monday of a picked YYYY-MM-DD date. */
const snap = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? mondayOf(new Date(y, m - 1, d)) : iso;
};

/**
 * NEW-095, live: GET /teacher/weekly-reports (?section_id=&week_start=) for a
 * class teacher's section and week, POST /teacher/weekly-reports/generate to
 * build (or rebuild) every student's report from attendance, homework, marks
 * and behaviour, and PATCH /teacher/weekly-reports/{id} for the remark and
 * sharing with parents. Sections from /teacher/my-classes.
 */
export function WeeklyReports() {
  const classes = useApi<MyClasses>("/api/v1/teacher/my-classes");
  const sections = useMemo(() => classes.data?.class_teacher_of ?? [], [classes.data]);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [week, setWeek] = useState(() => addDays(mondayOf(), -7));
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sectionId === null && sections.length) setSectionId((sections.find((s) => s.is_current_year) ?? sections[0]).section_id);
  }, [sections, sectionId]);

  usePageAction(
    "generate",
    useCallback(() => setGenerating(true), []),
  );

  const list = useApi<WeeklyReport[]>(sectionId ? BASE : null, { section_id: sectionId, week_start: week });
  const all = useMemo(() => list.data ?? [], [list.data]);
  const q = search.trim().toLowerCase();
  const items = all.filter((r) => !q || `${r.student_name ?? ""} ${r.student_admission_no ?? ""}`.toLowerCase().includes(q));
  const section = sections.find((s) => s.section_id === sectionId);
  const ready = list.data !== null;
  const mean = (f: (r: WeeklyReport) => number | null) => {
    const v = all.map(f).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const shared = all.filter((r) => r.shared_at).length;
  const stats = [
    { label: "Reports", value: ready ? String(all.length) : "…", note: `${section?.student_count ?? "…"} student(s) in ${section?.section_label ?? "the class"}` },
    { label: "Shared with parents", value: ready ? String(shared) : "…", note: `${all.length - shared} not shared` },
    { label: "Attendance", value: ready ? pct(mean((r) => (r.attendance_marked ? r.attendance_pct : null))) : "…", note: "Class average this week" },
    { label: "Homework submitted", value: ready ? pct(mean((r) => (r.homework_total ? r.homework_submission_pct : null))) : "…", note: "Class average this week" },
  ];

  const rows: Row[] = items.map((r) => [
    { name: r.student_name ?? `Student ${r.student_id}`, sub: r.student_admission_no ?? undefined },
    r.attendance_marked ? `${r.attendance_pct.toFixed(0)}%` : "—",
    r.homework_total ? `${r.homework_submitted} / ${r.homework_total}` : "—",
    r.marks_summary?.papers ? `${pct(r.marks_summary.avg_pct ?? null)} · ${r.marks_summary.papers} paper(s)` : "—",
    r.behaviour_avg === null ? "—" : `${r.behaviour_avg.toFixed(1)} / 5`,
    r.teacher_remark ?? "—",
    r.shared_at ? "Shared" : "Not shared (draft)",
  ]);

  async function toggleShare(r: WeeklyReport) {
    setError(null);
    try {
      await api.patch(`${BASE}/${r.id}`, { share_with_parents: !r.shared_at });
      notify(r.shared_at ? `${r.student_name ?? "Report"} is no longer shared.` : `${r.student_name ?? "Report"} shared with parents.`);
      list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const done = (msg: string) => {
    notify(msg);
    setGenerating(false);
    setEditing(null);
    list.reload();
  };

  if (classes.data && !sections.length) {
    return <Note>Weekly progress reports are prepared by a section&apos;s class teacher. You are not the class teacher of any section.</Note>;
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students…" aria-label="Search students" />
        </div>
        <select aria-label="Section" value={sectionId ?? ""} onChange={(e) => setSectionId(Number(e.target.value))}>
          {sections.map((s) => (
            <option key={s.section_id} value={s.section_id}>
              {`${s.section_label} · ${s.academic_year_name}`}
            </option>
          ))}
        </select>
        <button type="button" className="btn" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}>
          ‹
        </button>
        <input type="date" aria-label="Week starting" value={week} onChange={(e) => e.target.value && setWeek(snap(e.target.value))} />
        <button type="button" className="btn" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}>
          ›
        </button>
      </div>
      <ErrorNote>{error ?? classes.error ?? list.error}</ErrorNote>
      <Panel
        title={`Week of ${date(week)} – ${date(addDays(week, 6))}`}
        sub={`${section?.section_label ?? "Class"} · attendance, homework, marks and behaviour per student${list.loading ? " · Loading…" : ""}`}
        action={
          all.length ? (
            <button type="button" className="btn" onClick={() => setGenerating(true)}>
              Refresh figures
            </button>
          ) : undefined
        }
        flush
      >
        <DataTable
          columns={["Student", "Attendance", "Homework", "Marks", "Behaviour", "Observation", "Status"]}
          rows={rows}
          selectable={false}
          actions={(i) => (
            <>
              <button type="button" className="btn" onClick={() => setEditing(items[i])}>
                Remark
              </button>
              <button type="button" className="btn" onClick={() => toggleShare(items[i])}>
                {items[i].shared_at ? "Unshare" : "Share"}
              </button>
            </>
          )}
          empty={list.loading || classes.loading ? "Loading…" : all.length ? "No student matches the search." : "No reports for this week yet. Use Generate reports to build them."}
        />
      </Panel>

      {generating && sectionId ? (
        <GenerateDialog sectionId={sectionId} label={section?.section_label ?? "the class"} week={week} existing={all.length} onClose={() => setGenerating(false)} onDone={done} />
      ) : null}
      {editing ? <RemarkDialog report={editing} onClose={() => setEditing(null)} onDone={done} /> : null}
    </>
  );
}

/** POST /teacher/weekly-reports/generate for every active student in the section. */
function GenerateDialog({ sectionId, label, week, existing, onClose, onDone }: { sectionId: number; label: string; week: string; existing: number; onClose: () => void; onDone: (msg: string) => void }) {
  const [remark, setRemark] = useState("");
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(_e: FormEvent<HTMLFormElement>) {
    setBusy(true);
    setError(null);
    try {
      const made = await api.post<WeeklyReport[]>(`${BASE}/generate`, { section_id: sectionId, week_start: week, teacher_remark: remark.trim() || null, share_with_parents: share });
      onDone(`${made.length} weekly report(s) ${existing ? "refreshed" : "generated"}${share ? " and shared with parents" : ""}.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      title={`${existing ? "Refresh" : "Generate"} weekly reports · ${label}`}
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            <Icon name="check" className="sm" />
            {busy ? "Generating…" : existing ? "Refresh reports" : "Generate reports"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <p className="small muted" style={{ marginBottom: 14 }}>
        {`One report per student for ${date(week)} – ${date(addDays(week, 6))}, from the attendance register, homework submissions, published marks and the latest behaviour rating.${existing ? " Existing reports get fresh figures." : ""}`}
      </p>
      <div className="form-grid">
        <Field label="Remark for every student" full>
          <textarea maxLength={2000} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Optional. You can write a personal remark per student afterwards." />
        </Field>
        <label className="row small" style={{ gap: 8 }}>
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
          Share with parents now
        </label>
      </div>
    </Dialog>
  );
}

/** PATCH /teacher/weekly-reports/{id}: the teacher's remark and whether parents see it. */
function RemarkDialog({ report, onClose, onDone }: { report: WeeklyReport; onClose: () => void; onDone: (msg: string) => void }) {
  const [remark, setRemark] = useState(report.teacher_remark ?? "");
  const [share, setShare] = useState(Boolean(report.shared_at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = report.student_name ?? `Student ${report.student_id}`;

  async function submit(_e: FormEvent<HTMLFormElement>) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`${BASE}/${report.id}`, { teacher_remark: remark.trim(), share_with_parents: share });
      onDone(`Report for ${name} saved.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const r = report;
  return (
    <Dialog
      open
      wide
      title={`Weekly report · ${name}`}
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            <Icon name="check" className="sm" />
            {busy ? "Saving…" : "Save report"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <KV
        rows={[
          ["Week", `${date(r.week_start)} – ${date(r.week_end)}`],
          [
            "Attendance",
            r.attendance_marked
              ? `${pct(r.attendance_pct)} · ${r.attendance_present} present, ${r.attendance_late} late, ${r.attendance_half_day} half day, ${r.attendance_absent} absent`
              : "Not marked this week",
          ],
          ["Homework", r.homework_total ? `${r.homework_submitted} of ${r.homework_total} submitted (${pct(r.homework_submission_pct)})` : "None set this week"],
          ["Marks", r.marks_summary?.papers ? `${pct(r.marks_summary.avg_pct ?? null)} average over ${r.marks_summary.papers} paper(s) · pass rate ${pct(r.marks_summary.pass_rate_pct ?? null)}` : "No published marks this week"],
          ["Behaviour", r.behaviour_avg === null ? "Not rated" : `${r.behaviour_avg.toFixed(1)} / 5 (latest rating)`],
          ["Generated", `${r.generated_by_name ?? "—"} · ${dateTime(r.created_at)}`],
          ["Shared", r.shared_at ? dateTime(r.shared_at) : "Not yet"],
        ]}
      />
      <div className="form-grid" style={{ marginTop: 16 }}>
        <Field label="Your remark" full>
          <textarea maxLength={2000} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="A line for the parents about this week" />
        </Field>
        <label className="row small" style={{ gap: 8 }}>
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
          Parents can see this report
        </label>
      </div>
    </Dialog>
  );
}
