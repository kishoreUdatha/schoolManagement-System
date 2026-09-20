"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type Status = "present" | "absent" | "late" | "half_day";

type Section = {
  section_id: number;
  section_label: string;
  is_current_year: boolean;
};

type Row = {
  student_id: number;
  admission_no: string;
  roll_no: number;
  full_name: string;
  status: Status | null;
  remark: string | null;
  on_leave?: string | null;
};

type View = {
  section_id: number;
  section_label: string | null;
  date: string;
  is_holiday: boolean;
  holiday_name: string | null;
  is_editable: boolean;
  is_locked: boolean;
  locked_at: string | null;
  edit_window_days: number;
  rows: Row[];
  summary: {
    present: number;
    absent: number;
    late: number;
    half_day: number;
    unmarked: number;
    total: number;
  };
};

const STATUSES: { value: Status; label: string; tone: "emerald" | "rose" | "amber" | "brand" }[] = [
  { value: "present", label: "P", tone: "emerald" },
  { value: "absent", label: "A", tone: "rose" },
  { value: "late", label: "L", tone: "amber" },
  { value: "half_day", label: "½", tone: "brand" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const search = useSearchParams();
  const initialSection = search.get("section_id");

  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState<number | "">(
    initialSection ? Number(initialSection) : ""
  );
  const [date, setDate] = useState(todayIso());
  const [view, setView] = useState<View | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<{ class_teacher_of: Section[] }>("/api/v1/teacher/my-classes")
      .then((r) => {
        setSections(r.data.class_teacher_of);
        if (sectionId === "" && r.data.class_teacher_of.length > 0) {
          setSectionId(r.data.class_teacher_of[0].section_id);
        }
      })
      .catch((e) => setError(apiError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    if (!sectionId) return;
    try {
      const { data } = await api.get<View>(
        `/api/v1/teacher/attendance?section_id=${sectionId}&date=${date}`
      );
      setView(data);
      setRows(data.rows);
      setError(null);
    } catch (e) {
      setError(apiError(e));
      setView(null);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, date]);

  function setStatus(studentId: number, status: Status) {
    setRows((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, status } : r))
    );
  }

  function setRemark(studentId: number, remark: string) {
    setRows((prev) =>
      prev.map((r) => (r.student_id === studentId ? { ...r, remark } : r))
    );
  }

  function bulkSet(status: Status) {
    // students on approved leave stay absent when everyone is marked present
    setRows((prev) => prev.map((r) => (status === "present" && r.on_leave ? { ...r, status: "absent" } : { ...r, status })));
  }

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, half_day: 0, unmarked: 0 };
    rows.forEach((r) => {
      if (!r.status) c.unmarked++;
      else c[r.status]++;
    });
    return c;
  }, [rows]);

  async function save() {
    if (!sectionId || !view) return;
    const entries = rows
      .filter((r) => r.status !== null)
      .map((r) => ({
        student_id: r.student_id,
        status: r.status,
        remark: r.remark || null,
      }));
    if (entries.length === 0) {
      setError("Mark at least one student before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post("/api/v1/teacher/attendance/save", {
        section_id: sectionId,
        date,
        entries,
      });
      setNotice(`Saved ${data.saved} entries.`);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  const canEdit = view?.is_editable ?? false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Attendance</h1>
        <p className="mt-1 text-sm text-slate-500">
          Daily Present/Absent/Late marking for your section. Editable for the
          last {view?.edit_window_days ?? 7} days; locked on holidays.
        </p>
      </div>

      {sections.length === 0 ? (
        <Card className="p-6 text-center text-slate-500">
          You aren&apos;t assigned as a class teacher of any section.
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Section</span>
              <select
                value={sectionId}
                onChange={(e) =>
                  setSectionId(e.target.value ? Number(e.target.value) : "")
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {sections.map((s) => (
                  <option key={s.section_id} value={s.section_id}>
                    {s.section_label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayIso()}
            />
            <Button variant="secondary" onClick={() => setDate(todayIso())}>
              Today
            </Button>
          </div>

          {view?.is_holiday && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {date} is a holiday ({view.holiday_name}). No attendance expected.
            </div>
          )}
          {view?.is_locked && (
            <div className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">
              The office locked this register
              {view.locked_at ? ` on ${new Date(view.locked_at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}.
              Ask them to reopen it if something needs changing.
            </div>
          )}
          {!view?.is_holiday && !view?.is_locked && !canEdit && view && (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
              This date is outside the {view.edit_window_days}-day edit window.
              Existing entries are shown read-only.
            </div>
          )}
          {error && (
            <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
          {notice && (
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>
          )}

          {view && (
            <>
              <div className="grid gap-3 sm:grid-cols-5">
                <StatCard label="Present" value={counts.present} accent="emerald" />
                <StatCard label="Absent" value={counts.absent} accent="rose" />
                <StatCard label="Late" value={counts.late} accent="amber" />
                <StatCard label="Half-day" value={counts.half_day} accent="brand" />
                <StatCard
                  label="Unmarked"
                  value={counts.unmarked}
                  accent={counts.unmarked > 0 ? "amber" : "emerald"}
                />
              </div>

              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => bulkSet("present")}>
                    Mark all present
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => bulkSet("absent")}>
                    Mark all absent
                  </Button>
                  <Button onClick={save} loading={saving}>
                    Save
                  </Button>
                </div>
              )}

              <Card>
                <table className="min-w-full divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Roll</th>
                      <th className="px-4 py-2 font-medium">Name</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Remark</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.student_id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-xs text-slate-500">
                          {r.roll_no}
                        </td>
                        <td className="px-4 py-2">
                          <div className="font-medium text-slate-900">{r.full_name}</div>
                          {r.on_leave && (
                            <span className="inline-block rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
                              {r.on_leave} (approved)
                            </span>
                          )}
                          <div className="text-xs text-slate-500">{r.admission_no}</div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            {STATUSES.map((s) => {
                              const active = r.status === s.value;
                              return (
                                <button
                                  key={s.value}
                                  type="button"
                                  disabled={!canEdit}
                                  onClick={() => setStatus(r.student_id, s.value)}
                                  className={cn(
                                    "w-9 h-9 rounded-md border text-sm font-bold transition disabled:opacity-50 disabled:cursor-not-allowed",
                                    active && s.tone === "emerald" && "border-emerald-600 bg-emerald-600 text-white",
                                    active && s.tone === "rose" && "border-rose-600 bg-rose-600 text-white",
                                    active && s.tone === "amber" && "border-amber-600 bg-amber-600 text-white",
                                    active && s.tone === "brand" && "border-brand-600 bg-brand-600 text-white",
                                    !active && "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                                  )}
                                  title={s.value}
                                >
                                  {s.label}
                                </button>
                              );
                            })}
                            {!r.status && (
                              <Badge tone="neutral" className="ml-1 self-center">
                                unmarked
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={r.remark ?? ""}
                            onChange={(e) => setRemark(r.student_id, e.target.value)}
                            disabled={!canEdit}
                            placeholder={canEdit ? "optional" : ""}
                            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs disabled:bg-slate-50"
                          />
                        </td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                          No active students in this section.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
