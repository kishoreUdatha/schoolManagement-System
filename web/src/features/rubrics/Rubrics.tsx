"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, usePageAction } from "@/features/onlinetests/kit";

import { ask } from "@/lib/dialog";
type Criterion = { id: number; title: string; description: string | null; max_points: number; sequence: number };
type Rubric = {
  id: number;
  name: string;
  description: string | null;
  subject_id: number | null;
  subject_name: string | null;
  created_by_name: string | null;
  is_active: boolean;
  in_use: boolean;
  max_total: number;
  criteria: Criterion[];
};
type Subject = { id: number; name: string; code: string; is_active: boolean };

const base = "/api/v1/school/rubrics";
const pts = (n: number) => `${Number(n)}`;

/**
 * NEW-021, live: GET/POST /school/rubrics, PATCH/DELETE /school/rubrics/{id},
 * POST /school/rubrics/{id}/criteria, PUT/DELETE /school/rubrics/criteria/{id}.
 * Subjects from GET /school/subjects.
 */
export function Rubrics() {
  const [inactive, setInactive] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [search, setSearch] = useState("");
  const list = useApi<Rubric[]>(base, { include_inactive: inactive || undefined, subject_id: subjectId });
  const subjects = useApi<Subject[]>("/api/v1/school/subjects");
  const [editing, setEditing] = useState<Rubric | "new" | null>(null);
  const [criteriaOf, setCriteriaOf] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  usePageAction(
    "add",
    useCallback(() => setEditing("new"), []),
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter((r) => !q || r.name.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q));
  }, [list.data, search]);

  const all = list.data;
  const stats = [
    { label: "Rubrics", value: all ? String(all.length) : "…", note: inactive ? "Including retired" : "In use or ready to use" },
    { label: "Attached to homework", value: all ? String(all.filter((r) => r.in_use).length) : "…", note: "Criteria are locked once marked" },
    { label: "Criteria", value: all ? String(all.reduce((n, r) => n + r.criteria.length, 0)) : "…", note: "Across these rubrics" },
    { label: "Without criteria", value: all ? String(all.filter((r) => !r.criteria.length).length) : "…", note: "Cannot be marked against yet" },
  ];

  const rows: Row[] = shown.map((r) => [
    r.name,
    r.subject_name ?? "Any subject",
    String(r.criteria.length),
    pts(r.max_total),
    r.created_by_name ?? "—",
    r.is_active ? (r.in_use ? "In use" : "Active") : "Retired",
  ]);

  async function run(fn: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await fn();
      notify(done);
      list.reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  }

  async function remove(r: Rubric) {
    if (!(await ask(`Delete the rubric ${r.name}? This cannot be undone.`))) return;
    run(() => api.delete(`${base}/${r.id}`), `${r.name} deleted.`);
  }

  const open = criteriaOf ? (list.data ?? []).find((r) => r.id === criteriaOf) ?? null : null;

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search rubrics…" aria-label="Search rubrics" />
        </div>
        <select aria-label="Subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="row small" style={{ gap: 6 }}>
          <input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Show retired
        </label>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <Panel title="Marking rubrics" sub={`Used to mark homework and projects criterion by criterion${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Rubric", "Subject", "Criteria", "Out of", "Created by", "Status"]}
          rows={rows}
          selectable={false}
          actions={(i) => {
            const r = shown[i];
            return (
              <>
                <button type="button" className="btn" onClick={() => setCriteriaOf(r.id)}>
                  Criteria
                </button>
                <button type="button" className="btn" onClick={() => setEditing(r)}>
                  Edit
                </button>
                <button type="button" className="btn" onClick={() => run(() => api.patch(`${base}/${r.id}`, { is_active: !r.is_active }), r.is_active ? `${r.name} retired.` : `${r.name} restored.`)}>
                  {r.is_active ? "Retire" : "Restore"}
                </button>
                {/* A rubric attached to homework cannot be deleted, only retired. */}
                {r.in_use ? null : (
                  <button type="button" className="btn danger" onClick={() => remove(r)}>
                    Delete
                  </button>
                )}
              </>
            );
          }}
          empty={list.loading ? "Loading rubrics…" : search || subjectId ? "No rubrics match these filters." : undefined}
          emptyState={{
            title: "No rubrics yet",
            note: "A rubric breaks work into criteria so it can be marked consistently, so create one before marking homework or projects against it.",
            action: (
              <button type="button" className="btn primary" onClick={() => setEditing("new")}>
                Create rubric
              </button>
            ),
          }}
        />
      </Panel>

      {editing ? (
        <RubricForm
          rubric={editing === "new" ? null : editing}
          subjects={subjects.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={(r, created) => {
            notify(created ? "Rubric created." : "Rubric saved.");
            setEditing(null);
            list.reload();
            if (created && !r.criteria.length) setCriteriaOf(r.id);
          }}
        />
      ) : null}
      {open ? <CriteriaDialog rubric={open} onClose={() => setCriteriaOf(null)} onChanged={list.reload} /> : null}
    </>
  );
}

type Draft = { title: string; description: string; max_points: string };

/** Create (with its first criteria) or edit a rubric's name, subject and note. */
function RubricForm({ rubric, subjects, onClose, onSaved }: { rubric: Rubric | null; subjects: Subject[]; onClose: () => void; onSaved: (r: Rubric, created: boolean) => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([{ title: "", description: "", max_points: "4" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const body = { name: text("name"), description: text("description") || null, subject_id: text("subject_id") ? Number(text("subject_id")) : null };
    setSaving(true);
    setError(null);
    try {
      if (rubric) {
        onSaved(await api.patch<Rubric>(`${base}/${rubric.id}`, body), false);
      } else {
        const criteria = drafts
          .filter((d) => d.title.trim())
          .map((d) => ({ title: d.title.trim(), description: d.description.trim() || null, max_points: Number(d.max_points) }));
        onSaved(await api.post<Rubric>(base, { ...body, criteria }), true);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const set = (i: number, k: keyof Draft, v: string) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, [k]: v } : d)));

  return (
    <Dialog
      open
      wide
      title={rubric ? `Edit ${rubric.name}` : "New rubric"}
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : rubric ? "Save rubric" : "Create rubric"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <div className="form-grid">
        <Field label="Rubric name" required>
          <input name="name" required minLength={2} maxLength={160} defaultValue={rubric?.name} placeholder="e.g. Science project" />
        </Field>
        <Field label="Subject">
          <select name="subject_id" defaultValue={rubric?.subject_id ?? ""}>
            <option value="">Any subject</option>
            {subjects
              .filter((s) => s.is_active || s.id === rubric?.subject_id)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Description" full>
          <textarea name="description" rows={2} defaultValue={rubric?.description ?? ""} placeholder="What this rubric is for" />
        </Field>
      </div>
      {rubric ? (
        <p className="small muted">Change the criteria from the Criteria button in the list.</p>
      ) : (
        <div className="stack" style={{ gap: 8 }}>
          <span className="small muted">Criteria — each is scored out of its points. You can add more later.</span>
          {drafts.map((d, i) => (
            <div className="form-grid" key={i} style={{ gridTemplateColumns: "1.2fr 1.6fr 90px auto", alignItems: "end" }}>
              <Field label="Criterion">
                <input value={d.title} maxLength={200} onChange={(e) => set(i, "title", e.target.value)} placeholder="e.g. Accuracy" />
              </Field>
              <Field label="What earns full points">
                <input value={d.description} onChange={(e) => set(i, "description", e.target.value)} />
              </Field>
              <Field label="Points">
                <input type="number" min={0.5} max={1000} step={0.5} value={d.max_points} required={Boolean(d.title.trim())} onChange={(e) => set(i, "max_points", e.target.value)} />
              </Field>
              <button type="button" className="btn text" aria-label="Remove criterion" disabled={drafts.length === 1} onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <div>
            <button type="button" className="btn text" onClick={() => setDrafts([...drafts, { title: "", description: "", max_points: "4" }])}>
              + Add criterion
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** A rubric's criteria: add, edit and remove, one at a time. */
function CriteriaDialog({ rubric, onClose, onChanged }: { rubric: Rubric; onClose: () => void; onChanged: () => void }) {
  const [editId, setEditId] = useState<number | "new" | null>(rubric.criteria.length ? null : "new");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const criteria = [...rubric.criteria].sort((a, b) => a.sequence - b.sequence);
  const current = typeof editId === "number" ? criteria.find((c) => c.id === editId) : null;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { title: String(f.get("title") ?? "").trim(), description: String(f.get("description") ?? "").trim() || null, max_points: Number(f.get("max_points")) };
    setSaving(true);
    setError(null);
    try {
      if (current) await api.put(`${base}/criteria/${current.id}`, body);
      else await api.post(`${base}/${rubric.id}/criteria`, body);
      notify(current ? "Criterion saved." : "Criterion added.");
      setEditId(null);
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Criterion) {
    if (!(await ask(`Remove the criterion ${c.title}?`))) return;
    setError(null);
    try {
      await api.delete(`${base}/criteria/${c.id}`);
      notify("Criterion removed.");
      onChanged();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Dialog
      open
      wide
      title={`${rubric.name} · criteria`}
      onClose={onClose}
      actions={
        <button type="button" className="btn" onClick={onClose}>
          Done
        </button>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      {rubric.in_use ? (
        <div className="tip warn">
          <span>This rubric is attached to homework. Once work has been marked against it, its criteria cannot change; make a new rubric instead.</span>
        </div>
      ) : null}
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Criterion</th>
              <th>Points</th>
              <th className="right">Action</th>
            </tr>
          </thead>
          <tbody>
            {criteria.map((c, i) => (
              <tr key={c.id}>
                <td>{String(i + 1)}</td>
                <td className="wrap">
                  {c.title}
                  {c.description ? <small className="muted" style={{ display: "block" }}>{c.description}</small> : null}
                </td>
                <td>{pts(c.max_points)}</td>
                <td className="right">
                  <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                    <button type="button" className="btn" onClick={() => setEditId(c.id)}>
                      Edit
                    </button>
                    <button type="button" className="btn" onClick={() => remove(c)}>
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-empty" hidden={criteria.length > 0}>
        No criteria yet.
      </div>
      <p className="small muted">{`Out of ${pts(rubric.max_total)} points in all.`}</p>
      {editId !== null ? (
        <form onSubmit={save} key={String(editId)} className="panel" style={{ boxShadow: "none" }}>
          <div className="panel-pad">
            <div className="form-grid" style={{ gridTemplateColumns: "1.2fr 1.6fr 90px", alignItems: "end" }}>
              <Field label="Criterion" required>
                <input name="title" required maxLength={200} defaultValue={current?.title} placeholder="e.g. Presentation" />
              </Field>
              <Field label="What earns full points">
                <input name="description" defaultValue={current?.description ?? ""} />
              </Field>
              <Field label="Points" required>
                <input name="max_points" type="number" min={0.5} max={1000} step={0.5} required defaultValue={current ? Number(current.max_points) : 4} />
              </Field>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button type="button" className="btn" onClick={() => setEditId(null)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                {saving ? "Saving…" : current ? "Save criterion" : "Add criterion"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <div>
          <button type="button" className="btn" onClick={() => setEditId("new")}>
            <Icon name="plus" className="sm" />
            Add criterion
          </button>
        </div>
      )}
    </Dialog>
  );
}
