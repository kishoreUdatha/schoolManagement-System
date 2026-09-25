"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import type { Scope, TeacherLite } from "@/components/timetable/types";
import { api, apiError } from "@/lib/api";

type HodRow = {
  teacher_user_id: number;
  teacher_name: string;
  sections: { section_id: number; section_label: string }[];
};

export default function HodAssignmentsPage() {
  const [rows, setRows] = useState<HodRow[]>([]);
  const [scope, setScope] = useState<Scope | null>(null);
  const [teachers, setTeachers] = useState<TeacherLite[]>([]);
  const [editing, setEditing] = useState<HodRow | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, s, t] = await Promise.all([
        api.get<HodRow[]>("/api/v1/school/hod-assignments"),
        api.get<Scope>("/api/v1/timetable/scope"),
        api.get<TeacherLite[]>("/api/v1/timetable/teachers"),
      ]);
      setRows(h.data);
      setScope(s.data);
      setTeachers(t.data);
    } catch (e) {
      setError(apiError(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(row: HodRow) {
    if (!confirm(`Remove ${row.teacher_name} as HOD?`)) return;
    try {
      const { data } = await api.put<HodRow[]>(
        `/api/v1/school/hod-assignments/${row.teacher_user_id}`,
        { section_ids: [] }
      );
      setRows(data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">HOD assignments</h1>
          <p className="mt-1 text-sm text-ink-muted">
            An HOD is a teacher who can create, edit and publish the timetable of the
            classes and sections assigned here. Principals manage every section.
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>Assign HOD</Button>
      </div>

      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}

      <Card>
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="text-left text-xs uppercase text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">Teacher</th>
              <th className="px-4 py-3 font-medium">Sections</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {rows.map((r) => (
              <tr key={r.teacher_user_id}>
                <td className="px-4 py-3 font-medium text-ink">{r.teacher_name}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {r.sections.map((s) => (
                      <span
                        key={s.section_id}
                        className="rounded-full bg-brand-500/10 px-2 py-0.5 text-xs text-brand-600"
                      >
                        {s.section_label}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                    Edit
                  </Button>{" "}
                  <Button size="sm" variant="ghost" onClick={() => remove(r)}>
                    Remove
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-ink-muted">
                  No HODs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {editing && scope && (
        <HodModal
          scope={scope}
          teachers={teachers}
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(data) => {
            setRows(data);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function HodModal({
  scope,
  teachers,
  row,
  onClose,
  onSaved,
}: {
  scope: Scope;
  teachers: TeacherLite[];
  row: HodRow | null;
  onClose: () => void;
  onSaved: (rows: HodRow[]) => void;
}) {
  const current = scope.academic_years.find((y) => y.is_current) ?? scope.academic_years[0];
  const [yearId, setYearId] = useState<number | undefined>(current?.id);
  const [teacherId, setTeacherId] = useState<number | "">(row?.teacher_user_id ?? "");
  const [picked, setPicked] = useState<Set<number>>(
    () => new Set(row?.sections.map((s) => s.section_id) ?? [])
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classes = useMemo(
    () => scope.classes.filter((c) => c.academic_year_id === yearId),
    [scope, yearId]
  );

  function toggle(ids: number[], on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!teacherId) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.put<HodRow[]>(
        `/api/v1/school/hod-assignments/${teacherId}`,
        { section_ids: Array.from(picked) }
      );
      onSaved(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  const selectCls =
    "rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink shadow-sm";

  return (
    <Modal open onClose={onClose} title={row ? `Edit HOD · ${row.teacher_name}` : "Assign HOD"} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium text-ink">Teacher *</span>
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value ? Number(e.target.value) : "")}
              className={selectCls}
              disabled={!!row}
              required
            >
              <option value="">Select…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink">Academic year</span>
            <select
              value={yearId}
              onChange={(e) => setYearId(Number(e.target.value))}
              className={selectCls}
            >
              {scope.academic_years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-2">
          <span className="text-sm font-medium text-ink">Classes &amp; sections</span>
          {classes.length === 0 && (
            <p className="text-sm text-ink-muted">No classes in this academic year.</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {classes.map((c) => {
              const ids = c.sections.map((s) => s.id);
              const all = ids.length > 0 && ids.every((id) => picked.has(id));
              return (
                <div key={c.id} className="rounded-lg border border-surface-border p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-ink">
                    <input
                      type="checkbox"
                      checked={all}
                      onChange={(e) => toggle(ids, e.target.checked)}
                    />
                    {c.name}
                    <span className="text-xs font-normal text-ink-subtle">(all sections)</span>
                  </label>
                  <div className="mt-2 flex flex-wrap gap-3 pl-6">
                    {c.sections.map((s) => (
                      <label key={s.id} className="flex items-center gap-1.5 text-sm text-ink-muted">
                        <input
                          type="checkbox"
                          checked={picked.has(s.id)}
                          onChange={(e) => toggle([s.id], e.target.checked)}
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-ink-subtle">
            {picked.size} section{picked.size === 1 ? "" : "s"} selected (across all years).
          </p>
        </div>

        {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!teacherId}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
