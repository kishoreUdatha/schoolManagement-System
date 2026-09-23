"use client";

import { useCallback, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Dialog, DialogActions, Field, Kv, SearchBox, YearSelect, usePageAction, useSearch, useYears } from "./setupKit";
import type { Curriculum, SchoolClass, Subject } from "./types";

const COLUMNS = ["Curriculum", "Board", "Class", "Subjects", "Periods / week", "Status"];
const BASE = "/api/v1/school/academics/curricula";

/**
 * SCR-098, live: GET/POST /academics/curricula (academic_year_id, state),
 * POST /curricula/{id}/activate|retire, PUT /curricula/{id}/subjects,
 * DELETE /curricula/{id}/subjects/{subject_id}.
 */
export function Curricula() {
  const { years, yearId, setYearId, year, error: yearsError } = useYears();
  const [state, setState] = useState("");
  const [classId, setClassId] = useState("");
  const list = useApi<Curriculum[]>(yearId ? BASE : null, { academic_year_id: yearId, state });
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const subjects = useApi<Subject[]>("/api/v1/school/subjects");
  const [editing, setEditing] = useState<number | "new" | null>(null);

  const items = (list.data ?? []).filter((c) => !classId || String(c.class_id) === classId);
  const { q, setQ, shown } = useSearch(items, (c) => `${c.name} ${c.board ?? ""} ${c.class_name ?? ""}`);
  const rows: Row[] = shown.map((c) => [
    c.name,
    c.board ?? "—",
    c.class_name ?? "Whole school",
    c.subjects.map((s) => s.subject_name).join(", ") || "—",
    String(c.periods_per_week),
    label(c.status),
  ]);

  const all = list.data ?? [];
  const n = (v: number) => (list.loading && !list.data ? (list.loading ? "…" : "—") : String(v));
  const stats = [
    { label: "Curricula", value: n(all.length), note: year?.name ?? "this year" },
    { label: "Active", value: n(all.filter((c) => c.status === "active").length), note: "in force now" },
    { label: "Drafts", value: n(all.filter((c) => c.status === "draft").length), note: "not yet activated" },
    { label: "Without subjects", value: n(all.filter((c) => !c.subjects.length).length), note: "need subjects added" },
  ];

  usePageAction("add", useCallback(() => setEditing("new"), []));
  const open = typeof editing === "number" ? list.data?.find((c) => c.id === editing) : undefined;

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search curriculum…" />
        <select aria-label="Filter by class" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="retired">Retired</option>
        </select>
        <YearSelect years={years} yearId={yearId} onChange={setYearId} />
      </div>
      <ErrorNote>{yearsError ?? list.error}</ErrorNote>
      <Panel title="Academic curriculum" sub={`${year?.name ?? "Current academic year"}${list.loading ? " · Loading…" : ""}`} flush>
        {/* Not wired: "Progress" — a curriculum records what is meant to be taught, not how far it has got; Syllabus Progress (SCR-105) has that. */}
        <DataTable
          columns={COLUMNS}
          rows={rows}
          onView={(i) => setEditing(shown[i].id)}
          empty={list.loading ? "Loading curricula…" : q || classId || state ? "No curricula match these filters." : undefined}
          emptyState={{
            title: "No curriculum yet",
            note: "A curriculum lists what a class studies and how many periods each subject gets, so add one before classes have anything to teach.",
            action: (
              <button type="button" className="btn primary" onClick={() => setEditing("new")}>
                Add curriculum
              </button>
            ),
          }}
        />
      </Panel>
      {editing === "new" && yearId ? (
        <CurriculumForm yearId={yearId} classes={classes.data ?? []} onClose={() => setEditing(null)} onSaved={list.reload} />
      ) : null}
      {open ? (
        <CurriculumDialog c={open} subjects={(subjects.data ?? []).filter((s) => s.is_active)} onClose={() => setEditing(null)} onChanged={list.reload} />
      ) : null}
    </>
  );
}

