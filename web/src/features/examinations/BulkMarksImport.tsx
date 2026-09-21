"use client";

import { useState, type ChangeEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { downloadFile, uploadForm } from "./common";
import { TeacherPaperSelects, useTeacherPaper } from "./MarksEntry";
import type { ImportJob } from "./types";

const BASE = "/api/v1/teacher/mark-imports";
const COLUMNS = ["admission_no", "marks", "status", "remark"];

/**
 * SCR-147, live: POST /teacher/mark-imports/papers/{id}/imports (multipart:
 * file + section_id) checks the file without writing; POST
 * /imports/{job}/commit writes the good rows. GET …/imports lists past runs,
 * GET /template.csv and /imports/{job}/errors.csv download.
 */
export function BulkMarksImport() {
  const t = useTeacherPaper();
  const paperId = t.paper?.exam_paper_id ?? null;
  const history = useApi<ImportJob[]>(paperId ? `${BASE}/papers/${paperId}/imports` : null);
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pick(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setJob(null);
    setError(null);
  }

  async function check() {
    if (!file || !paperId || !t.section) {
      setError("Choose a paper, a section and a CSV file.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("section_id", String(t.section.id));
      setJob(await uploadForm<ImportJob>(`${BASE}/papers/${paperId}/imports`, form));
      history.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!job) return;
    if (job.error_rows && !window.confirm(`${job.error_rows} row(s) have problems and will be skipped. Import the other ${job.success_rows}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const done = await api.post<ImportJob>(`${BASE}/imports/${job.id}/commit`, { skip_bad_rows: true });
      setJob(done);
      notify(`${done.success_rows} row(s) written.`);
      history.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const get = (path: string, name: string) => downloadFile(path, name).catch((err) => setError(errorText(err)));

  const errorRows: Row[] = (job?.errors ?? []).map((e) => [e.row ? String(e.row) : "—", e.value ?? "—", e.error ?? "—"]);
  const pastRows: Row[] = (history.data ?? []).map((h) => [h.file_name, label(h.status), `${h.success_rows} good / ${h.error_rows} with problems`, h.created_by_name ?? "—", dateTime(h.created_at)]);
  const committed = job?.status === "imported";

  return (
    <div className="two-col">
      <div className="stack">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Upload marks CSV</h2>
              <p>One section at a time. The file is checked before anything is written.</p>
            </div>
          </div>
          <div className="panel-body">
            <ErrorNote>{error ?? t.error}</ErrorNote>
            <div className="form-grid">
              <label className="field">
                <span>
                  Paper<span className="req">*</span>
                </span>
                <span className="row">
                  <TeacherPaperSelects t={t} />
                </span>
              </label>
            </div>
            <div className="gap" />
            <div className="upload-zone">
              <Icon name="folder" />
              <strong>{file ? file.name : "Choose a file to upload"}</strong>
              {file ? "" : " or drag and drop it here"}
              <br />
              <span className="small muted">CSV only</span>
              <input type="file" accept=".csv,text/csv" aria-label="Choose file" onChange={pick} />
            </div>
            {job ? (
              <div className="import-status" style={{ display: "block" }}>
                {committed
                  ? `${job.success_rows} row(s) written to the marks sheet.`
                  : `${job.total_rows} rows checked: ${job.success_rows} ready, ${job.error_rows} with problems. ${job.message ?? ""}`}
              </div>
            ) : null}
          </div>
          <div className="form-footer">
            <span>{job && !committed ? "Nothing has been written yet" : "Checking a file writes nothing"}</span>
            <div className="actions">
              <button type="button" className="btn" onClick={check} disabled={busy || !file}>
                <Icon name="check" className="sm" />
                {busy && !job ? "Checking…" : "Validate file"}
              </button>
              {job && job.status === "checked" && job.success_rows > 0 ? (
                <button type="button" className="btn primary" onClick={commit} disabled={busy}>
                  <Icon name="check" className="sm" />
                  {`Import ${job.success_rows} row${job.success_rows === 1 ? "" : "s"}`}
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <Panel
          title="Problems found"
          sub={job ? `${job.error_rows} row(s) will be skipped` : "Validate a file to see what the check finds"}
          action={
            job?.error_rows ? (
              <button type="button" className="btn" onClick={() => get(`${BASE}/imports/${job.id}/errors.csv`, `import-${job.id}-errors.csv`)}>
                <Icon name="download" className="sm" />
                Errors CSV
              </button>
            ) : undefined
          }
          flush
        >
          <DataTable columns={["Row", "Value", "Problem"]} rows={errorRows} selectable={false} rowAction={false} empty={job ? "Every row is good." : "No file checked yet."} />
        </Panel>
        <Panel title="Earlier uploads" sub={t.paper ? `${t.paper.subject_name} · ${t.paper.class_name}` : ""} flush>
          <DataTable columns={["File", "Status", "Rows", "Uploaded by", "When"]} rows={pastRows} selectable={false} rowAction={false} empty={history.loading ? "Loading…" : "No uploads for this paper yet."} />
        </Panel>
      </div>
      <aside className="stack">
        <Panel title="File template">
          <p className="muted small">Use these column names in your CSV file.</p>
          <div className="gap" />
          {COLUMNS.map((c) => (
            <div className="event-row" style={{ padding: "9px 0" }} key={c}>
              <strong className="small">{c}</strong>
            </div>
          ))}
          <div className="gap" />
          <button type="button" className="btn" onClick={() => get(`${BASE}/template.csv`, "marks-template.csv")}>
            <Icon name="download" className="sm" />
            Download template
          </button>
        </Panel>
        <Panel title="Validation checklist">
          <div className="checklist">
            {["Admission numbers match active students in the section", "Each admission number appears once", "Status is scored, absent or exempt", `Marks from 0 to ${t.paper?.max_marks ?? "the paper maximum"}; blank only when absent or exempt`].map((x) => (
              <div className="check-item" key={x}>
                <Icon name="check" className="sm" />
                <label>{x}</label>
              </div>
            ))}
          </div>
        </Panel>
      </aside>
    </div>
  );
}
