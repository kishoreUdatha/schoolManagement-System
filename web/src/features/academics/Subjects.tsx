"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Dialog, DialogActions, Field, SearchBox, YearSelect, downloadCsv, usePageAction, useSearch, useYears } from "./setupKit";
import type { ClassSubject, Department, SchoolClass, Subject } from "./types";

import { ask } from "@/lib/dialog";
const COLUMNS = ["Subject", "Subject code", "Department", "Subject type", "Classes", "Status"];

/**
 * SCR-096, live: GET/POST /subjects, PATCH/DELETE /subjects/{id},
 * GET /departments; which classes teach it from GET /classes/{id}/subjects,
 * assigned with POST /classes/{id}/subjects and removed with DELETE /class-subjects/{id}.
 */
export function Subjects() {
  const { years, yearId, setYearId, year, error: yearsError } = useYears();
  const list = useApi<Subject[]>("/api/v1/school/subjects", { active_only: false });
  const depts = useApi<Department[]>("/api/v1/school/departments");
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const [links, setLinks] = useState<Map<number, ClassSubject[]>>(new Map());
  const [version, setVersion] = useState(0);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Subject | "new" | null>(null);

  const classList = useMemo(() => [...(classes.data ?? [])].sort((a, b) => a.display_order - b.display_order), [classes.data]);
  const classKey = classList.map((c) => c.id).join(",");
  useEffect(() => {
    let live = true;
    Promise.all(
      classList.map((c) =>
        api
          .get<ClassSubject[]>(`/api/v1/school/classes/${c.id}/subjects`)
          .then((r) => [c.id, r] as const)
          .catch(() => [c.id, [] as ClassSubject[]] as const),
      ),
    ).then((all) => live && setLinks(new Map(all)));
    return () => {
      live = false;
    };
    // classKey stands for the class list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classKey, version]);

  const deptName = useMemo(() => new Map((depts.data ?? []).map((d) => [d.id, d.name])), [depts.data]);
  const classesOf = (subjectId: number) => classList.filter((c) => links.get(c.id)?.some((cs) => cs.subject_id === subjectId));

  const subjects = (list.data ?? []).filter((s) => (!kind || s.kind === kind) && (!status || (status === "active") === s.is_active));
  const { q, setQ, shown } = useSearch(subjects, (s) => `${s.name} ${s.code}`);
  const rows: Row[] = shown.map((s) => [
    s.name,
    s.code,
    s.department_id ? deptName.get(s.department_id) ?? "—" : "—",
    label(s.kind),
    classesOf(s.id).map((c) => c.name).join(", ") || "—",
    s.is_active ? "Active" : "Inactive",
  ]);

  const live = (list.data ?? []).filter((s) => s.is_active);
  const wait = list.loading && !list.data;
  const n = (v: number) => (wait ? "…" : String(v));
  // "Not taught" waits until every class's subject list is in.
  const linked = !classes.loading && classList.every((c) => links.has(c.id));
  const stats = [
    { label: "Subjects", value: n(live.length), note: `${(list.data?.length ?? 0) - live.length} inactive` },
    { label: "Core", value: n(live.filter((s) => s.kind === "core").length), note: "taken by every student" },
    { label: "Electives", value: n(live.filter((s) => s.kind === "elective").length), note: "chosen by students" },
    { label: "Not taught", value: wait || !linked ? "…" : String(live.filter((s) => !classesOf(s.id).length).length), note: `in no class in ${year?.name ?? "this year"}` },
  ];

  usePageAction("add", useCallback(() => setEditing("new"), []));
  usePageAction(
    "export",
    useCallback(() => downloadCsv("subjects.csv", COLUMNS, rows.map((r) => r.map(String))), [rows]),
  );

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search subjects…" />
        <select aria-label="Filter by subject type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          <option value="core">Core</option>
          <option value="elective">Elective</option>
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <YearSelect years={years} yearId={yearId} onChange={setYearId} />
      </div>
      <ErrorNote>{yearsError ?? list.error ?? classes.error}</ErrorNote>
      <Panel flush>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          onView={(i) => setEditing(shown[i])}
          empty={list.loading ? "Loading subjects…" : "No subjects match."}
        />
      </Panel>
      {editing ? (
        <SubjectForm
          s={editing === "new" ? undefined : editing}
          depts={depts.data ?? []}
          classes={classList}
          links={links}
          onClose={() => setEditing(null)}
          onSaved={() => {
            list.reload();
            setVersion((v) => v + 1);
          }}
        />
      ) : null}
    </>
  );
}

function SubjectForm({
  s,
  depts,
  classes,
  links,
  onClose,
  onSaved,
}: {
  s?: Subject;
  depts: Department[];
  classes: SchoolClass[];
  links: Map<number, ClassSubject[]>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkOf = (classId: number) => (s ? links.get(classId)?.find((cs) => cs.subject_id === s.id) : undefined);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const dept = String(f.get("department_id") ?? "");
    const body = {
      name: String(f.get("name")).trim(),
      code: String(f.get("code")).trim().toUpperCase(),
      kind: String(f.get("kind")),
      display_order: Number(f.get("display_order")) || 0,
      department_id: dept ? Number(dept) : null,
    };
    setSaving(true);
    setError(null);
    try {
      if (s) await api.patch(`/api/v1/school/subjects/${s.id}`, { ...body, is_active: f.get("is_active") === "on" });
      else await api.post("/api/v1/school/subjects", body);
      notify(s ? "Subject updated." : `${body.name} added.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleClass(c: SchoolClass) {
    if (!s) return;
    const link = linkOf(c.id);
    if (link && !(await ask(`Stop teaching ${s.name} in ${c.name}? Its homework, online tests, syllabus, videos and timetable lessons for ${c.name} are deleted with it.`))) return;
    setError(null);
    try {
      if (link) await api.delete(`/api/v1/school/class-subjects/${link.id}`);
      else await api.post(`/api/v1/school/classes/${c.id}/subjects`, { subject_id: s.id });
      notify(link ? `${s.name} removed from ${c.name}.` : `${s.name} added to ${c.name}.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove() {
    if (!s || !(await ask(`Delete ${s.name}?`))) return;
    setSaving(true);
    try {
      await api.delete(`/api/v1/school/subjects/${s.id}`);
      notify(`Deleted ${s.name}.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title={s ? `Edit ${s.name}` : "Add subject"} onClose={onClose} error={error}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Subject name" required>
            <input name="name" required defaultValue={s?.name} placeholder="e.g. Mathematics" />
          </Field>
          <Field label="Subject code" required>
            <input name="code" required maxLength={20} defaultValue={s?.code} placeholder="e.g. MATH" />
          </Field>
          <Field label="Subject type">
            <select name="kind" defaultValue={s?.kind ?? "core"}>
              <option value="core">Core</option>
              <option value="elective">Elective</option>
            </select>
          </Field>
          <Field label="Department">
            <select name="department_id" defaultValue={s?.department_id ?? ""}>
              <option value="">None</option>
              {depts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Display order">
            <input name="display_order" type="number" min={0} defaultValue={s?.display_order ?? 0} />
          </Field>
          {s ? (
            <label className="row" style={{ fontSize: 13, alignSelf: "end" }}>
              <input type="checkbox" name="is_active" defaultChecked={s.is_active} />
              Active
            </label>
          ) : null}
        </div>
        {s && classes.length ? (
          <div style={{ marginTop: 18 }}>
            <div className="field">
              <span>Taught in</span>
            </div>
            <div className="actions" style={{ marginTop: 8 }}>
              {classes.map((c) => (
                <label key={c.id} className="row" style={{ fontSize: 13, gap: 6 }}>
                  <input type="checkbox" checked={Boolean(linkOf(c.id))} onChange={() => toggleClass(c)} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        ) : null}
        <DialogActions onCancel={onClose} saving={saving} submit={s ? "Save changes" : "Add subject"}>
          {s ? (
            <button type="button" className="btn danger" disabled={saving} onClick={remove}>
              Delete
            </button>
          ) : null}
        </DialogActions>
      </form>
    </Dialog>
  );
}
