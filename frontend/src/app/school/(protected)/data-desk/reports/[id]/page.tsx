"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, LayoutList, Database, Filter, Play, Repeat, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  WarnBox,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

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
type SourceInfo = {
  source: string;
  label: string;
  columns: string[];
  filters: string[];
};
type RunResult = {
  report_id: number;
  name: string;
  columns: string[];
  row_count: number;
  rows: Record<string, unknown>[];
  truncated: boolean;
};
type SchoolClass = { id: number; name: string };
type Section = { id: number; name: string };
type AcademicYear = { id: number; name: string };
type Exam = { id: number; name: string };

/** What each filter key expects.
 *
 *  The backend has no filter language: `filters` is a flat map and each key
 *  carries its own meaning in its name — `due_from` is a lower bound because
 *  the query says so, not because an operator was chosen. So this offers
 *  exactly the keys the chosen source declares, and nothing else. An operator
 *  picker would be a promise the API cannot keep.
 */
type Kind = "class" | "section" | "year" | "exam" | "date" | "number" | "bool" | "choice";

const KINDS: Record<string, Kind> = {
  academic_year_id: "year",
  class_id: "class",
  section_id: "section",
  exam_id: "exam",
  due_from: "date",
  due_to: "date",
  from: "date",
  to: "date",
  below_percent: "number",
  only_failed: "bool",
  status: "choice",
  gender: "choice",
  role: "choice",
};

// `status` means different things to different sources, so the options follow
// the source rather than the key.
const CHOICES: Record<string, Record<string, string[]>> = {
  status: {
    students: ["active", "inactive"],
    staff: ["active", "inactive"],
    fees: ["pending", "paid", "waived"],
  },
  gender: { students: ["male", "female", "other"] },
  role: {
    staff: ["teacher", "staff", "principal", "accountant", "school_admin"],
  },
};

const HINTS: Record<string, string> = {
  section_id: "A section wins over a class — set one or the other.",
  class_id: "Ignored if a section is also set.",
  due_from: "On or after this date.",
  due_to: "On or before this date.",
  from: "On or after this date.",
  to: "On or before this date.",
  below_percent: "Only rows under this attendance percentage.",
  only_failed: "Only rows the child did not pass.",
};

