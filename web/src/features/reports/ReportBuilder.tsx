"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { downloadCsv, Kv, useYear } from "./kit";

import { ask } from "@/lib/dialog";
type Source = { source: string; label: string; columns: string[]; filters: string[] };
type Definition = {
  id: number;
  name: string;
  code: string;
  source: string;
  source_label: string;
  filters: Record<string, unknown>;
  columns: string[];
  sort_by: string | null;
  group_by?: string | null;
  is_active: boolean;
  created_by_name?: string | null;
  last_run_at: string | null;
  run_count: number;
};
type Result = { report_id: number; name: string; columns: string[]; row_count: number; rows: Record<string, unknown>[]; truncated: boolean; group_by?: string | null; groups?: { value: unknown; count: number }[] };
type SchoolClass = { id: number; name: string; sections: { id: number; name: string }[] };
type Exam = { id: number; name: string };

/** Filter keys that are dates; they make up the mock's "Date range". */
const DATE_KEYS = ["from", "to", "due_from", "due_to"];
/** `status` means different things per source, as the old data desk had it. */
const CHOICES: Record<string, Record<string, string[]>> = {
  status: { students: ["active", "inactive"], staff: ["active", "inactive"], fees: ["pending", "paid", "waived"] },
  gender: { students: ["male", "female", "other"] },
  role: { staff: ["teacher", "staff", "principal", "accountant", "school_admin"] },
};
const ID_KEYS = ["academic_year_id", "class_id", "section_id", "exam_id"];

function codeFor(name: string) {
  const slug = name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "REPORT";
  return `${slug}-${Date.now().toString(36).toUpperCase()}`;
}

/** NEW-081 Data Exports, where exported files are kept (routeOf only knows SCR- screens). */
const EXPORTS_ROUTE = "/settings/data-exports";

const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v));

/**
 * SCR-283, live: GET /report-sources and /report-definitions to choose from;
 * Run report saves a new definition (POST /report-definitions) or reuses the
 * chosen saved one, then runs it (POST /report-definitions/{id}/run) with the
 * filters. Group by orders the rows by a column and counts each group; there
 * are no operators: filters are the fixed
 * keys each source declares. A saved report opens with
 * GET /report-definitions/{id}; it can be edited (PATCH), deleted (DELETE)
 * or run to a kept CSV file (POST /report-definitions/{id}/export).
 */
