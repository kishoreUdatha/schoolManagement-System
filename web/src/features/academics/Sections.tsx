"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Dialog, DialogActions, Field, SearchBox, YearSelect, downloadCsv, usePageAction, useSearch, useStudentCounts, useYears } from "./setupKit";
import { RoomSelect, roomOf } from "@/features/setup/SectionSetup";
import type { SchoolClass, Section, StaffMember } from "./types";

import { ask } from "@/lib/dialog";
const COLUMNS = ["Section", "Class", "Class teacher", "Room", "Capacity", "Enrolled"];

type Line = Section & { className: string };

/**
 * SCR-095, live: sections come nested in GET /classes?academic_year_id;
 * POST /classes/{id}/sections, PATCH/DELETE /sections/{id};
 * teachers from GET /staff?role=teacher; enrolled from GET /students (section_id).
 */
export function Sections() {
  const { years, yearId, setYearId, year, error: yearsError } = useYears();
  const list = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const staff = useApi<StaffMember[]>("/api/v1/school/staff", { role: "teacher", status: "active" });
  const [classId, setClassId] = useState("");
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<Line | "new" | null>(null);

  const classes = useMemo(() => [...(list.data ?? [])].sort((a, b) => a.display_order - b.display_order), [list.data]);
  const lines: Line[] = useMemo(() => classes.flatMap((c) => c.sections.map((s) => ({ ...s, className: c.name }))), [classes]);
  const counts = useStudentCounts("section_id", lines.map((s) => s.id), yearId, version);
  const teacherName = useMemo(() => new Map((staff.data ?? []).map((t) => [t.user_id, t.full_name])), [staff.data]);

  const reload = () => {
    list.reload();
    setVersion((v) => v + 1);
  };

  const filtered = lines.filter((s) => !classId || String(s.class_id) === classId);
  const { q, setQ, shown } = useSearch(filtered, (s) => `${s.className} ${s.name} ${s.room_name ?? ""} ${s.class_teacher_user_id ? teacherName.get(s.class_teacher_user_id) ?? "" : ""}`);
  const rows: Row[] = shown.map((s) => {
    const n = counts.get(s.id);
    return [s.name, s.className, s.class_teacher_user_id ? teacherName.get(s.class_teacher_user_id) ?? "—" : "Not assigned", s.room_name ?? "—", String(s.capacity), n === undefined ? "…" : String(n)];
  });

  usePageAction("add", useCallback(() => setEditing("new"), []));
  usePageAction(
    "export",
    useCallback(() => downloadCsv(`sections-${year?.name ?? ""}.csv`, COLUMNS, rows.map((r) => r.map(String))), [rows, year]),
  );

  return (
    <>
      <div className="filterbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search sections…" />
        <select aria-label="Filter by class" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <YearSelect years={years} yearId={yearId} onChange={setYearId} />
      </div>
      <ErrorNote>{yearsError ?? list.error}</ErrorNote>
      <Panel title="All records" sub={`${year ? `Academic year ${year.name}` : "Current academic year"}${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          onView={(i) => setEditing(shown[i])}
          empty={list.loading ? "Loading sections…" : "No sections match."}
        />
      </Panel>
      {editing ? (
        <SectionForm
          s={editing === "new" ? undefined : editing}
          classes={classes}
          teachers={staff.data ?? []}
          defaultClass={classId}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      ) : null}
    </>
  );
}

function SectionForm({
  s,
  classes,
  teachers,
  defaultClass,
  onClose,
  onSaved,
}: {
  s?: Line;
  classes: SchoolClass[];
  teachers: StaffMember[];
  defaultClass: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name")).trim();
    const capacity = Number(f.get("capacity")) || 40;
    setSaving(true);
    setError(null);
    try {
      if (s) {
        const teacher = String(f.get("teacher") ?? "");
        await api.patch(`/api/v1/school/sections/${s.id}`, { name, capacity, class_teacher_user_id: teacher ? Number(teacher) : null, room_id: roomOf(f) });
        notify("Section updated.");
      } else {
        await api.post(`/api/v1/school/classes/${f.get("class_id")}/sections`, { name, capacity, room_id: roomOf(f) });
        notify(`Section ${name} added.`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!s || !(await ask(`Delete section ${s.className} ${s.name}?`))) return;
    setSaving(true);
    try {
      await api.delete(`/api/v1/school/sections/${s.id}`);
      notify(`Deleted section ${s.className} ${s.name}.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title={s ? `Section ${s.className} ${s.name}` : "Add section"} onClose={onClose} error={error}>
      <form onSubmit={submit}>
        <div className="form-grid">
          {!s ? (
            <Field label="Class" required full>
              <select name="class_id" required defaultValue={defaultClass}>
                <option value="">Select class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Section name" required>
            <input name="name" required maxLength={20} defaultValue={s?.name} placeholder="e.g. A" />
          </Field>
          <Field label="Capacity">
            <input name="capacity" type="number" min={1} defaultValue={s?.capacity ?? 40} />
          </Field>
          <Field label="Room" full>
            <RoomSelect section={s} />
          </Field>
          {s ? (
            <Field label="Class teacher" full>
              <select name="teacher" defaultValue={s.class_teacher_user_id ?? ""}>
                <option value="">Not assigned</option>
                {teachers.map((t) => (
                  <option key={t.user_id} value={t.user_id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
        <DialogActions onCancel={onClose} saving={saving} submit={s ? "Save changes" : "Add section"}>
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
