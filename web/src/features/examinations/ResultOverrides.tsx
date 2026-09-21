"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText, type Paginated } from "@/lib/api";
import { dateTime, pct } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import type { Student } from "@/features/students/types";
import { Field, usePageAction } from "@/features/onlinetests/kit";
import { useSetParam } from "./common";
import type { Exam, ExamResult } from "./types";

type Status = "normal" | "withheld" | "pass_by_grace" | "failed";
type Decision = {
  id: number;
  exam_id: number;
  exam_name: string | null;
  student_id: number;
  student_name: string | null;
  student_admission_no: string | null;
  result_status: Status;
  reason: string;
  parent_note: string | null;
  version_no: number;
  decided_by_name: string | null;
  decided_at: string | null;
};

const base = "/api/v1/school/result-decisions";
const STATUS: Record<Status, string> = { normal: "Normal (as computed)", withheld: "Withheld", pass_by_grace: "Passed by grace", failed: "Failed" };
const EFFECT: Record<Status, string> = {
  normal: "The result goes back to what the marks say.",
  withheld: "Families will not see the result until the decision is lifted.",
  pass_by_grace: "The student is shown as passed, whatever the marks say.",
  failed: "The student is shown as failed, whatever the marks say.",
};

/**
 * NEW-050, live: GET/POST /school/result-decisions, GET/PATCH/DELETE
 * /school/result-decisions/{id} (?id= opens one), the computed result from
 * GET /school/result-decisions/exams/{exam}/students/{student}, and
 * GET /school/exams, /school/students to choose. The marks are never
 * touched; the decision sits on top of them. The server records who
 * decided and when from the signed-in user.
 */
