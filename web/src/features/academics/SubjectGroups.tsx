"use client";

import { useCallback, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Dialog, DialogActions, Field, SearchBox, downloadCsv, usePageAction, useSearch, useYears } from "./setupKit";
import type { SchoolClass, Subject, SubjectGroup } from "./types";

import { ask } from "@/lib/dialog";
const COLUMNS = ["Group", "Subjects", "Class", "Selection rule", "Minimum", "Maximum", "Status"];

const picks = (n: number | null) => (n === null ? "—" : String(n));
const BASE = "/api/v1/school/academics/groups";

/** What the group asks of a student, read off its core and elective members. */
function ruleOf(g: SubjectGroup) {
  if (!g.subject_count) return "No subjects yet";
  if (!g.elective_count) return "All core";
  if (g.elective_count === g.subject_count) return `Choose from ${g.elective_count} electives`;
  return `${g.subject_count - g.elective_count} core · ${g.elective_count} elective`;
}

/**
 * SCR-097, live: GET/POST /academics/groups, PATCH/DELETE /academics/groups/{id},
 * POST /academics/groups/{id}/subjects, DELETE /academics/groups/{id}/subjects/{subject_id}.
 */
export function SubjectGroups() {
  const list = useApi<SubjectGroup[]>(BASE);
  const subjects = useApi<Subject[]>("/api/v1/school/subjects");
  // Groups are offered to a class; classes are listed for the current year.
  const { yearId } = useYears();
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const [status, setStatus] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [editing, setEditing] = useState<number | "new" | null>(null);

  const groups = (list.data ?? []).filter(
    (g) => (!status || (status === "active") === g.is_active) && (!classFilter || (classFilter === "all" ? g.class_id === null : String(g.class_id) === classFilter)),
  );
  const { q, setQ, shown } = useSearch(groups, (g) => `${g.name} ${g.code} ${g.class_name ?? ""} ${g.subjects.map((s) => s.subject_name).join(" ")}`);
  const rows: Row[] = shown.map((g) => [
    `${g.name} (${g.code})`,
    g.subjects.map((s) => s.subject_name).join(", ") || "—",
    g.class_name ?? "All classes",
    ruleOf(g),
    picks(g.min_picks),
    picks(g.max_picks),
    g.is_active ? "Active" : "Inactive",
  ]);

  usePageAction("add", useCallback(() => setEditing("new"), []));
  usePageAction(
    "export",
    useCallback(() => downloadCsv("subject-groups.csv", COLUMNS, rows.map((r) => r.map(String))), [rows]),
  );

  const open = typeof editing === "number" ? list.data?.find((g) => g.id === editing) : undefined;

  return (
    <>
      <div className="filterbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search subject groups…" />
        <select aria-label="Filter by class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option value="">All classes</option>
          <option value="all">Offered to every class</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel title="All records" sub={`${list.data?.length ?? 0} groups${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          onView={(i) => setEditing(shown[i].id)}
          empty={list.loading ? "Loading subject groups…" : "No subject groups yet."}
        />
      </Panel>
      {editing === "new" || open ? (
        <GroupDialog g={open} subjects={(subjects.data ?? []).filter((s) => s.is_active)} classes={classes.data ?? []} onClose={() => setEditing(null)} onSaved={list.reload} />
      ) : null}
    </>
  );
}

function GroupDialog({
  g,
  subjects,
  classes,
  onClose,
  onSaved,
}: {
  g?: SubjectGroup;
  subjects: Subject[];
  classes: SchoolClass[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [elective, setElective] = useState(false);

  async function run(fn: () => Promise<unknown>, done?: string, close = false) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      if (done) notify(done);
      onSaved();
      if (close) onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name")).trim();
    const description = String(f.get("description") ?? "").trim() || null;
    const num = (k: string) => {
      const v = String(f.get(k) ?? "").trim();
      return v ? Number(v) : null;
    };
    const limits = { class_id: num("class_id"), min_picks: num("min_picks"), max_picks: num("max_picks") };
    if (limits.min_picks !== null && limits.max_picks !== null && limits.min_picks > limits.max_picks) {
      setError("The minimum can't be more than the maximum.");
      return;
    }
    if (g) run(() => api.patch(`${BASE}/${g.id}`, { name, description, is_active: f.get("is_active") === "on", ...limits }), "Group updated.", true);
    else run(() => api.post(BASE, { name, code: String(f.get("code")).trim().toUpperCase(), description, ...limits }), "Group created.", true);
  }

  const inGroup = new Set(g?.subjects.map((s) => s.subject_id));

  return (
    <Dialog title={g ? g.name : "Create subject group"} onClose={onClose} error={error}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Group name" required>
            <input name="name" required defaultValue={g?.name} placeholder="e.g. Languages" />
          </Field>
          <Field label="Code" required>
            <input name="code" required maxLength={20} defaultValue={g?.code} disabled={Boolean(g)} placeholder="e.g. LANG" />
          </Field>
          <Field label="Description" full>
            <input name="description" defaultValue={g?.description ?? ""} placeholder="What the group is for" />
          </Field>
          <Field label="Class" full>
            <select name="class_id" defaultValue={g?.class_id ?? ""} key={classes.length}>
              <option value="">Every class</option>
              {g?.class_id && !classes.some((c) => c.id === g.class_id) ? <option value={g.class_id}>{g.class_name ?? "Another year's class"}</option> : null}
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Minimum picks">
            <input name="min_picks" type="number" min={0} max={20} defaultValue={g?.min_picks ?? ""} placeholder="No minimum" />
          </Field>
          <Field label="Maximum picks">
            <input name="max_picks" type="number" min={0} max={20} defaultValue={g?.max_picks ?? ""} placeholder="No maximum" />
          </Field>
          {g ? (
            <label className="row" style={{ fontSize: 13 }}>
              <input type="checkbox" name="is_active" defaultChecked={g.is_active} />
              Active
            </label>
          ) : null}
        </div>
        {g ? (
          <div style={{ marginTop: 18 }}>
            <div className="field">
              <span>Subjects in this group</span>
            </div>
            {g.subjects.length ? (
              g.subjects.map((m) => (
                <div key={m.member_id} className="spread" style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                  <span>{`${m.subject_name} (${m.subject_code})${m.is_elective ? " · elective" : ""}`}</span>
                  <button
                    type="button"
                    className="btn text"
                    disabled={saving}
                    onClick={() => run(() => api.delete(`${BASE}/${g.id}/subjects/${m.subject_id}`), `${m.subject_name} removed from the group.`)}
                  >
                    Remove from group
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">No subjects yet.</p>
            )}
            <div className="actions" style={{ marginTop: 10 }}>
              <select aria-label="Subject to add" value={pick} onChange={(e) => setPick(e.target.value)}>
                <option value="">Add a subject…</option>
                {subjects
                  .filter((s) => !inGroup.has(s.id))
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {`${s.name} (${s.code})`}
                    </option>
                  ))}
              </select>
              <label className="row" style={{ fontSize: 13, gap: 6 }}>
                <input type="checkbox" checked={elective} onChange={(e) => setElective(e.target.checked)} />
                Elective
              </label>
              <button
                type="button"
                className="btn"
                disabled={!pick || saving}
                onClick={() =>
                  run(async () => {
                    await api.post(`${BASE}/${g.id}/subjects`, { subject_id: Number(pick), is_elective: elective });
                    setPick("");
                    setElective(false);
                  }, "Subject added.")
                }
              >
                Add
              </button>
            </div>
          </div>
        ) : null}
        <DialogActions onCancel={onClose} saving={saving} submit={g ? "Save changes" : "Create group"}>
          {g ? (
            <button
              type="button"
              className="btn danger"
              disabled={saving}
              onClick={async () =>
                (await ask(`Remove the group ${g.name}? The subjects in it are not affected.`)) &&
                run(() => api.delete(`${BASE}/${g.id}`), `${g.name} removed. Its subjects are untouched.`, true)
              }
            >
              Delete group
            </button>
          ) : null}
        </DialogActions>
      </form>
    </Dialog>
  );
}
