"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText, type Paginated } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { COLUMNS, MAX_ROWS, parseStudents, type ParsedRow } from "./csv";
import type { AcademicYear, BulkResult, SchoolClass, Student } from "./types";

import { ask } from "@/lib/dialog";
type Outcome = { created: Student[]; failed: { line: number; name: string; error: string }[]; sectionLabel: string };

/**
 * NEW-010, live: POST /api/v1/school/students/bulk into one section.
 * The file is read and checked here (dates, genders, lengths, repeated
 * names) so a single bad cell cannot fail the whole request; the good rows
 * are sent, and the server's own per-row refusals come back mapped to the
 * file's line numbers. GET /students/import-template.csv for the template,
 * /academic-years, /classes and /students (seat count) for the picker.
 */
export function BulkImport() {
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const [yearId, setYearId] = useState<number | null>(null);
  const [classId, setClassId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Outcome | null>(null);

  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);

  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const cls = classes.data?.find((c) => c.id === classId);
  const section = cls?.sections.find((s) => s.id === sectionId);
  useEffect(() => {
    setClassId(null);
    setSectionId(null);
  }, [yearId]);
  useEffect(() => {
    setSectionId(cls?.sections.length === 1 ? cls.sections[0].id : null);
  }, [cls]);

  const seated = useApi<Paginated<Student>>(sectionId && yearId ? "/api/v1/school/students" : null, {
    academic_year_id: yearId,
    section_id: sectionId,
    status: "active",
    page_size: 1,
  });

  const parsed = useMemo(() => parseStudents(text), [text]);
  const good = parsed.rows.filter((r) => !r.problems.length);
  const bad = parsed.rows.length - good.length;
  const current = seated.data?.total;
  const seatsLeft = section && section.capacity > 0 && current !== undefined ? section.capacity - current : null;
  const tooMany = good.length > MAX_ROWS;
  const overCapacity = seatsLeft !== null && good.length > seatsLeft;

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setFileName(f.name);
    setText(await f.text());
    setDone(null);
    setError(null);
  }

  async function template() {
    try {
      await api.download("/api/v1/school/students/import-template.csv", "students-import-template.csv");
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function submit() {
    if (!yearId || !sectionId || !section || !cls) return setError("Choose the academic year, class and section first.");
    if (!good.length) return setError("There are no rows ready to import.");
    if (tooMany) return setError(`One import takes at most ${MAX_ROWS} students. Split the file and import it in parts.`);
    if (bad && !(await ask(`${bad} row(s) have problems and will be skipped. Import the other ${good.length}?`))) return;
    setBusy(true);
    setError(null);
    const sent: ParsedRow[] = good;
    try {
      const r = await api.post<BulkResult>("/api/v1/school/students/bulk", {
        academic_year_id: yearId,
        section_id: sectionId,
        students: sent.map((x) => x.data),
      });
      const failed = r.errors.map((e) => ({
        line: sent[e.row]?.line ?? e.row + 2,
        name: e.full_name ?? sent[e.row]?.data.full_name ?? "—",
        error: e.error,
      }));
      setDone({ created: r.created, failed, sectionLabel: `${cls.name} ${section.name}` });
      setText("");
      setFileName(null);
      seated.reload();
      notify(`${r.created.length} student${r.created.length === 1 ? "" : "s"} added to ${cls.name} ${section.name}.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const preview: Row[] = parsed.rows.map((r) => [
    String(r.line),
    r.data.full_name ?? "—",
    r.data.gender ? label(r.data.gender) : "—",
    date(r.data.dob),
    r.data.blood_group ?? "—",
    r.data.address ?? "—",
    r.problems.length ? "Rejected" : "Ready",
    r.problems.join("; ") || "—",
  ]);

  const stats = [
    { label: "Rows in file", value: String(parsed.rows.length), note: fileName ?? (text ? "Pasted rows" : "Nothing loaded yet") },
    { label: "Ready to import", value: String(good.length), note: tooMany ? `Over the ${MAX_ROWS}-row limit` : "Pass every check" },
    { label: "With problems", value: String(bad), note: bad ? "Skipped on import" : "None found" },
    {
      label: "Seats left",
      value: seatsLeft === null ? "—" : String(seatsLeft),
      note: section ? (section.capacity > 0 ? `${current ?? "…"} of ${section.capacity} taken` : "No capacity set") : "Choose a section",
    },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="two-col">
        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Upload students</h2>
                <p>Everyone in one file goes into the same section. Admission and roll numbers are given out in order.</p>
              </div>
            </div>
            <div className="panel-body">
              <ErrorNote>{error ?? years.error ?? classes.error}</ErrorNote>
              <div className="form-grid three">
                <label className="field">
                  <span>
                    Academic year<span className="req">*</span>
                  </span>
                  <select value={yearId ?? ""} onChange={(e) => setYearId(Number(e.target.value))}>
                    {years.data?.map((y) => (
                      <option key={y.id} value={y.id}>
                        {`${y.name}${y.is_current ? " (current)" : ""}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>
                    Class<span className="req">*</span>
                  </span>
                  <select value={classId ?? ""} onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">{classes.loading ? "Loading…" : "Choose a class"}</option>
                    {classes.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>
                    Section<span className="req">*</span>
                  </span>
                  <select value={sectionId ?? ""} onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)} disabled={!cls}>
                    <option value="">Choose a section</option>
                    {cls?.sections.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="gap" />
              <div className="upload-zone">
                <Icon name="folder" />
                <strong>{fileName ?? "Choose a CSV file"}</strong>
                {fileName ? "" : "or paste the rows below"}
                <br />
                <span className="small muted">CSV with a header line · up to {MAX_ROWS} students</span>
                <input type="file" accept=".csv,text/csv,text/plain" aria-label="Choose a CSV file" onChange={pick} />
              </div>
              <div className="gap" />
              <label className="field full">
                <span>Rows</span>
                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setFileName(null);
                    setDone(null);
                  }}
                  placeholder={"full_name,gender,dob,blood_group,address\nAarav Sharma,male,2018-05-12,O+,12 MG Road"}
                  style={{ height: 150, fontFamily: "var(--mono, monospace)" }}
                  spellCheck={false}
                />
                <span className="field-hint">Paste from a spreadsheet (tab-separated works too). Nothing is saved until you import.</span>
              </label>
              {parsed.error ? <ErrorNote>{parsed.error}</ErrorNote> : null}
              {parsed.unknown.length ? (
                <p className="muted small">{`Ignored column${parsed.unknown.length === 1 ? "" : "s"}: ${parsed.unknown.join(", ")}`}</p>
              ) : null}
              {overCapacity ? (
                <div className="tip warn" style={{ marginTop: 12 }}>
                  <Icon name="bell" className="sm" />
                  <span>{`${good.length} rows but only ${seatsLeft} seat(s) left in this section. The server will refuse the whole import; raise the capacity or split the file.`}</span>
                </div>
              ) : null}
            </div>
            <div className="form-footer">
              <span>{good.length ? `${good.length} ready${bad ? `, ${bad} will be skipped` : ""}` : "Checking the rows writes nothing"}</span>
              <div className="actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setText("");
                    setFileName(null);
                  }}
                  disabled={busy || !text}
                >
                  Clear
                </button>
                <button type="button" className="btn primary" onClick={submit} disabled={busy || !good.length || !sectionId || tooMany}>
                  <Icon name="check" className="sm" />
                  {busy ? "Importing…" : good.length ? `Import ${good.length} student${good.length === 1 ? "" : "s"}` : "Import students"}
                </button>
              </div>
            </div>
          </section>

          {done ? (
            <Panel title="Import finished" sub={`${done.created.length} added to ${done.sectionLabel}${done.failed.length ? ` · ${done.failed.length} refused` : ""}`} flush>
              <DataTable
                columns={["Student", "Admission no.", "Roll no.", "Date of birth"]}
                rows={done.created.map((s) => [{ name: s.full_name, sub: s.admission_no }, s.admission_no, String(s.roll_no ?? "—"), date(s.dob)])}
                selectable={false}
                actions={(i) => (
                  <Link className="btn" href={`${routeOf(57)}?id=${done.created[i].id}`}>
                    View
                  </Link>
                )}
                empty="No students were added."
              />
              {done.failed.length ? (
                <div className="panel-pad">
                  <ErrorNote>
                    {done.failed.map((f) => (
                      <span key={f.line} style={{ display: "block" }}>{`Line ${f.line} · ${f.name}: ${f.error}`}</span>
                    ))}
                  </ErrorNote>
                </div>
              ) : null}
            </Panel>
          ) : null}

          <Panel title="Preview" sub={parsed.rows.length ? `${parsed.rows.length} row(s) read · line numbers match the file` : "Load a file or paste rows to check them"} flush>
            <DataTable
              columns={["Line", "Student", "Gender", "Date of birth", "Blood group", "Address", "Status", "Problem"]}
              rows={preview}
              selectable={false}
              rowAction={false}
              empty={text ? "No rows under the header." : "Nothing to preview yet."}
            />
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="File template">
            <p className="muted small">Use these column names on the first line. Only full_name is required.</p>
            <div className="gap" />
            {COLUMNS.map((c) => (
              <div className="event-row" style={{ padding: "9px 0" }} key={c}>
                <strong className="small">{c}</strong>
              </div>
            ))}
            <div className="gap" />
            <button type="button" className="btn" onClick={template}>
              <Icon name="download" className="sm" />
              Download template
            </button>
          </Panel>
          <Panel title="Validation checklist">
            <div className="checklist">
              {[
                "Every student has a full name of at least two letters",
                "No name appears twice in the same file",
                "Gender is male, female or other (M / F accepted)",
                "Date of birth is YYYY-MM-DD or DD/MM/YYYY, and not in the future",
                `At most ${MAX_ROWS} students, and no more than the section's free seats`,
              ].map((x) => (
                <div className="check-item" key={x}>
                  <Icon name="check" className="sm" />
                  <label>{x}</label>
                </div>
              ))}
            </div>
          </Panel>
          <div className="tip">
            <Icon name="shield" className="sm" />
            <span>Guardians, documents and logins are added afterwards, from each student&apos;s profile and the Student Logins screen.</span>
          </div>
        </aside>
      </div>
    </>
  );
}