export function ResultOverrides() {
  const params = useSearchParams();
  const setParam = useSetParam();
  const openId = params.get("id");
  const [examId, setExamId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exams = useApi<Exam[]>("/api/v1/school/exams");
  const list = useApi<Decision[]>(base, { exam_id: examId });
  const opened = useApi<Decision>(openId ? `${base}/${openId}` : null);

  usePageAction(
    "add",
    useCallback(() => setCreating(true), []),
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter(
      (d) => (!status || d.result_status === status) && (!q || (d.student_name ?? "").toLowerCase().includes(q) || (d.student_admission_no ?? "").toLowerCase().includes(q)),
    );
  }, [list.data, status, search]);

  const all = list.data;
  const n = (s: Status) => (all ? String(all.filter((d) => d.result_status === s).length) : "…");
  const stats = [
    { label: "Decisions", value: all ? String(all.length) : "…", note: examId ? "On this exam" : "On all exams" },
    { label: "Withheld", value: n("withheld"), note: "Hidden from families" },
    { label: "Passed by grace", value: n("pass_by_grace"), note: "Passed despite the marks" },
    { label: "Failed", value: n("failed"), note: "Failed despite the marks" },
  ];

  const rows: Row[] = shown.map((d) => [
    { name: d.student_name ?? `Student ${d.student_id}`, sub: d.student_admission_no ?? undefined },
    d.exam_name ?? `Exam ${d.exam_id}`,
    STATUS[d.result_status],
    d.reason,
    d.decided_by_name ?? "—",
    dateTime(d.decided_at),
  ]);

  async function lift(d: Decision) {
    if (!window.confirm(`Lift the decision on ${d.student_name}'s ${d.exam_name} result? It goes back to what the marks say.`)) return;
    setError(null);
    try {
      await api.delete(`${base}/${d.id}`);
      notify(`${d.student_name}'s result is back to normal.`);
      list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const editing = openId && opened.data?.id === Number(openId) ? opened.data : null;

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by student or admission number…" aria-label="Search decisions" />
        </div>
        <select aria-label="Exam" value={examId} onChange={(e) => setExamId(e.target.value)}>
          <option value="">All exams</option>
          {exams.data?.map((x) => (
            <option key={x.id} value={x.id}>
              {`${x.name}${x.academic_year_name ? ` · ${x.academic_year_name}` : ""}`}
            </option>
          ))}
        </select>
        <select aria-label="Decision" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All decisions</option>
          <option value="withheld">Withheld</option>
          <option value="pass_by_grace">Passed by grace</option>
          <option value="failed">Failed</option>
        </select>
      </div>
      <ErrorNote>{error ?? list.error ?? exams.error ?? opened.error}</ErrorNote>
      <Panel title="Result decisions" sub={`Withheld, passed by grace or failed — on top of the marks, which stay as entered${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Student", "Exam", "Decision", "Reason", "Decided by", "Decided at"]}
          rows={rows}
          selectable={false}
          actions={(i) => (
            <>
              <button type="button" className="btn" onClick={() => setParam({ id: shown[i].id })}>
                Change
              </button>
              <button type="button" className="btn" onClick={() => lift(shown[i])}>
                Lift
              </button>
            </>
          )}
          empty={list.loading ? "Loading decisions…" : search || status || examId ? "No decisions match these filters." : "No result has been overridden. Every result is as the marks say."}
        />
      </Panel>
      {creating ? (
        <DecisionForm
          exams={exams.data ?? []}
          defaultExam={examId}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            list.reload();
          }}
        />
      ) : null}
      {editing ? (
        <DecisionForm
          decision={editing}
          exams={exams.data ?? []}
          onClose={() => setParam({ id: null })}
          onSaved={() => {
            setParam({ id: null });
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}

/** Record a new decision or change one. Nothing is saved until confirmed. */
function DecisionForm({
  decision,
  exams,
  defaultExam = "",
  onClose,
  onSaved,
}: {
  decision?: Decision;
  exams: Exam[];
  defaultExam?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const me = useSession()?.user.full_name;
  const d = decision;
  const [examId, setExamId] = useState(d ? String(d.exam_id) : defaultExam || (exams[0] ? String(exams[0].id) : ""));
  const [student, setStudent] = useState<{ id: number; name: string; adm: string } | null>(d ? { id: d.student_id, name: d.student_name ?? "", adm: d.student_admission_no ?? "" } : null);
  const [typed, setTyped] = useState("");
  const [q, setQ] = useState("");
  type Entry = { result_status: Status; reason: string; parent_note: string | null };
  const [pending, setPending] = useState<Entry | null>(null);
  // What was typed, kept when going back from the confirmation.
  const [draft, setDraft] = useState<Entry | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const found = useApi<Paginated<Student>>(!d && q.length >= 2 ? "/api/v1/school/students" : null, { search: q, page_size: 8 });
  const result = useApi<ExamResult & { result_status?: string; override_reason?: string | null }>(
    examId && student ? `${base}/exams/${examId}/students/${student.id}` : null,
  );
  const exam = exams.find((x) => String(x.id) === examId);

  function review(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    if (!examId || !student) return setError("Choose the exam and the student.");
    const reason = text("reason");
    if (reason.length < 3) return setError("Give the reason (at least 3 characters).");
    setError(null);
    const next = { result_status: text("result_status") as Status, reason, parent_note: text("parent_note") || null };
    setDraft(next);
    setPending(next);
  }

  async function confirm() {
    if (!pending || !student) return;
    setSaving(true);
    setError(null);
    try {
      if (d) {
        await api.patch(`${base}/${d.id}`, { ...pending, expected_version: d.version_no });
        notify(pending.result_status === "normal" ? `${student.name}'s result is back to normal.` : "Decision changed.");
      } else {
        await api.post(base, { exam_id: Number(examId), student_id: student.id, ...pending });
        notify("Decision recorded.");
      }
      onSaved();
    } catch (err) {
      setError(errorText(err));
      setPending(null);
    } finally {
      setSaving(false);
    }
  }

  const r = result.data;

  if (pending && student) {
    return (
      <Dialog
        open
        title="Confirm the change to this result"
        onClose={() => setPending(null)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setPending(null)} disabled={saving}>
              Back
            </button>
            <button type="button" className="btn primary" onClick={confirm} disabled={saving}>
              {saving ? "Saving…" : "Confirm and save"}
            </button>
          </>
        }
      >
        <ErrorNote>{error}</ErrorNote>
        <div className="tip warn">
          <Icon name="bell" className="sm" />
          <span>{`This changes ${student.name}'s ${exam?.name ?? d?.exam_name ?? "exam"} result. ${EFFECT[pending.result_status]}`}</span>
        </div>
        <dl className="kv">
          <div>
            <dt>Student</dt>
            <dd>{`${student.name}${student.adm ? ` · ${student.adm}` : ""}`}</dd>
          </div>
          <div>
            <dt>Exam</dt>
            <dd>{exam?.name ?? d?.exam_name ?? "—"}</dd>
          </div>
          <div>
            <dt>From</dt>
            <dd>{d ? STATUS[d.result_status] : r ? `${r.summary.is_pass ? "Pass" : "Fail"} by marks (${pct(r.summary.percentage)})` : "As the marks say"}</dd>
          </div>
          <div>
            <dt>To</dt>
            <dd>{STATUS[pending.result_status]}</dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd>{pending.reason}</dd>
          </div>
          <div>
            <dt>Note to the family</dt>
            <dd>{pending.parent_note ?? "—"}</dd>
          </div>
          <div>
            <dt>Recorded as</dt>
            <dd>{`${me ?? "You"}, now`}</dd>
          </div>
        </dl>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      wide
      title={d ? `Change the decision on ${d.student_name}` : "New result decision"}
      onClose={onClose}
      onSubmit={review}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Review
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <div className="form-grid">
        <Field label="Exam" required>
          <select value={examId} onChange={(e) => setExamId(e.target.value)} required disabled={Boolean(d)}>
            <option value="">Choose an exam…</option>
            {exams.map((x) => (
              <option key={x.id} value={x.id}>
                {`${x.name}${x.academic_year_name ? ` · ${x.academic_year_name}` : ""}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Student" required>
          {student ? (
            <span className="row" style={{ gap: 8 }}>
              <strong>{`${student.name}${student.adm ? ` · ${student.adm}` : ""}`}</strong>
              {!d ? (
                <button type="button" className="btn text" onClick={() => setStudent(null)}>
                  Change
                </button>
              ) : null}
            </span>
          ) : (
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Type a name or admission number…" aria-label="Find a student" />
          )}
        </Field>
      </div>
      {!student && q.length >= 2 ? (
        <div className="checklist">
          {(found.data?.items ?? []).map((s) => (
            <button key={s.id} type="button" className="check-item" style={{ textAlign: "left" }} onClick={() => setStudent({ id: s.id, name: s.full_name, adm: s.admission_no })}>
              <span>
                {s.full_name}
                <small className="muted" style={{ display: "block" }}>
                  {s.admission_no}
                </small>
              </span>
            </button>
          ))}
          {found.data && !found.data.items.length ? <p className="muted">No student matches.</p> : null}
          {found.loading ? <p className="muted">Searching…</p> : null}
        </div>
      ) : null}
      {student && examId ? (
        <div className="aside-panel">
          <h3>Result by the marks</h3>
          {result.error ? (
            <p className="muted">{result.error}</p>
          ) : r ? (
            <dl className="kv">
              <div>
                <dt>Marks</dt>
                <dd>{`${r.summary.total_obtained} / ${r.summary.total_max} (${pct(r.summary.percentage)}) · grade ${r.summary.overall_grade}`}</dd>
              </div>
              <div>
                <dt>Subjects</dt>
                <dd>{`${r.summary.subjects_passed} passed, ${r.summary.subjects_failed} failed${r.summary.subjects_pending ? `, ${r.summary.subjects_pending} not marked` : ""}`}</dd>
              </div>
              <div>
                <dt>Shown now as</dt>
                <dd>{STATUS[(r.result_status as Status) ?? "normal"] ?? r.result_status}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">Loading…</p>
          )}
        </div>
      ) : null}
      <div className="form-grid">
        <Field label="Decision" required>
          <select name="result_status" defaultValue={draft?.result_status ?? d?.result_status ?? "withheld"}>
            {d ? <option value="normal">Lift — back to the marks</option> : null}
            <option value="withheld">Withhold the result</option>
            <option value="pass_by_grace">Pass by grace</option>
            <option value="failed">Fail</option>
          </select>
        </Field>
        <Field label="Reason (kept on record)" required full>
          <textarea name="reason" rows={2} required minLength={3} maxLength={500} defaultValue={draft?.reason ?? d?.reason} placeholder="e.g. Fees outstanding for Term 2; grace marks per policy 4.2" />
        </Field>
        <Field label="Note to the family" full>
          <textarea name="parent_note" rows={2} maxLength={2000} defaultValue={draft ? (draft.parent_note ?? "") : (d?.parent_note ?? "")} placeholder="Shown to the parent with the result (optional)" />
        </Field>
      </div>
      {d ? <p className="small muted">{`Last decided by ${d.decided_by_name ?? "—"} on ${dateTime(d.decided_at)} · version ${d.version_no}`}</p> : null}
    </Dialog>
  );
}
