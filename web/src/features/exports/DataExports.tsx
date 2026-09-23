"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, KV } from "@/features/setup/bits";
import type { AcademicYear, SchoolClass } from "@/features/setup/types";

type ParamKind = "year" | "class" | "section" | "exam" | "date" | "month" | "text" | "number" | "choice";
type Param = { key: string; label: string; kind: ParamKind; required?: boolean; choices?: string[]; hint?: string; initial?: string };
type Dataset = { key: string; group: string; name: string; path: string; about: string; params: Param[] };

type ExportJob = {
  id: number;
  report_definition_id: number | null;
  name: string;
  status: "running" | "ready" | "failed";
  row_count: number;
  file_name: string | null;
  size_bytes: number | null;
  message: string | null;
  requested_by_name: string | null;
  created_at: string;
  completed_at: string | null;
};
type Definition = { id: number; name: string; code: string; source_label: string; is_active: boolean };
type Exam = { id: number; name: string; academic_year_name?: string | null };

const S = "/api/v1/school";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => iso(new Date());
const monthStart = () => {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), 1));
};
const thisMonth = () => today().slice(0, 7);

/** Every CSV the school portal can hand over, with the parameters each one takes (from the OpenAPI schema). */
const DATASETS: Dataset[] = [
  {
    key: "students",
    group: "Records",
    name: "Students",
    path: `${S}/exports/students.csv`,
    about: "The student roster with class, section and status.",
    params: [
      { key: "academic_year_id", label: "Academic year", kind: "year" },
      { key: "class_id", label: "Class", kind: "class" },
      { key: "section_id", label: "Section", kind: "section" },
      { key: "status", label: "Status", kind: "choice", choices: ["active", "inactive"] },
    ],
  },
  {
    key: "staff",
    group: "Records",
    name: "Staff",
    path: `${S}/exports/staff.csv`,
    about: "Everyone on the staff roster with role, designation and joining date.",
    params: [{ key: "role", label: "Role", kind: "choice", choices: ["teacher", "staff", "principal", "accountant", "school_admin"] }],
  },
  {
    key: "fees",
    group: "Records",
    name: "Fees",
    path: `${S}/exports/fees.csv`,
    about: "Every fee raised, with what was paid and what is outstanding.",
    params: [
      { key: "status", label: "Status", kind: "choice", choices: ["pending", "paid", "waived"] },
      { key: "period", label: "Fee period", kind: "text", hint: "As on the fee, e.g. 2026-10" },
    ],
  },
  {
    key: "marks",
    group: "Records",
    name: "Marks",
    path: `${S}/exports/marks.csv`,
    about: "Marks for one exam, one row per student per paper.",
    params: [{ key: "exam_id", label: "Exam", kind: "exam", required: true }],
  },
  {
    key: "homework",
    group: "Records",
    name: "Homework",
    path: `${S}/exports/homework.csv`,
    about: "Homework set, with how many students handed it in.",
    params: [
      { key: "from", label: "From", kind: "date" },
      { key: "to", label: "To", kind: "date" },
    ],
  },
  {
    key: "behaviour",
    group: "Records",
    name: "Behaviour ratings",
    path: `${S}/exports/behaviour.csv`,
    about: "Weekly and monthly behaviour ratings for every student.",
    params: [{ key: "period_key", label: "Period", kind: "text", hint: "2026-09 for a month, 2026-W38 for a week; blank for all" }],
  },
  {
    key: "strength",
    group: "Analytics",
    name: "Student strength",
    path: `${S}/analytics/strength.csv`,
    about: "Students per class and section.",
    params: [{ key: "academic_year_id", label: "Academic year", kind: "year" }],
  },
  {
    key: "fee-collection",
    group: "Analytics",
    name: "Fee collection",
    path: `${S}/analytics/fee-collection.csv`,
    about: "Fees collected over a date range.",
    params: [
      { key: "from", label: "From", kind: "date", initial: "month-start" },
      { key: "to", label: "To", kind: "date", initial: "today" },
    ],
  },
  { key: "dues-ageing", group: "Analytics", name: "Dues ageing", path: `${S}/analytics/dues-ageing.csv`, about: "Outstanding fees grouped by how long they have been overdue.", params: [] },
  {
    key: "chronic-absence",
    group: "Analytics",
    name: "Chronic absence",
    path: `${S}/analytics/chronic-absence.csv`,
    about: "Students whose attendance is below a threshold.",
    params: [
      { key: "below", label: "Attendance below (%)", kind: "number", initial: "75" },
      { key: "min_days", label: "Minimum days marked", kind: "number", initial: "10" },
      { key: "from", label: "From", kind: "date" },
      { key: "to", label: "To", kind: "date" },
    ],
  },
  {
    key: "class-summary",
    group: "Attendance reports",
    name: "Class attendance summary",
    path: `${S}/reports/attendance/class-summary.csv`,
    about: "Attendance per section over a date range.",
    params: [
      { key: "from", label: "From", kind: "date", required: true, initial: "month-start" },
      { key: "to", label: "To", kind: "date", required: true, initial: "today" },
      { key: "class_id", label: "Class", kind: "class" },
    ],
  },
  {
    key: "daily-absent",
    group: "Attendance reports",
    name: "Absent on a day",
    path: `${S}/reports/attendance/daily-absent.csv`,
    about: "Every student marked absent on one day.",
    params: [
      { key: "date", label: "Date", kind: "date", required: true, initial: "today" },
      { key: "class_id", label: "Class", kind: "class" },
      { key: "section_id", label: "Section", kind: "section" },
    ],
  },
  {
    key: "student-monthly",
    group: "Attendance reports",
    name: "Monthly register",
    path: `${S}/reports/attendance/student-monthly.csv`,
    about: "One section's register for a month, day by day.",
    params: [
      { key: "class_id", label: "Class", kind: "class", required: true },
      { key: "section_id", label: "Section", kind: "section", required: true },
      { key: "month", label: "Month", kind: "month", required: true, initial: "this-month" },
    ],
  },
];