export function ReportBuilder() {
  const router = useRouter();
  const sources = useApi<Source[]>("/api/v1/school/report-sources");
  const saved = useApi<Definition[]>("/api/v1/school/report-definitions", { include_inactive: true });
  const y = useYear();
  const classes = useApi<SchoolClass[]>(y.yearId ? "/api/v1/school/classes" : null, { academic_year_id: y.yearId });
  const exams = useApi<Exam[]>("/api/v1/school/exams");

  const [savedId, setSavedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [columns, setColumns] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Definition | null>(null);
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!source && sources.data?.length) setSource(sources.data[0].source);
  }, [sources.data, source]);

  const spec = sources.data?.find((s) => s.source === source);
  // The list refreshes after each run (run count); the opened copy covers the moment before it does.
  const chosenSaved = saved.data?.find((d) => d.id === savedId) ?? (opened && opened.id === savedId ? opened : undefined);
  const locked = Boolean(savedId) && !editing;
  const sections = useMemo(() => classes.data?.find((c) => String(c.id) === filters.class_id)?.sections ?? [], [classes.data, filters.class_id]);

  function pickSource(s: string) {
    setSource(s);
    setColumns([]);
    setSortBy("");
    setGroupBy("");
    setFilters({});
    setSavedId(null);
    setOpened(null);
    setEditing(false);
    setResult(null);
  }

  function load(d: Definition) {
    setOpened(d);
    setSavedId(d.id);
    setName(d.name);
    setSource(d.source);
    setColumns(d.columns);
    setSortBy(d.sort_by ?? "");
    setGroupBy(d.group_by ?? "");
    setActive(d.is_active);
    setFilters(Object.fromEntries(Object.entries(d.filters ?? {}).map(([k, v]) => [k, String(v ?? "")])));
  }

  /** Open a saved report fresh from GET /report-definitions/{id}. */
  async function pickSaved(id: string) {
    setResult(null);
    setEditing(false);
    setError(null);
    if (!id) {
      setSavedId(null);
      setOpened(null);
      setName("");
      setColumns([]);
      setSortBy("");
      setGroupBy("");
      setFilters({});
      return;
    }
    try {
      load(await api.get<Definition>(`/api/v1/school/report-definitions/${id}`));
    } catch (err) {
      setError(errorText(err));
    }
  }

  /** PATCH /report-definitions/{id}: name, columns, sort, saved filters and whether it is active. */
  async function saveEdit() {
    if (!savedId) return;
    if (name.trim().length < 2) {
      setError("Give the report a name of at least two characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const d = await api.patch<Definition>(`/api/v1/school/report-definitions/${savedId}`, {
        name: name.trim(),
        filters: asFilters(),
        columns,
        sort_by: sortBy || null,
        group_by: groupBy || null,
        is_active: active,
      });
      load(d);
      setEditing(false);
      notify("Report updated.");
      saved.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!chosenSaved) return;
    if (!(await ask(`Delete the saved report "${chosenSaved.name}"? Files already exported from it are kept.`))) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/v1/school/report-definitions/${chosenSaved.id}`);
      notify("Report deleted.");
      await pickSaved("");
      saved.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  /** POST /report-definitions/{id}/export with this run's filters; the file is kept under Data Exports. */
  async function exportFile() {
    if (!savedId) return;
    setBusy(true);
    setError(null);
    try {
      const j = await api.post<{ id: number; status: string; row_count: number; message: string | null }>(`/api/v1/school/report-definitions/${savedId}/export`, asFilters());
      notify(j.status === "ready" ? `Exported ${j.row_count} rows. Download it from Data Exports.` : (j.message ?? "The export did not finish."));
      saved.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  // After loading a saved report, a changed filter applies to that run only.
  const setFilter = (k: string, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  /** The flat filter map the API takes, typed as the old data desk sent it. */
  function asFilters() {
    const out: Record<string, unknown> = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v === "" || !spec?.filters.includes(k)) return;
      if (k === "only_failed") out[k] = v === "true";
      else if (ID_KEYS.includes(k) || k === "below_percent") out[k] = Number(v);
      else out[k] = v;
    });
    return out;
  }

  async function run(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!spec) return;
    setBusy(true);
    setError(null);
    try {
      let id = savedId;
      if (!id) {
        const created = await api.post<Definition>("/api/v1/school/report-definitions", {
          name: name.trim(),
          code: codeFor(name.trim()),
          source,
          filters: asFilters(),
          columns,
          sort_by: sortBy || null,
          group_by: groupBy || null,
        });
        id = created.id;
        setSavedId(id);
        saved.reload();
        notify("Report saved.");
      }
      const r = await api.post<Result>(`/api/v1/school/report-definitions/${id}/run`, asFilters());
      setResult(r);
      saved.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (text: string, control: JSX.Element, required = false, full = false) => (
    <label className={`field ${full ? "full" : ""}`} key={text}>
      <span>
        {text}
        {required ? <span className="req">*</span> : null}
      </span>
      {control}
    </label>
  );

  function filterControl(k: string) {
    const v = filters[k] ?? "";
    const on = (e: { target: { value: string } }) => setFilter(k, e.target.value);
    if (k === "academic_year_id") {
      return (
        <select value={v} onChange={on}>
          <option value="">Any year</option>
          {y.years.map((yr) => (
            <option key={yr.id} value={yr.id}>
              {yr.name}
            </option>
          ))}
        </select>
      );
    }
    if (k === "class_id") {
      return (
        <select value={v} onChange={(e) => setFilters((f) => ({ ...f, class_id: e.target.value, section_id: "" }))}>
          <option value="">All classes</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      );
    }
    if (k === "section_id") {
      return (
        <select value={v} onChange={on} disabled={!filters.class_id}>
          <option value="">{filters.class_id ? "All sections" : "Choose a class first"}</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      );
    }
    if (k === "exam_id") {
      return (
        <select value={v} onChange={on}>
          <option value="">All exams</option>
          {exams.data?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      );
    }
    if (k === "only_failed") {
      return (
        <select value={v} onChange={on}>
          <option value="">Everyone</option>
          <option value="true">Only failed</option>
        </select>
      );
    }
    if (k === "below_percent") return <input type="number" min={0} max={100} step="0.1" value={v} onChange={on} placeholder="e.g. 75" />;
    const choices = CHOICES[k]?.[source];
    if (choices) {
      return (
        <select value={v} onChange={on}>
          <option value="">Any</option>
          {choices.map((c) => (
            <option key={c} value={c}>
              {label(c)}
            </option>
          ))}
        </select>
      );
    }
    return <input value={v} onChange={on} />;
  }

  const dateKeys = (spec?.filters ?? []).filter((k) => DATE_KEYS.includes(k));
  const otherKeys = (spec?.filters ?? []).filter((k) => !DATE_KEYS.includes(k));
  const filterText = Object.entries(asFilters()).map(([k, v]) => `${label(k)} = ${show(v)}`).join(", ");

  const configRows: Row[] = [
    ["Data source", spec?.label ?? "—"],
    ["Columns", columns.length ? columns.map(label).join(", ") : "All columns"],
    ["Group by", groupBy ? label(groupBy) : "No grouping"],
    ["Sort by", sortBy ? label(sortBy) : "Source order"],
    ["Filters", filterText || "None — every row the source holds"],
    ["Output", savedId ? "Runs the saved report" : "Saved, then run"],
  ];
  const resultRows: Row[] = (result?.rows ?? []).map((r) => result!.columns.map((c) => show(r[c])));
  const resultCols = (result?.columns ?? []).map(label);

  return (
    <>
      <div className="two-col">
        <form id="report-builder" className="panel" onSubmit={run}>
          <div className="panel-pad">
            <ErrorNote>{error ?? sources.error}</ErrorNote>
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Details</h3>
                </div>
                <div className="form-grid">
                  {field(
                    "Report name",
                    <input type="text" placeholder="Enter report name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={160} disabled={locked} />,
                    true,
                  )}
                  {field(
                    "Data source",
                    <select value={source} onChange={(e) => pickSource(e.target.value)} required disabled={Boolean(savedId)}>
                      {sources.data?.map((s) => (
                        <option key={s.source} value={s.source}>
                          {s.label}
                        </option>
                      ))}
                    </select>,
                    true,
                  )}
                  {dateKeys.map((k) => field(label(k), <input type="date" value={filters[k] ?? ""} onChange={(e) => setFilter(k, e.target.value)} />))}
                  {field(
                    "Group by",
                    <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} disabled={locked}>
                      <option value="">No grouping</option>
                      {(columns.length ? columns : (spec?.columns ?? [])).map((c) => (
                        <option key={c} value={c}>
                          {label(c)}
                        </option>
                      ))}
                    </select>,
                  )}
                  {field(
                    "Sort by",
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} disabled={locked}>
                      <option value="">Source order</option>
                      {spec?.columns.map((c) => (
                        <option key={c} value={c}>
                          {label(c)}
                        </option>
                      ))}
                    </select>,
                  )}
                  {otherKeys.map((k) => field(label(k.replace(/_id$/, "")), filterControl(k)))}
                  <div className="field full">
                    <span>Columns</span>
                    <div className="row" style={{ flexWrap: "wrap", gap: "8px 18px" }}>
                      {spec?.columns.map((c) => (
                        <label key={c} className="row" style={{ gap: 6, fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={columns.includes(c)}
                            disabled={locked}
                            onChange={(e) => setColumns((cs) => (e.target.checked ? [...cs, c] : cs.filter((x) => x !== c)))}
                          />
                          {label(c)}
                        </label>
                      ))}
                    </div>
                    <small className="muted">Leave all unticked for every column.</small>
                  </div>
                </div>
              </section>
            </div>
          </div>
          <div className="form-footer">
            <span>Fields marked * are required</span>
            <div className="actions">
              {editing ? (
                <>
                  <button type="button" className="btn" onClick={() => chosenSaved && (load(chosenSaved), setEditing(false))}>
                    Discard changes
                  </button>
                  <button type="button" className="btn primary" disabled={busy} onClick={saveEdit}>
                    <Icon name="check" className="sm" />
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                </>
              ) : (
                <button type="button" className="btn" onClick={() => router.back()}>
                  Cancel
                </button>
              )}
              <button type="submit" className="btn primary" disabled={busy || !spec || editing}>
                <Icon name="check" className="sm" />
                {busy ? "Running…" : "Run report"}
              </button>
            </div>
          </div>
        </form>
        <aside className="stack">
          <div className="aside-panel">
            <h3>{"Reports & analytics"}</h3>
            <label className="field">
              <span>Saved reports</span>
              <select value={savedId ?? ""} onChange={(e) => pickSaved(e.target.value)}>
                <option value="">New report</option>
                {saved.data?.map((d) => (
                  <option key={d.id} value={d.id}>{`${d.name} · ${d.source_label}${d.is_active ? "" : " (inactive)"}`}</option>
                ))}
              </select>
            </label>
            <div className="gap" />
            <Kv
              rows={[
                ["Academic year", y.year?.name ?? "—"],
                ["Saved reports", saved.data ? String(saved.data.length) : "…"],
                ["Status", chosenSaved ? (chosenSaved.is_active ? "Active" : "Inactive") : "New"],
                ["Last run", chosenSaved?.last_run_at ? `${dateTime(chosenSaved.last_run_at)} · ${chosenSaved.run_count} runs` : "Never"],
                ...(chosenSaved ? ([["Code", chosenSaved.code], ["Created by", chosenSaved.created_by_name ?? "—"]] as [string, string][]) : []),
              ]}
            />
            {chosenSaved ? (
              <>
                <div className="gap" />
                {editing ? (
                  <label className="row" style={{ gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                    Active (inactive reports stay listed here but are marked)
                  </label>
                ) : null}
                <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {!editing ? (
                    <button type="button" className="btn" disabled={busy} onClick={() => setEditing(true)}>
                      Edit report
                    </button>
                  ) : null}
                  <button type="button" className="btn" disabled={busy || editing} onClick={exportFile}>
                    <Icon name="download" className="sm" />
                    Export to file
                  </button>
                  <button type="button" className="btn text" disabled={busy} onClick={remove}>
                    Delete
                  </button>
                </div>
                <p className="small muted" style={{ marginTop: 8 }}>
                  {editing ? "The filters on the form become this report's saved filters; the data source cannot change." : "Exported files are kept under "}
                  {editing ? null : <Link href={EXPORTS_ROUTE}>Data exports</Link>}
                  {editing ? null : "."}
                </p>
              </>
            ) : null}
            <div className="gap" />
            <p>Filters are the fixed fields each source offers; there are no operators. A saved report can be run again with different filters.</p>
          </div>
        </aside>
      </div>
      <div className="gap" />
      {result ? (
        <Panel
          title={`Results · ${result.name}`}
          sub={`${result.row_count} row${result.row_count === 1 ? "" : "s"}${result.truncated ? " · showing the first rows only" : ""}`}
          action={
            <button type="button" className="btn" onClick={() => downloadCsv(`report-${result.report_id}`, resultCols, resultRows)}>
              <Icon name="download" className="sm" />
              CSV
            </button>
          }
          flush
        >
          {result.group_by && result.groups?.length ? (
            <div className="approval-summary">
              <strong>{`Grouped by ${label(result.group_by)}`}</strong>
              <span>{result.groups.map((g) => `${show(g.value)}: ${g.count}`).join(" · ")}</span>
            </div>
          ) : null}
          <DataTable columns={resultCols} rows={resultRows} selectable={false} rowAction={false} empty="Nothing matched those filters." />
        </Panel>
      ) : (
        <Panel title="Preview configuration" flush>
          <DataTable columns={["Parameter", "Selected value"]} rows={configRows} selectable={false} rowAction={false} />
        </Panel>
      )}
    </>
  );
}