function CurriculumForm({ yearId, classes, onClose, onSaved }: { yearId: number; classes: SchoolClass[]; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    setSaving(true);
    setError(null);
    try {
      await api.post(BASE, {
        name: text("name"),
        board: text("board"),
        academic_year_id: yearId,
        class_id: text("class_id") ? Number(text("class_id")) : null,
        effective_from: text("effective_from"),
        notes: text("notes"),
      });
      notify("Curriculum drafted. It is not in force until you activate it.");
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog title="Create curriculum" onClose={onClose} error={error}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Name" required full>
            <input name="name" required placeholder="e.g. Grade 1 programme 2026-27" />
          </Field>
          <Field label="Board">
            <input name="board" placeholder="e.g. CBSE" />
          </Field>
          <Field label="Class">
            <select name="class_id" defaultValue="">
              <option value="">Whole school</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Effective from">
            <input type="date" name="effective_from" />
          </Field>
          <Field label="Notes" full>
            <textarea name="notes" />
          </Field>
        </div>
        <DialogActions onCancel={onClose} saving={saving} submit="Save as draft" />
      </form>
    </Dialog>
  );
}

function CurriculumDialog({ c, subjects, onClose, onChanged }: { c: Curriculum; subjects: Subject[]; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState({ subject_id: "", periods: "4", core: true });

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (done) notify(done);
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const activate = () =>
    run(async () => {
      const r = await api.post<Curriculum>(`${BASE}/${c.id}/activate`);
      const retired = r.retired ?? [];
      notify(retired.length ? `${c.name} is in force. ${retired.map((x) => x.name).join(", ")} retired.` : `${c.name} is in force.`);
    });

  const taken = new Set(c.subjects.map((s) => s.subject_id));

  return (
    <Dialog title={c.name} onClose={onClose} error={error}>
      <Kv
        rows={[
          ["Board", c.board ?? "—"],
          ["Class", c.class_name ?? "Whole school"],
          ["Academic year", c.academic_year_name ?? "—"],
          ["Effective from", date(c.effective_from)],
          ["Status", label(c.status)],
          ["Periods / week", String(c.periods_per_week)],
        ]}
      />
      {c.notes ? <p className="muted" style={{ marginTop: 10 }}>{c.notes}</p> : null}
      <div style={{ marginTop: 16 }}>
        <div className="field">
          <span>Subjects</span>
        </div>
        {c.subjects.length ? (
          c.subjects.map((s) => (
            <div key={s.id} className="spread" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
              <span>{`${s.subject_name} · ${s.periods_per_week} periods/week · ${s.is_core ? "core" : "optional"}`}</span>
              <button type="button" className="btn text" disabled={busy} onClick={() => run(() => api.delete(`${BASE}/${c.id}/subjects/${s.subject_id}`), `${s.subject_name} removed.`)}>
                Remove
              </button>
            </div>
          ))
        ) : (
          <p className="muted">No subjects yet — an active curriculum with none teaches nobody anything.</p>
        )}
        <div className="actions" style={{ marginTop: 10 }}>
          <select aria-label="Subject to add" value={pick.subject_id} onChange={(e) => setPick({ ...pick, subject_id: e.target.value })}>
            <option value="">Add a subject…</option>
            {subjects
              .filter((s) => !taken.has(s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <input
            type="number"
            min={0}
            aria-label="Periods per week"
            value={pick.periods}
            onChange={(e) => setPick({ ...pick, periods: e.target.value })}
            style={{ width: 70, height: 40, border: "1px solid #d9e4f2", borderRadius: 8, padding: "0 8px" }}
          />
          <label className="row" style={{ fontSize: 13, gap: 6 }}>
            <input type="checkbox" checked={pick.core} onChange={(e) => setPick({ ...pick, core: e.target.checked })} />
            Core
          </label>
          <button
            type="button"
            className="btn"
            disabled={!pick.subject_id || busy}
            onClick={() =>
              run(async () => {
                await api.put(`${BASE}/${c.id}/subjects`, { subject_id: Number(pick.subject_id), periods_per_week: Number(pick.periods) || 0, is_core: pick.core });
                setPick({ subject_id: "", periods: "4", core: true });
              }, "Subject added.")
            }
          >
            Add
          </button>
        </div>
      </div>
      <DialogActions onCancel={onClose} submit={null}>
        {c.status !== "active" ? (
          <button type="button" className="btn primary" disabled={busy} onClick={activate}>
            Activate
          </button>
        ) : (
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.post(`${BASE}/${c.id}/retire`), `${c.name} is no longer in force. It stays readable.`)}>
            Retire
          </button>
        )}
      </DialogActions>
    </Dialog>
  );
}