export default function ReportDefinitionPage() {
  const { id } = useParams<{ id: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [draft, setDraft] = useState<[string, string][]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Report>(`/api/v1/school/report-definitions/${id}`)
      .then((r) => {
        setReport(r.data);
        setDraft(
          Object.entries(r.data.filters ?? {}).map(([k, v]) => [k, String(v ?? "")])
        );
      })
      .catch((e) => setError(apiError(e)));
    api
      .get<SourceInfo[]>("/api/v1/school/report-sources")
      .then((r) => setSources(r.data))
      .catch(() => setSources([]));
    api
      .get<SchoolClass[]>("/api/v1/school/classes")
      .then((r) => setClasses(r.data))
      .catch(() => setClasses([]));
    api
      .get<AcademicYear[]>("/api/v1/school/academic-years")
      .then((r) => setYears(r.data))
      .catch(() => setYears([]));
    api
      .get<Exam[]>("/api/v1/school/exams")
      .then((r) => setExams(r.data))
      .catch(() => setExams([]));
  }, [id]);

  const spec = useMemo(
    () => sources.find((s) => s.source === report?.source) ?? null,
    [sources, report]
  );

  // Sections depend on whichever class the draft currently names.
  const classFilter = draft.find(([k]) => k === "class_id")?.[1];
  useEffect(() => {
    if (!classFilter) {
      setSections([]);
      return;
    }
    api
      .get<Section[]>(`/api/v1/school/classes/${classFilter}/sections`)
      .then((r) => setSections(r.data))
      .catch(() => setSections([]));
  }, [classFilter]);

  const unused = (spec?.filters ?? []).filter(
    (f) => !draft.some(([k]) => k === f)
  );

  const kindOf = (key: string): Kind => KINDS[key] ?? "number";

  const setValue = (i: number, value: string) =>
    setDraft((d) => d.map((row, n) => (n === i ? [row[0], value] : row)));

  /** Back to the shape the API stores: a flat map, with blanks dropped so an
   *  empty box does not become a filter on empty string. */
  const asFilters = () => {
    const out: Record<string, unknown> = {};
    draft.forEach(([k, v]) => {
      if (v === "" || v == null) return;
      const kind = kindOf(k);
      if (kind === "bool") out[k] = v === "true";
      else if (["class", "section", "year", "exam"].includes(kind)) out[k] = Number(v);
      else if (kind === "number") out[k] = Number(v);
      else out[k] = v;
    });
    return out;
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const r = await api.patch<Report>(
        `/api/v1/school/report-definitions/${id}`,
        { filters: asFilters() }
      );
      setReport(r.data);
      setSaved("Filters saved.");
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<RunResult>(
        `/api/v1/school/report-definitions/${id}/run`,
        asFilters()
      );
      setResult(r.data);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.post(
        `/api/v1/school/report-definitions/${id}/export`,
        asFilters()
      );
      setSaved("Export queued — find the file on the exports page.");
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const valueInput = (key: string, value: string, i: number) => {
    const kind = kindOf(key);
    if (kind === "bool") {
      return (
        <Select value={value} onChange={(e) => setValue(i, e.target.value)} aria-label="Value">
          <option value="">Any</option>
          <option value="true">Yes</option>
        </Select>
      );
    }
    if (kind === "choice") {
      const opts = CHOICES[key]?.[report?.source ?? ""] ?? [];
      return (
        <Select value={value} onChange={(e) => setValue(i, e.target.value)} aria-label="Value">
          <option value="">Any</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {humanize(o)}
            </option>
          ))}
        </Select>
      );
    }
    if (kind === "class") {
      return (
        <Select value={value} onChange={(e) => setValue(i, e.target.value)} aria-label="Class">
          <option value="">Any</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      );
    }
    if (kind === "section") {
      return (
        <Select value={value} onChange={(e) => setValue(i, e.target.value)} aria-label="Section">
          <option value="">Any</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      );
    }
    if (kind === "exam") {
      return (
        <Select value={value} onChange={(e) => setValue(i, e.target.value)} aria-label="Exam">
          <option value="">Any</option>
          {exams.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
      );
    }
    if (kind === "year") {
      return (
        <Select value={value} onChange={(e) => setValue(i, e.target.value)} aria-label="Academic year">
          <option value="">Any</option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </Select>
      );
    }
    return (
      <Input
        type={kind === "date" ? "date" : "number"}
        value={value}
        onChange={(e) => setValue(i, e.target.value)}
        aria-label="Value"
      />
    );
  };

  return (
    <div className="space-y-6">
      <Link
        href="/school/data-desk"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Data desk
      </Link>

      <PageHeader
        title={report?.name ?? "Report"}
        subtitle={report?.description ?? "Narrow the rows before you run it."}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={save} loading={busy}>
              Save filters
            </Button>
            <Button onClick={run} loading={busy}>
              <Play className="mr-1.5 h-4 w-4" />
              Run
            </Button>
            <Button variant="secondary" onClick={exportCsv} loading={busy}>
              Export
            </Button>
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <StatStrip
        stats={[
          {
            label: "Source",
            value: report?.source_label ?? "—",
            note: report?.code,
            icon: Database,
          },
          {
            label: "Columns",
            value: report?.columns.length ?? 0,
            note: "Returned by every run",
            icon: LayoutList,
          },
          {
            label: "Filters",
            value: draft.length,
            note: `of ${(spec?.filters ?? []).length} this source offers`,
            icon: Filter,
          },
          {
            label: "Times run",
            value: report?.run_count ?? 0,
            note: report?.last_run_at ? `last ${report.last_run_at.slice(0, 10)}` : "Never run",
            icon: Repeat,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          {unused.length > 0 && (
            <Select
              value=""
              aria-label="Add a filter"
              onChange={(e) =>
                e.target.value && setDraft((d) => [...d, [e.target.value, ""]])
              }
            >
              <option value="">Add a filter…</option>
              {unused.map((f) => (
                <option key={f} value={f}>
                  {humanize(f)}
                </option>
              ))}
            </Select>
          )}
        </CardHeader>
        <CardBody className="space-y-3">
          <NoticeBox>
            {report?.source_label ?? "This source"} can be filtered by{" "}
            {(spec?.filters ?? []).length} fixed field
            {(spec?.filters ?? []).length === 1 ? "" : "s"}. There are no operators —
            each field means one thing, so a date named &ldquo;from&rdquo; is always a
            lower bound and a class is always an exact match.
          </NoticeBox>

          {draft.length === 0 && (
            <p className="text-[13px] text-ink-subtle">
              No filters yet — the report returns everything the source holds.
            </p>
          )}

          {draft.map(([key, value], i) => (
            <div key={`${key}-${i}`} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px]">
                <span className="mb-1 block text-[12px] font-bold text-ink-muted">
                  {humanize(key)}
                </span>
                <Badge tone="neutral">{key}</Badge>
              </div>
              <div className="min-w-[200px] flex-1">{valueInput(key, value, i)}</div>
              <Button
                variant="secondary"
                aria-label={`Remove the ${humanize(key)} filter`}
                onClick={() => setDraft((d) => d.filter((_, n) => n !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              {HINTS[key] && (
                <p className="w-full text-[11px] text-ink-subtle">{HINTS[key]}</p>
              )}
            </div>
          ))}

          {draft.some(([k]) => k === "section_id") &&
            draft.some(([k]) => k === "class_id") && (
              <WarnBox>
                Both a class and a section are set. The section wins and the class is
                ignored — that is how the query is written, not a choice this screen
                makes.
              </WarnBox>
            )}
        </CardBody>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{result.row_count} row(s)</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">
                {result.name} · {result.columns.length} column
                {result.columns.length === 1 ? "" : "s"}, as the filters above stood when
                it ran.
              </p>
            </div>
            {result.truncated && <Badge tone="amber">Truncated</Badge>}
          </CardHeader>
          <CardBody className="p-0">
            <Table
              head={result.columns.map((c) => humanize(c))}
              empty={result.rows.length === 0 && "Nothing matched those filters."}
            >
              {result.rows.map((row, i) => (
                <tr key={i}>
                  {result.columns.map((c, n) => (
                    <td key={c} className={n === 0 ? tdStrong : td}>
                      {row[c] === null || row[c] === undefined ? "—" : String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </Table>
          </CardBody>
          <PanelFooter
            left={`Showing ${result.rows.length} of ${result.row_count} row(s)`}
            right={
              result.truncated
                ? "Cut short — export for the whole set"
                : "The whole result"
            }
          />
        </Card>
      )}
    </div>
  );
}
