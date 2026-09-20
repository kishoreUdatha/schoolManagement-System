"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, Textarea, humanize, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";

type ImportType = "students" | "staff" | "marks";
type RowError = { row: number | null; value: string | null; error: string | null };
type ImportJob = {
  id: number;
  import_type: ImportType;
  status: "uploaded" | "checked" | "imported" | "failed" | "cancelled";
  file_name: string;
  options: Record<string, unknown>;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  errors: RowError[];
  message: string | null;
  created_by_name: string | null;
  created_at: string;
};
type Source = { source: string; label: string; columns: string[]; filters: string[] };
type Report = {
  id: number;
  name: string;
  code: string;
  description: string | null;
  source: string;
  source_label: string;
  filters: Record<string, unknown>;
  columns: string[];
  sort_by: string | null;
  is_active: boolean;
  created_by_name: string | null;
  last_run_at: string | null;
  run_count: number;
};
type RunResult = { name: string; columns: string[]; row_count: number; rows: Record<string, unknown>[]; truncated: boolean };
type ExportJob = {
  id: number;
  name: string;
  status: "running" | "ready" | "failed";
  row_count: number;
  file_name: string | null;
  size_bytes: number | null;
  message: string | null;
  requested_by_name: string | null;
  created_at: string;
};
type Section = { id: number; name: string; class_name: string };
type ClassRow = { id: number; name: string; sections: { id: number; name: string }[] };

const base = "/api/v1/school";
const when = (iso: string) => new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const TONE: Record<string, "emerald" | "amber" | "rose" | "neutral"> = {
  imported: "emerald",
  ready: "emerald",
  checked: "amber",
  uploaded: "amber",
  running: "amber",
  failed: "rose",
  cancelled: "neutral",
};

/** Bulk uploads, the school's own saved reports, and the files they produce. */
export function DataDesk() {
  const [tab, setTab] = useState<"imports" | "reports" | "exports">("imports");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (m: string) => {
    setNotice(m);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Data desk" subtitle="Bring data in from a spreadsheet, and take it out the way you want it." />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      <nav className="flex gap-1 border-b border-surface-border">
        {(["imports", "reports", "exports"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {humanize(t)}
          </button>
        ))}
      </nav>
      {tab === "imports" && <Imports onChange={flash} onError={setError} />}
      {tab === "reports" && <Reports onChange={flash} onError={setError} />}
      {tab === "exports" && <Exports onError={setError} />}
    </div>
  );
}

type Handlers = { onChange: (m: string) => void; onError: (m: string) => void };