function initialValues(d: Dataset): Record<string, string> {
  const v: Record<string, string> = {};
  d.params.forEach((p) => {
    if (p.initial === "today") v[p.key] = today();
    else if (p.initial === "month-start") v[p.key] = monthStart();
    else if (p.initial === "this-month") v[p.key] = thisMonth();
    else if (p.initial) v[p.key] = p.initial;
  });
  return v;
}

const size = (b: number | null) => (b === null ? "—" : b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

/**
 * NEW-081, live. One place for every CSV the school portal offers:
 * /exports/{students,staff,fees,marks,homework,behaviour}.csv,
 * /analytics/{strength,fee-collection,dues-ageing,chronic-absence}.csv and
 * /reports/attendance/{class-summary,daily-absent,student-monthly}.csv, each
 * downloaded with its parameters. Below, saved-report exports:
 * GET /export-jobs, GET /export-jobs/{id}, GET /export-jobs/{id}/file, and
 * POST /report-definitions/{id}/export to make a new one.
 */
export function DataExports() {
  const years = useApi<AcademicYear[]>(`${S}/academic-years`);
  const [yearId, setYearId] = useState<number | null>(null);
  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);
  const classes = useApi<SchoolClass[]>(yearId ? `${S}/classes` : null, { academic_year_id: yearId });
  const exams = useApi<Exam[]>(`${S}/exams`);
  const jobs = useApi<ExportJob[]>(`${S}/export-jobs`, { limit: 200 });
  const defs = useApi<Definition[]>(`${S}/report-definitions`);

  const [key, setKey] = useState(DATASETS[0].key);
  const ds = DATASETS.find((d) => d.key === key)!;
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(DATASETS[0]));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<{ name: string; at: string }[]>([]);
  const [openJob, setOpenJob] = useState<number | null>(null);
  const [defId, setDefId] = useState("");
  const [exporting, setExporting] = useState(false);

  function pick(k: string) {
    const d = DATASETS.find((x) => x.key === k)!;
    setKey(k);
    setValues(initialValues(d));
    setError(null);
  }
  const set = (k: string, v: string) => setValues((x) => ({ ...x, [k]: v, ...(k === "class_id" ? { section_id: "" } : {}) }));

  const sections = useMemo(() => classes.data?.find((c) => String(c.id) === values.class_id)?.sections ?? [], [classes.data, values.class_id]);

  async function download(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const missing = ds.params.filter((p) => p.required && !values[p.key]).map((p) => p.label);
    if (missing.length) {
      setError(`Fill in ${missing.join(", ")} first.`);
      return;
    }
    const params: Record<string, string | number> = {};
    ds.params.forEach((p) => {
      const v = values[p.key];
      if (!v) return;
      if (p.kind === "month") {
        const [y, m] = v.split("-").map(Number);
        params.year = y;
        params.month = m;
      } else if (ds.key === "student-monthly" && p.key === "class_id") {
        // The register takes the section only; the class just narrows the section list.
      } else params[p.key] = v;
    });
    setBusy(true);
    setError(null);
    try {
      await api.download(ds.path, `${ds.key}-${today()}.csv`, params);
      setRecent((r) => [{ name: ds.name, at: new Date().toISOString() }, ...r].slice(0, 5));
      notify(`${ds.name} downloaded.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function exportDefinition() {
    if (!defId) return;
    setExporting(true);
    setError(null);
    try {
      const j = await api.post<ExportJob>(`${S}/report-definitions/${defId}/export`);
      notify(j.status === "ready" ? `${j.name}: ${j.row_count} rows saved.` : (j.message ?? "The export did not finish."));
      await jobs.reload();
      setOpenJob(j.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setExporting(false);
    }
  }

  async function getFile(j: ExportJob) {
    setError(null);
    try {
      await api.download(`${S}/export-jobs/${j.id}/file`, j.file_name ?? `export-${j.id}.csv`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  function control(p: Param) {
    const v = values[p.key] ?? "";
    const on = (e: { target: { value: string } }) => set(p.key, e.target.value);
    switch (p.kind) {
      case "year":
        return (
          <select value={v} onChange={on}>
            <option value="">All years</option>
            {years.data?.map((y) => (
              <option key={y.id} value={y.id}>{`${y.name}${y.is_current ? " (current)" : ""}`}</option>
            ))}
          </select>
        );
      case "class":
        return (
          <select value={v} onChange={on} required={p.required}>
            <option value="">{p.required ? "Choose a class" : "All classes"}</option>
            {classes.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        );
      case "section":
        return (
          <select value={v} onChange={on} required={p.required} disabled={!values.class_id}>
            <option value="">{!values.class_id ? "Choose a class first" : p.required ? "Choose a section" : "All sections"}</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        );
      case "exam":
        return (
          <select value={v} onChange={on} required={p.required}>
            <option value="">Choose an exam</option>
            {exams.data?.map((x) => (
              <option key={x.id} value={x.id}>{`${x.name}${x.academic_year_name ? ` · ${x.academic_year_name}` : ""}`}</option>
            ))}
          </select>
        );
      case "choice":
        return (
          <select value={v} onChange={on}>
            <option value="">Any</option>
            {p.choices?.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        );
      case "date":
        return <input type="date" value={v} onChange={on} required={p.required} />;
      case "month":
        return <input type="month" value={v} onChange={on} required={p.required} />;
      case "number":
        return <input type="number" min={0} value={v} onChange={on} />;
      default:
        return <input value={v} onChange={on} placeholder={p.hint} />;
    }
  }

  const list = jobs.data ?? [];
  const ready = list.filter((j) => j.status === "ready").length;
  const failed = list.filter((j) => j.status === "failed").length;
  const stats = [
    { label: "Files available", value: String(DATASETS.length), note: "Records, analytics and attendance" },
    { label: "Saved report exports", value: jobs.data ? String(list.length) : "…", note: "Kept for downloading again" },
    { label: "Ready to download", value: jobs.data ? String(ready) : "…", note: failed ? `${failed} did not finish` : "All finished" },
    { label: "Last export", value: list[0] ? dateTime(list[0].created_at) : "—", note: list[0] ? list[0].name : "Nothing exported yet" },
  ];

  const rows: Row[] = list.map((j) => [j.name, j.status === "running" ? "Running" : j.status === "ready" ? "Ready" : "Failed", j.row_count.toLocaleString("en-IN"), size(j.size_bytes), j.requested_by_name ?? "—", dateTime(j.created_at)]);
  const groups = Array.from(new Set(DATASETS.map((d) => d.group)));

  return (
    <>
      <StatStrip items={stats} compact />
      <ErrorNote>{error ?? jobs.error ?? years.error}</ErrorNote>
      <div className="two-col" style={{ marginBottom: 20 }}>
        <form id="export-form" className="panel" onSubmit={download}>
          <div className="panel-head">
            <div>
              <h2>Download a CSV</h2>
              <p>{ds.about}</p>
            </div>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <Field label="File" required>
                <select value={key} onChange={(e) => pick(e.target.value)}>
                  {groups.map((g) => (
                    <optgroup key={g} label={g}>
                      {DATASETS.filter((d) => d.group === g).map((d) => (
                        <option key={d.key} value={d.key}>
                          {d.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              {ds.params.some((p) => p.kind === "class" || p.kind === "section") ? (
                <Field label="Classes of year">
                  <select aria-label="Academic year for the class list" value={yearId ?? ""} onChange={(e) => setYearId(Number(e.target.value))}>
                    {years.data?.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {ds.params.map((p) => (
                <Field key={p.key} label={p.label} required={p.required}>
                  {control(p)}
                </Field>
              ))}
            </div>
            {!ds.params.length ? <p className="muted small">This file takes no filters.</p> : null}
          </div>
          <div className="form-footer">
            <span>Fields marked * are required · blank filters mean everything</span>
            <button type="submit" className="btn primary" disabled={busy}>
              <Icon name="download" className="sm" />
              {busy ? "Preparing…" : "Download CSV"}
            </button>
          </div>
        </form>
        <aside className="stack">
          <Panel title="Files you can download">
            {groups.map((g) => (
              <div key={g} style={{ marginBottom: 10 }}>
                <strong className="small">{g}</strong>
                {DATASETS.filter((d) => d.group === g).map((d) => (
                  <div className="event-row" style={{ padding: "6px 0" }} key={d.key}>
                    <button type="button" className="btn text" onClick={() => pick(d.key)} style={{ fontWeight: d.key === key ? 700 : undefined }}>
                      {d.name}
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </Panel>
          <Panel title="Downloaded this session">
            {recent.length ? (
              recent.map((r, i) => (
                <div className="timeline-item" key={i}>
                  <span className="timeline-dot">
                    <Icon name="download" />
                  </span>
                  <div>
                    <h4>{r.name}</h4>
                  </div>
                  <time>{dateTime(r.at)}</time>
                </div>
              ))
            ) : (
              <p className="muted small">Files you download here are not kept on the server; saved-report exports below are.</p>
            )}
          </Panel>
        </aside>
      </div>
      <Panel
        title="Saved report exports"
        sub={`Custom reports run to a file and kept${jobs.loading ? " · Loading…" : ""}`}
        action={
          <div className="row" style={{ gap: 8 }}>
            <select aria-label="Saved report to export" value={defId} onChange={(e) => setDefId(e.target.value)}>
              <option value="">{defs.data?.length ? "Choose a saved report" : "No saved reports yet"}</option>
              {defs.data?.map((d) => (
                <option key={d.id} value={d.id}>{`${d.name} · ${d.source_label}`}</option>
              ))}
            </select>
            <button type="button" className="btn" disabled={!defId || exporting} onClick={exportDefinition}>
              <Icon name="file" className="sm" />
              {exporting ? "Exporting…" : "Export to file"}
            </button>
          </div>
        }
        flush
      >
        <DataTable
          columns={["Report", "Status", "Rows", "Size", "Requested by", "Created"]}
          rows={rows}
          selectable={false}
          actions={(i) => (
            <>
              <button type="button" className="btn" onClick={() => setOpenJob(list[i].id)}>
                View
              </button>
              {list[i].status === "ready" ? (
                <button type="button" className="btn" onClick={() => getFile(list[i])}>
                  <Icon name="download" className="sm" />
                  CSV
                </button>
              ) : null}
            </>
          )}
          empty={jobs.loading ? "Loading exports…" : undefined}
          emptyState={{ title: "No saved report exports yet", note: "Build a custom report, then export it here to download or keep as a file." }}
        />
      </Panel>
      {openJob !== null ? <JobDialog id={openJob} onClose={() => setOpenJob(null)} onFile={getFile} /> : null}
    </>
  );
}

/** GET /export-jobs/{id}: one export's state, refreshed on open. */
function JobDialog({ id, onClose, onFile }: { id: number; onClose: () => void; onFile: (j: ExportJob) => void }) {
  const job = useApi<ExportJob>(`${S}/export-jobs/${id}`);
  const j = job.data;
  return (
    <Dialog
      open
      title={j ? j.name : "Export"}
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          {j?.status === "running" ? (
            <button type="button" className="btn" onClick={job.reload}>
              Refresh
            </button>
          ) : null}
          {j?.status === "ready" ? (
            <button type="button" className="btn primary" onClick={() => onFile(j)}>
              <Icon name="download" className="sm" />
              Download CSV
            </button>
          ) : null}
        </>
      }
    >
      <ErrorNote>{job.error}</ErrorNote>
      {j ? (
        <>
          <div style={{ marginBottom: 10 }}>
            <Badge>{j.status === "running" ? "Running" : j.status === "ready" ? "Ready" : "Failed"}</Badge>
          </div>
          <KV
            rows={[
              ["File", j.file_name ?? "—"],
              ["Rows", j.row_count.toLocaleString("en-IN")],
              ["Size", size(j.size_bytes)],
              ["Requested by", j.requested_by_name ?? "—"],
              ["Started", dateTime(j.created_at)],
              ["Finished", dateTime(j.completed_at)],
              ["Message", j.message ?? "—"],
            ]}
          />
        </>
      ) : (
        <p className="muted">{job.loading ? "Loading…" : "Not found."}</p>
      )}
    </Dialog>
  );
}
