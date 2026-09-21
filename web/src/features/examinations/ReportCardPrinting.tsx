"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText } from "@/lib/api";
import { date, pct } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import type { SchoolClass } from "@/features/students/types";
import { useSearchParams } from "next/navigation";
import { ExamSelects, useExamChoice, useSetParam } from "./common";

type RemarkRow = {
  student_id: number;
  student_name: string;
  roll_no: number;
  percentage: number | null;
  grade: string | null;
  rank: number | null;
  attendance_percent: number | null;
  teacher_remark: string | null;
  principal_remark: string | null;
  can_edit: boolean;
};

type Settings = { show_rank: boolean; show_remarks: boolean; require_result_approval: boolean; principal_name: string | null };

/**
 * NEW-051, live: choose exam and section, GET
 * /school/exams/{exam}/sections/{section}/remarks for the class list, PUT
 * /school/exams/{exam}/students/{student}/remark per student, and open
 * GET /school/exams/{exam}/sections/{section}/report-cards.pdf.
 * GET /school/report-card-settings says what the printed card shows.
 */
export function ReportCardPrinting() {
  const c = useExamChoice();
  const params = useSearchParams();
  const setParam = useSetParam();
  const role = useSession()?.user.role;
  const principal = role === "principal" || role === "school_admin";
  const classes = useApi<SchoolClass[]>(c.exam ? "/api/v1/school/classes" : null, { academic_year_id: c.exam?.academic_year_id });
  const settings = useApi<Settings>("/api/v1/school/report-card-settings");
  const sections = (classes.data ?? []).flatMap((k) => k.sections.map((s) => ({ id: s.id, label: `${k.name} ${s.name}` })));
  const wanted = Number(params.get("section"));
  const section = sections.find((s) => s.id === wanted) ?? sections[0] ?? null;
  const rows = useApi<RemarkRow[]>(c.examId && section ? `/api/v1/school/exams/${c.examId}/sections/${section.id}/remarks` : null);
  const [busy, setBusy] = useState<"open" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = rows.data ?? [];
  const pdf = c.examId && section ? `/api/v1/school/exams/${c.examId}/sections/${section.id}/report-cards.pdf` : null;

  async function file(kind: "open" | "download") {
    if (!pdf || !section) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "open") await api.open(pdf);
      else await api.download(pdf, `report-cards-${(c.exam?.name ?? "exam").replace(/\W+/g, "-")}-${section.label.replace(/\W+/g, "-")}.pdf`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  const withTeacher = list.filter((r) => r.teacher_remark?.trim()).length;
  const withPrincipal = list.filter((r) => r.principal_remark?.trim()).length;
  const cfg = settings.data;
  const approvalMissing = Boolean(cfg?.require_result_approval && c.exam && !c.exam.results_approved_at);

  const stats = [
    { label: "Students", value: rows.data ? String(list.length) : "…", note: section ? section.label : "Choose a section" },
    { label: "Class teacher's remark", value: rows.data ? `${withTeacher} / ${list.length}` : "…", note: "Written so far" },
    { label: "Principal's remark", value: rows.data ? `${withPrincipal} / ${list.length}` : "…", note: "Written so far" },
    { label: "Results", value: c.exam ? (c.exam.is_published ? "Published" : "Not published") : "…", note: c.exam?.results_approved_at ? `Approved ${date(c.exam.results_approved_at)}` : "Not approved yet" },
  ];

  return (
    <>
      <div className="filterbar">
        <ExamSelects c={c} />
        <select aria-label="Section" value={section?.id ?? ""} onChange={(e) => setParam({ section: e.target.value })} disabled={!sections.length}>
          {!sections.length ? <option value="">{classes.loading ? "Loading sections…" : "No sections"}</option> : null}
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => file("download")} disabled={!pdf || busy !== null}>
          <Icon name="download" className="sm" />
          {busy === "download" ? "Preparing…" : "Download PDF"}
        </button>
        <button type="button" className="btn primary" onClick={() => file("open")} disabled={!pdf || busy !== null}>
          <Icon name="file" className="sm" />
          {busy === "open" ? "Preparing…" : "Open report cards"}
        </button>
      </div>
      <ErrorNote>{error ?? c.error ?? classes.error ?? rows.error}</ErrorNote>
      {approvalMissing ? (
        <div className="tip warn" style={{ marginBottom: 16 }}>
          <Icon name="bell" className="sm" />
          <span>This school requires results to be approved before report cards are printed, and this exam&apos;s results are not approved yet.</span>
        </div>
      ) : null}
      <StatStrip items={stats} compact />
      <div className="two-col">
        <Panel title="Remarks for the report card" sub={`${c.exam?.name ?? "Exam"}${section ? ` · ${section.label}` : ""}${rows.loading ? " · Loading…" : ""}`} flush>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Roll</th>
                  <th>Student</th>
                  <th>Result</th>
                  <th>Class teacher&apos;s remark</th>
                  <th>Principal&apos;s remark</th>
                  <th className="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <RemarkLine key={`${c.examId}-${r.student_id}`} examId={c.examId!} row={r} principal={principal} onSaved={rows.reload} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-empty" hidden={list.length > 0}>
            {rows.loading || c.examsLoading ? "Loading students…" : section ? "No active students in this section." : "Choose an exam and a section."}
          </div>
        </Panel>
        <aside className="stack">
          <div className="aside-panel">
            <h3>What the card shows</h3>
            {cfg ? (
              <dl className="kv">
                <div>
                  <dt>Rank</dt>
                  <dd>{cfg.show_rank ? "Shown" : "Hidden"}</dd>
                </div>
                <div>
                  <dt>Remarks</dt>
                  <dd>{cfg.show_remarks ? "Shown" : "Hidden"}</dd>
                </div>
                <div>
                  <dt>Approval before printing</dt>
                  <dd>{cfg.require_result_approval ? "Required" : "Not required"}</dd>
                </div>
                <div>
                  <dt>Signed by</dt>
                  <dd>{cfg.principal_name ?? "—"}</dd>
                </div>
              </dl>
            ) : (
              <p className="muted">{settings.error ?? "Loading…"}</p>
            )}
            <div className="gap" />
            <p>The PDF has one page per student in the section, with the marks, grade and the remarks saved here.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

function RemarkLine({ examId, row, principal, onSaved }: { examId: number; row: RemarkRow; principal: boolean; onSaved: () => void }) {
  const [teacher, setTeacher] = useState(row.teacher_remark ?? "");
  const [head, setHead] = useState(row.principal_remark ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTeacher(row.teacher_remark ?? "");
    setHead(row.principal_remark ?? "");
  }, [row.teacher_remark, row.principal_remark]);

  const body: { teacher_remark?: string; principal_remark?: string } = {};
  if (teacher !== (row.teacher_remark ?? "")) body.teacher_remark = teacher.trim();
  if (principal && head !== (row.principal_remark ?? "")) body.principal_remark = head.trim();
  const dirty = Object.keys(body).length > 0;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/v1/school/exams/${examId}/students/${row.student_id}/remark`, body);
      notify(`Remarks saved for ${row.student_name}.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td>{String(row.roll_no).padStart(2, "0")}</td>
      <td>
        {row.student_name}
        {error ? (
          <small style={{ display: "block", marginTop: 4 }}>
            <span className="badge bad">{error}</span>
          </small>
        ) : null}
      </td>
      <td>{`${row.percentage === null ? "—" : pct(row.percentage)}${row.grade && row.grade !== "—" ? ` · ${row.grade}` : ""}${row.rank ? ` · rank ${row.rank}` : ""}`}</td>
      <td>
        <textarea rows={2} maxLength={2000} value={teacher} onChange={(e) => setTeacher(e.target.value)} disabled={!row.can_edit} aria-label={`Class teacher's remark for ${row.student_name}`} style={{ width: "100%", minWidth: 180 }} />
      </td>
      <td>
        <textarea
          rows={2}
          maxLength={2000}
          value={head}
          onChange={(e) => setHead(e.target.value)}
          disabled={!row.can_edit || !principal}
          title={principal ? undefined : "Only the principal writes the principal's remark"}
          aria-label={`Principal's remark for ${row.student_name}`}
          style={{ width: "100%", minWidth: 180 }}
        />
      </td>
      <td className="right">
        <button type="button" className={`btn ${dirty ? "primary" : ""}`} onClick={save} disabled={!dirty || saving || !row.can_edit}>
          {saving ? "Saving…" : "Save"}
        </button>
      </td>
    </tr>
  );
}