function Imports({ onChange, onError }: Handlers) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [years, setYears] = useState<{ id: number; name: string; is_current: boolean }[]>([]);
  const [form, setForm] = useState<{ import_type: ImportType; section_id: string; academic_year_id: string } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [detail, setDetail] = useState<ImportJob | null>(null);

  const load = () =>
    api
      .get<ImportJob[]>(`${base}/import-jobs`)
      .then((r) => {
        setJobs(r.data);
        setDetail((cur) => (cur ? r.data.find((j) => j.id === cur.id) ?? null : null));
      })
      .catch((e) => onError(apiError(e)));

  useEffect(() => {
    load();
    api
      .get<{ id: number; name: string; is_current: boolean }[]>(`${base}/academic-years`)
      .then(async (r) => {
        setYears(r.data);
        const year = r.data.find((y) => y.is_current) ?? r.data[0];
        if (!year) return;
        const classes = await api.get<ClassRow[]>(`${base}/classes`, { params: { academic_year_id: year.id } });
        setSections(
          classes.data.flatMap((c) => c.sections.map((sec) => ({ id: sec.id, name: sec.name, class_name: c.name })))
        );
      })
      .catch(() => setYears([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      onChange(done);
      await load();
      return true;
    } catch (e) {
      onError(apiError(e));
      return false;
    }
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!form || !file) return;
    const options: Record<string, number> = {};
    if (form.import_type === "students") {
      options.section_id = Number(form.section_id);
      options.academic_year_id = Number(form.academic_year_id);
    }
    const fd = new FormData();
    fd.append("import_type", form.import_type);
    fd.append("options", JSON.stringify(options));
    fd.append("file", file);
    try {
      const { data } = await api.post<ImportJob>(`${base}/import-jobs`, fd);
      onChange(data.message ?? "File checked.");
      setForm(null);
      setFile(null);
      await load();
      setDetail(data);
    } catch (e) {
      onError(apiError(e));
    }
  }

  const currentYear = years.find((y) => y.is_current) ?? years[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() =>
            setForm({
              import_type: "students",
              section_id: sections[0] ? String(sections[0].id) : "",
              academic_year_id: currentYear ? String(currentYear.id) : "",
            })
          }
        >
          Upload a spreadsheet
        </Button>
        {(["students", "staff", "marks"] as const).map((t) => (
          <Button
            key={t}
            variant="secondary"
            onClick={() => openAuthed(`${base}/import-jobs/template.csv?import_type=${t}`, `${t}_template.csv`)}
          >
            {humanize(t)} template
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Uploads</CardTitle>
        </CardHeader>
        <CardBody>
          <Table head={["File", "What", "Rows", "State", "By", ""]} empty={jobs.length === 0 && "Nothing uploaded yet."}>
            {jobs.map((j) => (
              <tr key={j.id}>
                <td className={tdStrong}>
                  {j.file_name}
                  <span className="block text-xs text-ink-subtle">{when(j.created_at)}</span>
                </td>
                <td className={td}>{humanize(j.import_type)}</td>
                <td className={td}>
                  {j.success_rows} good
                  {j.error_rows > 0 && <span className="text-rose-500"> · {j.error_rows} to fix</span>}
                  <span className="block text-xs text-ink-subtle">of {j.total_rows}</span>
                </td>
                <td className={td}>
                  <Badge tone={TONE[j.status] ?? "neutral"}>{humanize(j.status)}</Badge>
                  {j.message && <span className="block text-xs text-ink-subtle">{j.message}</span>}
                </td>
                <td className={td}>{j.created_by_name ?? "—"}</td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setDetail(j)}>
                      Rows
                    </Button>
                    {j.status === "checked" && (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            run(() => api.post(`${base}/import-jobs/${j.id}/commit`, { skip_bad_rows: true }), "Imported.")
                          }
                        >
                          Import {j.success_rows}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => run(() => api.patch(`${base}/import-jobs/${j.id}`, { note: "Cancelled" }), "Cancelled.")}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal open={form !== null} onClose={() => setForm(null)} title="Upload a spreadsheet">
        {form && (
          <form className="space-y-3" onSubmit={upload}>
            <Select
              label="What are you importing?"
              value={form.import_type}
              onChange={(e) => setForm({ ...form, import_type: e.target.value as ImportType })}
            >
              <option value="students">Students</option>
              <option value="staff">Staff</option>
            </Select>
            {form.import_type === "students" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Select label="Into section" value={form.section_id} onChange={(e) => setForm({ ...form, section_id: e.target.value })}>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.class_name} {s.name}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Academic year"
                  value={form.academic_year_id}
                  onChange={(e) => setForm({ ...form, academic_year_id: e.target.value })}
                >
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-muted">CSV file</span>
              <input type="file" accept=".csv" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm text-ink-muted" />
            </label>
            <p className="text-xs text-ink-subtle">
              The file is only checked now. You will see any bad rows before anything is written.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button type="submit">Check the file</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={detail !== null} onClose={() => setDetail(null)} title={detail ? `${detail.file_name}` : ""} size="lg">
        {detail && (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">{detail.message}</p>
            {detail.errors.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => openAuthed(`${base}/import-jobs/${detail.id}/errors.csv`, `import_${detail.id}_problems.csv`)}
              >
                Download the problem rows
              </Button>
            )}
            <Table head={["Row", "Value", "Problem"]} empty={detail.errors.length === 0 && "Every row was fine."}>
              {detail.errors.map((e, i) => (
                <tr key={i}>
                  <td className={tdStrong}>{e.row ?? "—"}</td>
                  <td className={td}>{e.value ?? "—"}</td>
                  <td className={td}>{e.error}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Modal>
    </div>
  );
}

const blankReport = { name: "", code: "", description: "", source: "students", columns: [] as string[], sort_by: "" };

function Reports({ onChange, onError }: Handlers) {
  const [items, setItems] = useState<Report[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [form, setForm] = useState<(typeof blankReport & { id: number | null }) | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  const load = () =>
    api
      .get<Report[]>(`${base}/report-definitions`)
      .then((r) => setItems(r.data))
      .catch((e) => onError(apiError(e)));

  useEffect(() => {
    load();
    api
      .get<Source[]>(`${base}/report-sources`)
      .then((r) => setSources(r.data))
      .catch(() => setSources([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      onChange(done);
      await load();
      return true;
    } catch (e) {
      onError(apiError(e));
      return false;
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const body = {
      name: form.name,
      code: form.code,
      description: form.description || null,
      columns: form.columns,
      sort_by: form.sort_by || null,
    };
    const ok = await run(
      () =>
        form.id
          ? api.patch(`${base}/report-definitions/${form.id}`, body)
          : api.post(`${base}/report-definitions`, { ...body, source: form.source, filters: {} }),
      form.id ? "Report updated." : "Report saved."
    );
    if (ok) setForm(null);
  }

  const chosen = sources.find((s) => s.source === form?.source);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setForm({ ...blankReport, id: null })}>New report</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Saved reports</CardTitle>
        </CardHeader>
        <CardBody>
          <Table head={["Name", "Built on", "Columns", "Last run", ""]} empty={items.length === 0 && "No saved reports yet."}>
            {items.map((r) => (
              <tr key={r.id}>
                <td className={tdStrong}>
                  {r.name}
                  <span className="block text-xs text-ink-subtle">
                    {r.code}
                    {r.description ? ` · ${r.description}` : ""}
                  </span>
                </td>
                <td className={td}>{r.source_label}</td>
                <td className={td}>{r.columns.map((c) => humanize(c)).join(", ")}</td>
                <td className={td}>
                  {r.last_run_at ? when(r.last_run_at) : "Never"}
                  <span className="block text-xs text-ink-subtle">{r.run_count} runs</span>
                </td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          const { data } = await api.post<RunResult>(`${base}/report-definitions/${r.id}/run`);
                          setResult(data);
                          await load();
                        } catch (e) {
                          onError(apiError(e));
                        }
                      }}
                    >
                      Run
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => run(() => api.post(`${base}/report-definitions/${r.id}/export`), `${r.name} exported — see Exports.`)}
                    >
                      Export CSV
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setForm({
                          id: r.id,
                          name: r.name,
                          code: r.code,
                          description: r.description ?? "",
                          source: r.source,
                          columns: r.columns,
                          sort_by: r.sort_by ?? "",
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => run(() => api.delete(`${base}/report-definitions/${r.id}`), `${r.name} deleted.`)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal open={form !== null} onClose={() => setForm(null)} title={form?.id ? "Edit report" : "New report"} size="lg">
        {form && (
          <form className="space-y-3" onSubmit={save}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input
                label="Short code"
                required
                placeholder="new-admissions"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
            <Select
              label="Built on"
              value={form.source}
              disabled={form.id !== null}
              onChange={(e) => setForm({ ...form, source: e.target.value, columns: [], sort_by: "" })}
            >
              {sources.map((s) => (
                <option key={s.source} value={s.source}>
                  {s.label}
                </option>
              ))}
            </Select>
            <div>
              <span className="text-xs font-medium text-ink-muted">Columns (none ticked = all of them)</span>
              <div className="mt-1 grid max-h-48 gap-1 overflow-y-auto rounded-lg border border-surface-border p-2 sm:grid-cols-2">
                {(chosen?.columns ?? []).map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm text-ink-muted">
                    <input
                      type="checkbox"
                      checked={form.columns.includes(c)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          columns: e.target.checked ? [...form.columns, c] : form.columns.filter((x) => x !== c),
                        })
                      }
                    />
                    {humanize(c)}
                  </label>
                ))}
              </div>
            </div>
            <Select label="Sort by" value={form.sort_by} onChange={(e) => setForm({ ...form, sort_by: e.target.value })}>
              <option value="">Default order</option>
              {(form.columns.length ? form.columns : chosen?.columns ?? []).map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </Select>
            <Textarea label="What it is for" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={result !== null} onClose={() => setResult(null)} title={result ? `${result.name} — ${result.row_count} rows` : ""} size="lg">
        {result && (
          <div className="max-h-[60vh] overflow-auto">
            <Table head={result.columns.map((c) => humanize(c))} empty={result.rows.length === 0 && "Nothing matched."}>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  {result.columns.map((c) => (
                    <td key={c} className={td}>
                      {row[c] === null || row[c] === undefined || row[c] === "" ? "—" : String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </Table>
            {result.truncated && <p className="p-2 text-xs text-ink-subtle">Showing the first rows only — export for the full list.</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Exports({ onError }: { onError: (m: string) => void }) {
  const [items, setItems] = useState<ExportJob[]>([]);

  useEffect(() => {
    api
      .get<ExportJob[]>(`${base}/export-jobs`)
      .then((r) => setItems(r.data))
      .catch((e) => onError(apiError(e)));
  }, [onError]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Files produced</CardTitle>
      </CardHeader>
      <CardBody>
        <Table head={["Report", "Rows", "State", "Asked by", ""]} empty={items.length === 0 && "No exports yet."}>
          {items.map((j) => (
            <tr key={j.id}>
              <td className={tdStrong}>
                {j.name}
                <span className="block text-xs text-ink-subtle">{when(j.created_at)}</span>
              </td>
              <td className={td}>{j.row_count}</td>
              <td className={td}>
                <Badge tone={TONE[j.status] ?? "neutral"}>{humanize(j.status)}</Badge>
                {j.message && <span className="block text-xs text-rose-500">{j.message}</span>}
              </td>
              <td className={td}>{j.requested_by_name ?? "—"}</td>
              <td className={td}>
                {j.status === "ready" && (
                  <Button size="sm" variant="secondary" onClick={() => openAuthed(`${base}/export-jobs/${j.id}/file`, j.file_name ?? "export.csv")}>
                    Download
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </CardBody>
    </Card>
  );
}
