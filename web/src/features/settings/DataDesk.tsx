"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field } from "@/features/setup/bits";
import type { AcademicYear, SchoolClass } from "@/features/setup/types";
import { download, upload } from "./files";
import type { ImportJob } from "./types";

const JOBS = "/api/v1/school/import-jobs";

/** A small CSV reader for the local preview: quoted fields and commas inside quotes. */
function parseCsv(text: string, max = 6): string[][] {
  const out: string[][] = [];
  for (const line of text.replace(/^﻿/, "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q && ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = !q;
      else if (ch === "," && !q) {
        cells.push(cur);
        cur = "";
      } else cur += ch;
    }
    cells.push(cur);
    out.push(cells);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * SCR-295, live. "Validate file" uploads the CSV to POST /import-jobs,
 * which checks every row without writing any; the job then waits until
 * "Import" (POST /import-jobs/{id}/commit, skipping bad rows) or "Cancel"
 * (PATCH). The template comes from GET /import-jobs/template.csv.
 * Exports download the /exports/*.csv files.
 */
export function DataDesk() {
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const [kind, setKind] = useState<"students" | "staff">("students");
  const [yearId, setYearId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [local, setLocal] = useState<string[][]>([]);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const sections = useMemo(() => (classes.data ?? []).flatMap((c) => c.sections.map((s) => ({ id: s.id, name: `${c.name} ${s.name}` }))), [classes.data]);
  useEffect(() => {
    if (!sections.some((s) => String(s.id) === sectionId)) setSectionId(sections[0] ? String(sections[0].id) : "");
  }, [sections, sectionId]);

  const template = useApi<string>(JOBS + "/template.csv", { import_type: kind });
  const templateRows = typeof template.data === "string" ? parseCsv(template.data, 2) : [];
  const columns = templateRows[0] ?? [];
  const jobs = useApi<ImportJob[]>(JOBS);

  async function choose(f: File | null) {
    setFile(f);
    setJob(null);
    setLocal(f ? parseCsv(await f.text()) : []);
  }

  async function validate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    if (kind === "students" && (!sectionId || !yearId)) {
      setError("Choose the academic year and the section the students join.");
      return;
    }
    const fd = new FormData();
    fd.append("import_type", kind);
    fd.append("options", JSON.stringify(kind === "students" ? { section_id: Number(sectionId), academic_year_id: yearId } : {}));
    fd.append("file", file);
    setBusy(true);
    setError(null);
    try {
      const j = await upload<ImportJob>(JOBS, fd);
      setJob(j);
      notify(j.message ?? "File checked.");
      await jobs.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function act(j: ImportJob, what: "commit" | "cancel") {
    setBusy(true);
    setError(null);
    try {
      const r =
        what === "commit"
          ? await api.post<ImportJob>(`${JOBS}/${j.id}/commit`, { skip_bad_rows: true })
          : await api.patch<ImportJob>(`${JOBS}/${j.id}`, { note: "Cancelled" });
      setJob(r);
      notify(what === "commit" ? (r.message ?? `${r.success_rows} rows imported.`) : "Import cancelled.");
      await jobs.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function save(path: string, name: string, params?: Record<string, string | number | null>) {
    setError(null);
    try {
      await download(path, name, params ?? undefined);
    } catch (err) {
      setError(errorText(err));
    }
  }

  const header = local[0] ?? columns;
  const missing = local.length ? columns.filter((c) => !local[0].includes(c)) : [];
  const previewRows: Row[] = local.slice(1).map((r) => header.map((_, i) => r[i] ?? ""));
  const history: Row[] = (jobs.data ?? []).slice(0, 8).map((j) => [
    j.file_name,
    label(j.import_type),
    `${j.success_rows} good · ${j.error_rows} to fix of ${j.total_rows}`,
    label(j.status),
    j.created_by_name ?? "—",
    dateTime(j.created_at),
  ]);

  return (
    <div className="two-col">
      <div className="stack">
        <form id="import-form" className="panel" onSubmit={validate}>
          <div className="panel-head">
            <div>
              <h2>{`Import ${kind} records`}</h2>
              <p>Choose a CSV file and validate it before importing.</p>
            </div>
          </div>
          <div className="panel-body">
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <Field label="What are you importing?" required>
                <select value={kind} onChange={(e) => setKind(e.target.value as "students" | "staff")}>
                  <option value="students">Students</option>
                  <option value="staff">Staff</option>
                </select>
              </Field>
              {kind === "students" ? (
                <>
                  <Field label="Academic year" required>
                    <select aria-label="Academic year" value={yearId ?? ""} onChange={(e) => setYearId(Number(e.target.value))}>
                      {years.data?.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Into section" required>
                    <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                      {!sections.length ? <option value="">{classes.loading ? "Loading…" : "No sections in this year"}</option> : null}
                      {sections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              ) : null}
              {/* Not wired: Duplicate handling — rows that fail the check are always skipped on import; no other option exists */}
            </div>
            <div className="gap" />
            <div className="upload-zone">
              <Icon name="folder" />
              <strong>{file ? file.name : "Choose a file to upload"}</strong>
              or drag and drop it here
              <br />
              <span className="small muted">CSV only</span>
              <input type="file" accept=".csv,text/csv" aria-label="Choose file" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
            </div>
            {job ? (
              <div className="import-status" style={{ marginTop: 12 }}>
                <p>
                  <b>{label(job.status)}</b>
                  {` · ${job.success_rows} good, ${job.error_rows} to fix, of ${job.total_rows} rows. ${job.message ?? ""}`}
                </p>
                {job.errors.length ? (
                  <ul className="small">
                    {job.errors.slice(0, 8).map((x, i) => (
                      <li key={i}>{`Row ${x.row ?? "?"}: ${x.error ?? "not valid"}${x.value ? ` (${x.value})` : ""}`}</li>
                    ))}
                    {job.errors.length > 8 ? <li>{`… and ${job.errors.length - 8} more`}</li> : null}
                  </ul>
                ) : null}
                {job.status === "checked" ? (
                  <div className="row" style={{ marginTop: 8 }}>
                    <button type="button" className="btn primary" disabled={busy || !job.success_rows} onClick={() => act(job, "commit")}>
                      {`Import ${job.success_rows} rows`}
                    </button>
                    <button type="button" className="btn" disabled={busy} onClick={() => act(job, "cancel")}>
                      Cancel
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="form-footer">
            <span>Validating writes nothing; rows are written only when you import</span>
            <button type="submit" className="btn primary" disabled={busy || !file}>
              <Icon name="check" className="sm" />
              {busy ? "Checking…" : "Validate file"}
            </button>
          </div>
        </form>
        <Panel title="Preview rows" sub={file ? `First rows of ${file.name}, read in this browser${missing.length ? ` · missing columns: ${missing.join(", ")}` : ""}` : "Choose a file to see its first rows"} flush>
          <DataTable columns={header.length ? header : ["No file chosen"]} rows={previewRows} selectable={false} rowAction={false} empty="No rows to show yet." />
        </Panel>
        <Panel title="Recent imports" sub={`${jobs.data?.length ?? 0} uploads`} flush>
          <DataTable columns={["File", "Import", "Rows", "Status", "By", "Uploaded"]} rows={history} selectable={false} rowAction={false} empty={jobs.loading ? "Loading…" : "Nothing uploaded yet."} />
        </Panel>
      </div>
      <aside className="stack">
        <Panel title="File template">
          <p className="muted small">Use these column names in your CSV file.</p>
          <div className="gap" />
          {columns.map((c) => (
            <div className="event-row" style={{ padding: "9px 0" }} key={c}>
              <strong className="small mono">{c}</strong>
            </div>
          ))}
          {!columns.length ? <p className="muted small">{template.loading ? "Loading…" : (template.error ?? "No template.")}</p> : null}
          <div className="gap" />
          <button type="button" className="btn" onClick={() => save(`${JOBS}/template.csv`, `${kind}_template.csv`, { import_type: kind })}>
            <Icon name="download" className="sm" />
            Download template
          </button>
        </Panel>
        <Panel title="Export data">
          <p className="muted small">Download the school&apos;s records as CSV.</p>
          <div className="gap" />
          <div className="stack" style={{ gap: 8 }}>
            <button type="button" className="btn" onClick={() => save("/api/v1/school/exports/students.csv", "students.csv", { academic_year_id: yearId })}>
              <Icon name="download" className="sm" />
              Students (selected year)
            </button>
            <button type="button" className="btn" onClick={() => save("/api/v1/school/exports/staff.csv", "staff.csv")}>
              <Icon name="download" className="sm" />
              Staff
            </button>
            <button type="button" className="btn" onClick={() => save("/api/v1/school/exports/fees.csv", "fees.csv")}>
              <Icon name="download" className="sm" />
              Fees
            </button>
          </div>
          {/* Not wired: Backup and restore — the API has no backup endpoint */}
        </Panel>
      </aside>
    </div>
  );
}
