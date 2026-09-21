"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Dialog, DialogActions, Field, Kv, SearchBox, downloadCsv, usePageAction, useSearch } from "./setupKit";
import type { AcademicYear, Term } from "./types";

const COLUMNS = ["Academic year", "Start date", "End date", "Terms", "Status"];

const statusOf = (y: AcademicYear) => (y.is_archived ? "Archived" : y.is_current ? "Current" : "Active");

/**
 * SCR-092, live: GET /academic-years (include_archived), terms per year;
 * POST to create, PATCH to edit, set-current / archive / unarchive, DELETE.
 */
export function AcademicYears() {
  const [showArchived, setShowArchived] = useState(false);
  const [status, setStatus] = useState("");
  const list = useApi<AcademicYear[]>("/api/v1/school/academic-years", { include_archived: showArchived });
  const [terms, setTerms] = useState<Map<number, number>>(new Map());
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<AcademicYear | null>(null);

  const years = list.data ?? [];
  const yearKey = years.map((y) => y.id).join(",");
  useEffect(() => {
    let live = true;
    Promise.all(
      years.map((y) =>
        api
          .get<Term[]>(`/api/v1/school/academic-years/${y.id}/terms`)
          .then((t) => [y.id, t.length] as const)
          .catch(() => null),
      ),
    ).then((all) => live && setTerms(new Map(all.filter((x): x is readonly [number, number] => x !== null))));
    return () => {
      live = false;
    };
    // yearKey stands for the list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearKey]);

  const filtered = years.filter((y) => !status || statusOf(y) === status);
  const { q, setQ, shown } = useSearch(filtered, (y) => y.name);
  const rows: Row[] = shown.map((y) => {
    const n = terms.get(y.id);
    return [y.name, date(y.start_date), date(y.end_date), n === undefined ? "…" : `${n} term${n === 1 ? "" : "s"}`, statusOf(y)];
  });

  usePageAction("add", useCallback(() => setAdding(true), []));
  usePageAction(
    "export",
    useCallback(() => downloadCsv("academic-years.csv", COLUMNS, rows.map((r) => r.map(String))), [rows]),
  );

  return (
    <>
      <div className="filterbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search academic years…" />
        <select aria-label="Archived years" value={showArchived ? "yes" : "no"} onChange={(e) => setShowArchived(e.target.value === "yes")}>
          <option value="no">Hide archived years</option>
          <option value="yes">Show archived years</option>
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option>Current</option>
          <option>Active</option>
          <option>Archived</option>
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel title="All records" sub={`${years.length} academic year${years.length === 1 ? "" : "s"}${list.loading ? " · Loading…" : ""}`} flush>
        {/* Not wired: the mock's "Admissions" open/closed column — the API keeps no admissions flag on a year. */}
        <DataTable
          columns={COLUMNS}
          rows={rows}
          onView={(i) => setOpen(shown[i])}
          empty={list.loading ? "Loading academic years…" : "No academic years match."}
        />
      </Panel>
      {adding ? <YearForm onClose={() => setAdding(false)} onSaved={list.reload} /> : null}
      {open ? <YearDialog y={open} terms={terms.get(open.id)} onClose={() => setOpen(null)} onChanged={list.reload} /> : null}
    </>
  );
}

function YearForm({ y, onClose, onSaved }: { y?: AcademicYear; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { name: String(f.get("name")).trim(), start_date: String(f.get("start_date")), end_date: String(f.get("end_date")) };
    setSaving(true);
    setError(null);
    try {
      if (y) await api.patch(`/api/v1/school/academic-years/${y.id}`, body);
      else await api.post("/api/v1/school/academic-years", { ...body, is_current: f.get("is_current") === "on" });
      notify(y ? "Academic year updated." : `${body.name} created.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog title={y ? `Edit ${y.name}` : "Add academic year"} onClose={onClose} error={error}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Name" required full>
            <input name="name" required defaultValue={y?.name} placeholder="e.g. 2026-27" />
          </Field>
          <Field label="Start date" required>
            <input type="date" name="start_date" required defaultValue={y?.start_date} />
          </Field>
          <Field label="End date" required>
            <input type="date" name="end_date" required defaultValue={y?.end_date} />
          </Field>
          {!y ? (
            <label className="row full" style={{ gridColumn: "1/-1", fontSize: 13 }}>
              <input type="checkbox" name="is_current" />
              Make this the current year
            </label>
          ) : null}
        </div>
        <DialogActions onCancel={onClose} saving={saving} submit={y ? "Save changes" : "Create year"} />
      </form>
    </Dialog>
  );
}

function YearDialog({ y, terms, onClose, onChanged }: { y: AcademicYear; terms?: number; onClose: () => void; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(path: string, done: string, del = false) {
    if (del && !window.confirm(`Delete ${y.name}? This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      if (del) await api.delete(`/api/v1/school/academic-years/${y.id}`);
      else await api.post(`/api/v1/school/academic-years/${y.id}${path}`);
      notify(done);
      onChanged();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (editing) return <YearForm y={y} onClose={onClose} onSaved={onChanged} />;
  return (
    <Dialog title={y.name} onClose={onClose} error={error}>
      <Kv
        rows={[
          ["Start date", date(y.start_date)],
          ["End date", date(y.end_date)],
          ["Terms", terms === undefined ? "…" : String(terms)],
          ["Status", statusOf(y)],
        ]}
      />
      <DialogActions onCancel={onClose} submit={null}>
        {!y.is_archived ? (
          <button type="button" className="btn" disabled={busy} onClick={() => setEditing(true)}>
            Edit
          </button>
        ) : null}
        {!y.is_current && !y.is_archived ? (
          <button type="button" className="btn" disabled={busy} onClick={() => run("/set-current", `${y.name} is now the current year.`)}>
            Set as current
          </button>
        ) : null}
        {y.is_archived ? (
          <button type="button" className="btn" disabled={busy} onClick={() => run("/unarchive", `${y.name} restored.`)}>
            Unarchive
          </button>
        ) : (
          <button type="button" className="btn" disabled={busy} onClick={() => run("/archive", `${y.name} archived.`)}>
            Archive
          </button>
        )}
        {!y.is_current ? (
          <button type="button" className="btn danger" disabled={busy} onClick={() => run("", `${y.name} deleted.`, true)}>
            Delete
          </button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
