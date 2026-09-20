"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, fieldClass, td } from "@/components/ui/Field";
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

// The status buttons are the one place colour carries meaning rather than
// decoration, so they use the palette's status colours at full strength.
const ACTIVE: Record<string, string> = {
  emerald: "border-[#07845E] bg-[#07845E] text-white",
  rose: "border-[#B82E45] bg-[#B82E45] text-white",
  amber: "border-[#8E5C05] bg-[#8E5C05] text-white",
  brand: "border-brand-600 bg-brand-600 text-white",
};

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
      <PageHeader
        title="Attendance"
        subtitle={`Daily marking for your section. Editable for ${view?.edit_window_days ?? 7} days; locked on holidays.`}
        actions={
          sections.length > 0 ? (
            <>
              <Select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
                aria-label="Section"
              >
                {sections.map((s) => (
                  <option key={s.section_id} value={s.section_id}>
                    {s.section_label}
                  </option>
                ))}
              </Select>
              <Input
                type="date"
                aria-label="Date"
                value={date}
                max={todayIso()}
                onChange={(e) => setDate(e.target.value)}
              />
              <Button variant="secondary" onClick={() => setDate(todayIso())}>
                Today
              </Button>
            </>
          ) : undefined
        }
      />

      {sections.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center text-[13px] text-ink-muted">
            You aren&apos;t assigned as a class teacher of any section.
          </CardBody>
        </Card>
      ) : (
        <>
          {view?.is_holiday && (
            <div className="rounded-lg bg-[#FFF3D8] px-4 py-3 text-[13px] font-medium text-[#8E5C05] dark:bg-amber-500/15 dark:text-amber-200">
              {date} is a holiday ({view.holiday_name}). No attendance expected.
            </div>
          )}
          {view?.is_locked && (
            <div className="rounded-lg bg-surface-subtle px-4 py-3 text-[13px] text-ink-muted">
              The office locked this register
              {view.locked_at
                ? ` on ${new Date(view.locked_at).toLocaleString([], {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : ""}
              . Ask them to reopen it if something needs changing.
            </div>
          )}
          {!view?.is_holiday && !view?.is_locked && !canEdit && view && (
            <div className="rounded-lg bg-surface-subtle px-4 py-3 text-[13px] text-ink-muted">
              This date is outside the {view.edit_window_days}-day edit window. Existing entries are
              shown read-only.
            </div>
          )}
          <ErrorBox>{error}</ErrorBox>
          <NoticeBox>{notice}</NoticeBox>

          {view && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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

              <Card>
                <CardHeader>
                  <CardTitle>{view.section_label ?? "Register"}</CardTitle>
                  {canEdit ? (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => bulkSet("present")}>
                        All present
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => bulkSet("absent")}>
                        All absent
                      </Button>
                      <Button size="sm" onClick={save} loading={saving}>
                        Save
                      </Button>
                    </div>
                  ) : (
                    <Badge tone="neutral">Read only</Badge>
                  )}
                </CardHeader>
                <CardBody className="p-0">
                  <Table
                    head={["Roll", "Student", "Status", "Remark"]}
                    empty={rows.length === 0 && "No active students in this section."}
                  >
                    {rows.map((r) => (
                      <tr key={r.student_id} className="hover:bg-surface-hover">
                        <td className={cn(td, "tabular-nums")}>{r.roll_no}</td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-ink">{r.full_name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <span className="text-[11px] text-ink-subtle">{r.admission_no}</span>
                            {r.on_leave && <Badge tone="brand">{r.on_leave} approved</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {STATUSES.map((s) => {
                              const active = r.status === s.value;
                              return (
                                <button
                                  key={s.value}
                                  type="button"
                                  disabled={!canEdit}
                                  onClick={() => setStatus(r.student_id, s.value)}
                                  aria-pressed={active}
                                  title={s.value.replace("_", " ")}
                                  className={cn(
                                    "h-9 w-9 rounded-lg border text-[13px] font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                                    active
                                      ? ACTIVE[s.tone]
                                      : "border-surface-border bg-surface-raised text-ink-muted hover:bg-surface-hover hover:text-ink"
                                  )}
                                >
                                  {s.label}
                                </button>
                              );
                            })}
                            {!r.status && <Badge tone="neutral">Unmarked</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={r.remark ?? ""}
                            onChange={(e) => setRemark(r.student_id, e.target.value)}
                            disabled={!canEdit}
                            placeholder={canEdit ? "Optional" : ""}
                            aria-label={`Remark for ${r.full_name}`}
                            className={cn(fieldClass, "min-h-[36px] w-full py-1.5")}
                          />
                        </td>
                      </tr>
                    ))}
                  </Table>
                </CardBody>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
