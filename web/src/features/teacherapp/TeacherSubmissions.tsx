"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useTeacherApp } from "@/components/teacherapp/TeacherShell";
import { api, errorText } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { dayLabel, plural, PmEmpty, PmError, PmLoading } from "./parts";

type FileRef = { id: number; file_name: string };
type HomeworkDetail = {
  id: number;
  title: string;
  description: string;
  subject_name: string | null;
  class_name: string | null;
  due_date: string;
  max_marks: string | number | null;
  is_closed: boolean;
  attachments: FileRef[];
};
type SubStatus = "submitted" | "approved" | "rejected";
type Submission = {
  id: number;
  student_id: number;
  student_admission_no: string | null;
  student_name: string | null;
  submitted_by_name: string | null;
  attachment_url: string | null;
  comment: string | null;
  submitted_at: string;
  status: SubStatus;
  marks: string | number | null;
  teacher_remark: string | null;
  files: FileRef[];
};

const STATUS: Record<SubStatus, [string, string]> = {
  submitted: ["To check", "status amber"],
  approved: ["Approved", "status"],
  rejected: ["Sent back", "status red"],
};

const when = (iso: string) => `${dayLabel(iso)}, ${iso.slice(11, 16)}`;

/** TM-011. One homework's hand-ins: open the work, give marks and a remark, approve or send back. */
export function TeacherSubmissions() {
  const id = Number(useSearchParams().get("homework"));
  const hw = useApi<HomeworkDetail>(id ? `/api/v1/teacher/homework/${id}` : null);
  const subs = useApi<Submission[]>(id ? `/api/v1/teacher/homework/${id}/submissions` : null);
  const [filter, setFilter] = useState<"all" | SubStatus>("submitted");
  const [open, setOpen] = useState<number | null>(null);

  if (!id) return <PmEmpty title="Pick homework">Choose homework on the Homework tab.</PmEmpty>;
  if ((hw.loading && !hw.data) || (subs.loading && !subs.data)) return <PmLoading />;
  if (hw.error || subs.error) return <PmError>{hw.error ?? subs.error}</PmError>;
  const h = hw.data;
  if (!h) return null;

  const all = [...(subs.data ?? [])].sort((a, b) => (a.student_name ?? "").localeCompare(b.student_name ?? ""));
  const count = (s: SubStatus) => all.filter((x) => x.status === s).length;
  const list = filter === "all" ? all : all.filter((x) => x.status === filter);
  const max = h.max_marks == null ? null : Number(h.max_marks);

  return (
    <>
      <div className="panel soft">
        <h3 style={{ margin: 0 }}>{h.title}</h3>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {`${h.subject_name ?? ""} · ${h.class_name ?? ""} · due ${dayLabel(h.due_date)}${max ? ` · out of ${max}` : ""}`}
        </p>
        {h.is_closed ? <span className="status amber">Closed to new submissions</span> : null}
        {h.attachments.map((f) => (
          <button key={f.id} className="text-button blue-text" onClick={() => api.open(`/api/v1/teacher/homework/${h.id}/files/${f.id}`)}>
            {`📎 ${f.file_name}`}
          </button>
        ))}
      </div>

      <div className="chip-row">
        {(
          [
            ["submitted", `To check (${count("submitted")})`],
            ["approved", `Approved (${count("approved")})`],
            ["rejected", `Sent back (${count("rejected")})`],
            ["all", `All (${all.length})`],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
            {label}
          </button>
        ))}
      </div>

      {!all.length ? <PmEmpty title="Nothing handed in yet">Submissions appear here as students and parents send them.</PmEmpty> : null}
      {all.length && !list.length ? <p className="muted">{filter === "submitted" ? "All caught up — nothing left to check." : "None here."}</p> : null}
      {list.length ? (
        <div className="panel">
          {list.map((s) => (
            <SubmissionRow
              key={s.id}
              s={s}
              max={max}
              open={open === s.id}
              onToggle={() => setOpen(open === s.id ? null : s.id)}
              onSaved={() => {
                setOpen(null);
                subs.reload();
              }}
            />
          ))}
        </div>
      ) : null}
      <p className="micro">{`${plural(all.length, "submission")} so far. Only students who have handed in are listed.`}</p>
    </>
  );
}

function SubmissionRow({
  s,
  max,
  open,
  onToggle,
  onSaved,
}: {
  s: Submission;
  max: number | null;
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const { notify } = useTeacherApp();
  const [marks, setMarks] = useState(s.marks == null ? "" : String(Number(s.marks)));
  const [remark, setRemark] = useState(s.teacher_remark ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [label, cls] = STATUS[s.status];
  const badMarks = max != null && marks !== "" && (!/^\d+(\.\d+)?$/.test(marks) || Number(marks) > max);

  async function review(status: SubStatus) {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/v1/teacher/homework/submissions/${s.id}/review`, {
        status,
        teacher_remark: remark.trim() || null,
        marks: max != null && marks !== "" ? Number(marks) : null,
      });
      notify(status === "approved" ? `Approved ${s.student_name ?? "submission"}.` : `Sent back to ${s.student_name ?? "the student"}.`);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ borderBottom: "1px solid var(--line)" }}>
      <button className="item" onClick={onToggle} aria-expanded={open} style={{ borderBottom: 0 }}>
        <span>
          <strong>{s.student_name ?? `Student #${s.student_id}`}</strong>
          <small className="muted">{`Handed in ${when(s.submitted_at)}${s.marks != null ? ` · ${Number(s.marks)}${max ? `/${max}` : ""}` : ""}`}</small>
          <span className={cls}>{label}</span>
        </span>
        <span>{open ? "⌄" : "›"}</span>
      </button>
      {open ? (
        <div style={{ padding: "0 0 12px" }}>
          {s.comment ? <p style={{ margin: "0 0 8px", whiteSpace: "pre-wrap" }}>{`“${s.comment}”`}</p> : null}
          {s.submitted_by_name ? <p className="micro">{`Sent by ${s.submitted_by_name}`}</p> : null}
          {s.files.map((f) => (
            <button
              key={f.id}
              className="action secondary"
              style={{ marginTop: 6 }}
              onClick={() => api.open(`/api/v1/teacher/homework/submissions/${s.id}/files/${f.id}`)}
            >
              {`Open ${f.file_name}`}
            </button>
          ))}
          {s.attachment_url ? (
            <a className="action secondary" style={{ marginTop: 6 }} href={s.attachment_url} target="_blank" rel="noreferrer">
              Open link
            </a>
          ) : null}
          {!s.files.length && !s.attachment_url && !s.comment ? <p className="muted">No file or note was attached.</p> : null}
          {max != null ? (
            <label className="field">
              {`Marks (out of ${max})`}
              <input inputMode="decimal" value={marks} onChange={(e) => setMarks(e.target.value.trim())} placeholder={`0–${max}`} />
              {badMarks ? <small className="bad">{`A number from 0 to ${max}`}</small> : null}
            </label>
          ) : null}
          <label className="field">
            Remark for the student
            <textarea rows={2} value={remark} maxLength={2000} onChange={(e) => setRemark(e.target.value)} placeholder="Well done / please redo question 3…" />
          </label>
          {error ? <p className="micro bad" role="alert">{error}</p> : null}
          <button className="action" disabled={busy || badMarks} onClick={() => review("approved")}>
            {busy ? "Saving…" : "Approve"}
          </button>
          <button className="action secondary" disabled={busy || badMarks} onClick={() => review("rejected")}>
            Send back to redo
          </button>
        </div>
      ) : null}
    </div>
  );
}
