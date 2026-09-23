"use client";

import { useCallback, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Dialog, DialogActions, Field, SearchBox, YearSelect, downloadCsv, usePageAction, useSearch, useYears } from "./setupKit";
import type { Term } from "./types";

import { ask } from "@/lib/dialog";
const COLUMNS = ["Term", "Academic year", "Start date", "End date", "Working days", "Status"];

/** Where a term stands against today: its dates are all the API keeps. */
function statusOf(t: Term, today: string) {
  if (t.end_date < today) return "Closed";
  if (t.start_date > today) return "Scheduled";
  return "Active";
}

/** The school's own count when set, else working weekdays less holidays as the calendar has them. */
const days = (t: Term) => t.working_days ?? t.school_days ?? Math.round((Date.parse(t.end_date) - Date.parse(t.start_date)) / 86400000) + 1;

/** SCR-093, live: GET/POST /academic-years/{id}/terms, PUT /academic-years/{id}/terms/{term}, DELETE /terms/{id}. */
export function Terms() {
  const { years, yearId, setYearId, year, error: yearsError, loaded } = useYears();
  const list = useApi<Term[]>(yearId ? `/api/v1/school/academic-years/${yearId}/terms` : null);
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Term | "new" | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const terms = (list.data ?? []).filter((t) => !status || statusOf(t, today) === status);
  const { q, setQ, shown } = useSearch(terms, (t) => t.name);
  const rows: Row[] = shown.map((t) => [t.name, year?.name ?? "—", date(t.start_date), date(t.end_date), String(days(t)), statusOf(t, today)]);

  const all = list.data ?? [];
  const now = all.find((t) => statusOf(t, today) === "Active");
  const wait = !yearId || (list.loading && !list.data);
  const stats = [
    { label: "Terms", value: wait ? "…" : String(all.length), note: year?.name ?? "this year" },
    { label: "Current term", value: wait ? "…" : now?.name ?? "None", note: now ? `ends ${date(now.end_date)}` : "no term running today" },
    { label: "Days left", value: wait ? "…" : now ? String(Math.round((Date.parse(now.end_date) - Date.parse(today)) / 86400000)) : "—", note: "in the current term" },
    { label: "Working days", value: wait ? "…" : String(all.reduce((s, t) => s + days(t), 0)), note: "across the year's terms" },
  ];

  usePageAction("add", useCallback(() => setEditing("new"), []));
  usePageAction(
    "export",
    useCallback(() => downloadCsv(`terms-${year?.name ?? ""}.csv`, COLUMNS, rows.map((r) => r.map(String))), [rows, year]),
  );

  return (
    <>
      <StatStrip items={loaded && !yearId ? stats.map((x) => ({ ...x, value: "—" })) : stats} compact />
      <div className="filterbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search terms or semesters…" />
        <YearSelect years={years} yearId={yearId} onChange={setYearId} />
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option>Active</option>
          <option>Scheduled</option>
          <option>Closed</option>
        </select>
      </div>
      <ErrorNote>{yearsError ?? list.error}</ErrorNote>
      <Panel flush>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          onView={(i) => setEditing(shown[i])}
          empty={list.loading ? "Loading terms…" : "No terms in this academic year yet."}
        />
      </Panel>
      {editing && yearId ? (
        <TermForm yearId={yearId} t={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} onSaved={list.reload} />
      ) : null}
    </>
  );
}

function TermForm({ yearId, t, onClose, onSaved }: { yearId: number; t?: Term; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const wd = String(f.get("working_days") ?? "").trim();
    const body = {
      name: String(f.get("name")).trim(),
      start_date: String(f.get("start_date")),
      end_date: String(f.get("end_date")),
      working_days: wd ? Number(wd) : null,
    };
    setSaving(true);
    setError(null);
    try {
      if (t) await api.put(`/api/v1/school/academic-years/${yearId}/terms/${t.id}`, body);
      else await api.post(`/api/v1/school/academic-years/${yearId}/terms`, body);
      notify(t ? "Term updated." : "Term added.");
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!t || !(await ask(`Delete ${t.name}?`))) return;
    setSaving(true);
    try {
      await api.delete(`/api/v1/school/terms/${t.id}`);
      notify(`${t.name} deleted.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title={t ? `Edit ${t.name}` : "Add term"} onClose={onClose} error={error}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Name" required full>
            <input name="name" required defaultValue={t?.name} placeholder="e.g. Term 1" />
          </Field>
          <Field label="Start date" required>
            <input type="date" name="start_date" required defaultValue={t?.start_date} />
          </Field>
          <Field label="End date" required>
            <input type="date" name="end_date" required defaultValue={t?.end_date} />
          </Field>
          <Field label="Working days" full>
            <input
              type="number"
              name="working_days"
              min={0}
              max={366}
              defaultValue={t?.working_days ?? ""}
              placeholder={t?.school_days != null ? `Leave blank to use the calendar: ${t.school_days} days` : "Leave blank to count from the calendar"}
            />
          </Field>
        </div>
        <DialogActions onCancel={onClose} saving={saving} submit={t ? "Save changes" : "Add term"}>
          {t ? (
            <button type="button" className="btn danger" disabled={saving} onClick={remove}>
              Delete
            </button>
          ) : null}
        </DialogActions>
      </form>
    </Dialog>
  );
}
