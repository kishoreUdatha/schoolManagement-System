"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Dialog, DialogActions, Field, Kv, SearchBox, YearSelect, downloadCsv, usePageAction, useSearch, useStudentCounts, useYears } from "./setupKit";
import { ClassDetailFields, classDetails } from "@/features/setup/ClassSetup";
import type { SchoolClass } from "./types";

const COLUMNS = ["Class", "School level", "Sections", "Students", "Coordinator", "Capacity", "Status"];

/** The class's own planned capacity, else what its sections add up to. */
const capacityOf = (c: SchoolClass) => c.capacity ?? c.sections.reduce((s, x) => s + x.capacity, 0);

/**
 * SCR-094, live: GET /classes?academic_year_id, POST /classes,
 * PATCH/DELETE /classes/{id}, POST /classes/reorder, POST /classes/{id}/sections;
 * student counts from GET /students (class_id, page_size=1).
 */
export function Classes() {
  const { years, yearId, setYearId, year, error: yearsError } = useYears();
  const list = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const [version, setVersion] = useState(0);
  const classes = useMemo(() => [...(list.data ?? [])].sort((a, b) => a.display_order - b.display_order), [list.data]);
  const counts = useStudentCounts("class_id", classes.map((c) => c.id), yearId, version);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<SchoolClass | null>(null);

  const reload = () => {
    list.reload();
    setVersion((v) => v + 1);
  };

  const [status, setStatus] = useState("");
  const filtered = classes.filter((c) => !status || (status === "active") === c.is_active);
  const { q, setQ, shown } = useSearch(filtered, (c) => `${c.name} ${c.code ?? ""} ${c.school_level ?? ""} ${c.coordinator_name ?? ""}`);
  const rows: Row[] = shown.map((c) => {
    const n = counts.get(c.id);
    return [
      c.code ? `${c.name} (${c.code})` : c.name,
      c.school_level ?? "—",
      String(c.sections.length),
      n === undefined ? "…" : String(n),
      c.coordinator_name ?? "—",
      String(capacityOf(c)),
      c.is_active ? "Active" : "Inactive",
    ];
  });

  usePageAction("add", useCallback(() => setAdding(true), []));
  usePageAction(
    "export",
    useCallback(() => downloadCsv(`classes-${year?.name ?? ""}.csv`, COLUMNS, rows.map((r) => r.map(String))), [rows, year]),
  );

  async function move(c: SchoolClass, dir: -1 | 1) {
    const ids = classes.map((x) => x.id);
    const i = ids.indexOf(c.id);
    if (i + dir < 0 || i + dir >= ids.length) return;
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    await api.post(`/api/v1/school/classes/reorder?academic_year_id=${yearId}`, { class_ids: ids });
    list.reload();
  }

  return (
    <>
      <div className="filterbar">
        <SearchBox value={q} onChange={setQ} placeholder="Search grades or classes…" />
        <YearSelect years={years} yearId={yearId} onChange={setYearId} />
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{yearsError ?? list.error}</ErrorNote>
      <Panel title="All records" sub={`${year ? `Academic year ${year.name}` : "Current academic year"}${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={COLUMNS}
          rows={rows}
          onView={(i) => setOpen(shown[i])}
          empty={list.loading ? "Loading classes…" : "No classes in this academic year yet."}
        />
      </Panel>
      {adding && yearId ? <ClassForm yearId={yearId} onClose={() => setAdding(false)} onSaved={reload} /> : null}
      {open ? (
        <ClassDialog
          c={open}
          students={counts.get(open.id)}
          first={classes[0]?.id === open.id}
          last={classes.at(-1)?.id === open.id}
          onMove={(dir) => move(open, dir)}
          onClose={() => setOpen(null)}
          onChanged={reload}
        />
      ) : null}
    </>
  );
}

function ClassForm({ yearId, c, onClose, onSaved }: { yearId: number; c?: SchoolClass; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name")).trim();
    setSaving(true);
    setError(null);
    try {
      if (c) await api.patch(`/api/v1/school/classes/${c.id}`, { name, ...classDetails(f) });
      else await api.post("/api/v1/school/classes", { academic_year_id: yearId, name, ...classDetails(f) });
      notify(c ? "Class saved." : `${name} created.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog title={c ? `Edit ${c.name}` : "Add class"} onClose={onClose} error={error}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Class name" required>
            <input name="name" required defaultValue={c?.name} placeholder="e.g. Grade 8" />
          </Field>
          <ClassDetailFields c={c} />
        </div>
        <DialogActions onCancel={onClose} saving={saving} submit={c ? "Save" : "Create class"} />
      </form>
    </Dialog>
  );
}

function ClassDialog({
  c,
  students,
  first,
  last,
  onMove,
  onClose,
  onChanged,
}: {
  c: SchoolClass;
  students?: number;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => Promise<void>;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<"view" | "rename" | "section">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, done: string, close = false) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      notify(done);
      onChanged();
      if (close) onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function addSection(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name")).trim();
    await run(() => api.post(`/api/v1/school/classes/${c.id}/sections`, { name, capacity: Number(f.get("capacity")) || 40 }), `Section ${c.name} ${name} added.`, true);
  }

  if (mode === "rename") return <ClassForm yearId={c.academic_year_id} c={c} onClose={onClose} onSaved={onChanged} />;
  if (mode === "section")
    return (
      <Dialog title={`Add a section to ${c.name}`} onClose={onClose} error={error}>
        <form onSubmit={addSection}>
          <div className="form-grid">
            <Field label="Section name" required>
              <input name="name" required maxLength={20} placeholder="e.g. C" />
            </Field>
            <Field label="Capacity">
              <input name="capacity" type="number" min={1} defaultValue={40} />
            </Field>
          </div>
          <DialogActions onCancel={onClose} saving={busy} submit="Add section" />
        </form>
      </Dialog>
    );

  return (
    <Dialog title={c.name} onClose={onClose} error={error}>
      <Kv
        rows={[
          ["Class code", c.code ?? "—"],
          ["School level", c.school_level ?? "—"],
          ["Coordinator", c.coordinator_name ?? "—"],
          ["Sections", c.sections.map((s) => s.name).join(", ") || "None yet"],
          ["Students", students === undefined ? "…" : String(students)],
          ["Capacity", String(capacityOf(c))],
          ["Status", c.is_active ? "Active" : "Inactive"],
        ]}
      />
      <DialogActions onCancel={onClose} submit={null}>
        <button type="button" className="btn" disabled={busy || first} onClick={() => run(() => onMove(-1), "Moved up.", true)}>
          Move up
        </button>
        <button type="button" className="btn" disabled={busy || last} onClick={() => run(() => onMove(1), "Moved down.", true)}>
          Move down
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => setMode("rename")}>
          Edit
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => setMode("section")}>
          Add section
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={busy}
          onClick={() => window.confirm(`Delete ${c.name}? Its sections go with it.`) && run(() => api.delete(`/api/v1/school/classes/${c.id}`), `Deleted ${c.name}.`, true)}
        >
          Delete
        </button>
      </DialogActions>
    </Dialog>
  );
}
