"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { hhmm, localDate, longDate, toIso } from "@/lib/dates";

type AcademicYear = { id: number; name: string; is_current: boolean };
type Section = { id: number; name: string };
type SchoolClass = { id: number; name: string; sections: Section[] };
type Period = {
  id: number;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  label: string | null;
  is_break: boolean;
};

type Row = {
  student_id: number;
  admission_no: string;
  student_name: string;
  roll_no: number | null;
  status: string;
  remark: string | null;
  already_marked: boolean;
  day_status: string | null;
};
type Grid = {
  section_id: number;
  date: string;
  period_id: number;
  period_number: number;
  period_label: string | null;
  start_time: string;
  end_time: string;
  class_subject_id: number | null;
  subject_name: string | null;
  rows: Row[];
  marked: number;
};

const STATUSES = ["present", "absent", "late", "half_day"];

const tone = (s: string) =>
  s === "present" ? "emerald" : s === "absent" ? "rose" : "amber";

/** Marking one lesson.
 *
 *  The grid arrives already filled in from the morning register, so this is a
 *  screen for confirming and correcting rather than for typing thirty marks
 *  that somebody has given once today already. Only the rows that actually
 *  differ are sent, which keeps a stray click from rewriting the whole class.
 */
export default function PeriodAttendancePage() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [sectionId, setSectionId] = useState<number | "">("");
  const [day, setDay] = useState(toIso());
  const [periodId, setPeriodId] = useState<number | "">("");

  const [grid, setGrid] = useState<Grid | null>(null);
  const [loaded, setLoaded] = useState<Record<number, Row>>({});
  const [edits, setEdits] = useState<Record<number, Row>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<AcademicYear[]>("/api/v1/school/academic-years")
      .then((r) => {
        const current = r.data.find((y) => y.is_current) ?? r.data[0];
        if (!current) return;
        return api
          .get<SchoolClass[]>("/api/v1/school/classes", {
            params: { academic_year_id: current.id },
          })
          .then((c) => {
            setClasses(c.data);
            const first = c.data.find((k) => k.sections.length > 0);
            if (first) setSectionId(first.sections[0].id);
          });
      })
      .catch((e) => setError(apiError(e)));

    api
      .get<Period[]>("/api/v1/school/periods")
      .then((r) => setPeriods(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  // Periods are laid out per weekday, so the date decides which exist.
  // localDate rather than new Date(day): the latter parses as UTC midnight and
  // would pick the previous weekday west of Greenwich, quietly offering
  // Monday's lessons on a Tuesday.
  const weekday = useMemo(() => {
    const js = localDate(day).getDay();
    return js === 0 ? 7 : js;
  }, [day]);

  const lessons = useMemo(
    () =>
      periods
        .filter((p) => p.day_of_week === weekday && !p.is_break)
        .sort((a, b) => a.period_number - b.period_number),
    [periods, weekday]
  );

  useEffect(() => {
    if (lessons.length && !lessons.some((p) => p.id === periodId)) {
      setPeriodId(lessons[0].id);
    }
    if (!lessons.length) setPeriodId("");
  }, [lessons, periodId]);

  const load = useCallback(() => {
    if (sectionId === "" || periodId === "") {
      setGrid(null);
      return;
    }
    setSaved(null);
    api
      .get<Grid>("/api/v1/school/attendance-ops/periods", {
        params: { section_id: sectionId, date: day, period_id: periodId },
      })
      .then((r) => {
        setGrid(r.data);
        const byId = Object.fromEntries(r.data.rows.map((x) => [x.student_id, x]));
        setLoaded(byId);
        setEdits(byId);
        setError(null);
      })
      .catch((e) => {
        setGrid(null);
        setError(apiError(e));
      });
  }, [sectionId, day, periodId]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(
    () => (grid?.rows ?? []).map((r) => edits[r.student_id] ?? r),
    [grid, edits]
  );

  // Only what actually moved. A save that posts the whole class would rewrite
  // marks somebody else made in the meantime.
  const changed = rows.filter((r) => {
    const was = loaded[r.student_id];
    if (!was) return true;
    if (!was.already_marked) return true;
    return was.status !== r.status || (was.remark ?? "") !== (r.remark ?? "");
  });

  const set = (studentId: number, patch: Partial<Row>) =>
    setEdits((e) => ({ ...e, [studentId]: { ...e[studentId], ...patch } }));

  const markAll = (status: string) =>
    setEdits((e) =>
      Object.fromEntries(Object.entries(e).map(([k, v]) => [k, { ...v, status }]))
    );

  const save = async () => {
    if (!grid || changed.length === 0) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const r = await api.post<Grid>("/api/v1/school/attendance-ops/periods", {
        section_id: grid.section_id,
        date: grid.date,
        period_id: grid.period_id,
        entries: changed.map((c) => ({
          student_id: c.student_id,
          status: c.status,
          remark: c.remark || null,
        })),
      });
      setGrid(r.data);
      const byId = Object.fromEntries(r.data.rows.map((x) => [x.student_id, x]));
      setLoaded(byId);
      setEdits(byId);
      setSaved(`${changed.length} child(ren) recorded for this lesson.`);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const differs = (r: Row) => r.day_status && r.day_status !== r.status;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mark a lesson"
        subtitle="Who was in this period. The daily register is not changed by anything on this page."
        actions={
          <Button onClick={save} loading={busy} disabled={!grid || changed.length === 0}>
            {changed.length ? `Save ${changed.length} change(s)` : "Nothing to save"}
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Select
            label="Section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
          >
            {classes.length === 0 && <option value="">No classes</option>}
            {classes.map((k) =>
              k.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {k.name} {s.name}
                </option>
              ))
            )}
          </Select>
          <Input
            label="Date"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
          <Select
            label="Period"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value ? Number(e.target.value) : "")}
          >
            {lessons.length === 0 && <option value="">No lessons that day</option>}
            {lessons.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label ?? `Period ${p.period_number}`} · {hhmm(p.start_time)}
              </option>
            ))}
          </Select>
          <Button variant="secondary" onClick={load} disabled={sectionId === "" || periodId === ""}>
            Reload
          </Button>
        </CardBody>
      </Card>

      {lessons.length === 0 && (
        <NoticeBox>
          The timetable has no lessons on {longDate(day)} — only breaks, or nothing set up
          for that weekday yet.
        </NoticeBox>
      )}

      {grid && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Children" value={rows.length} />
            <StatCard
              label="Marked for this lesson"
              value={`${grid.marked} of ${rows.length}`}
              accent={grid.marked >= rows.length && rows.length > 0 ? "emerald" : "amber"}
            />
            <StatCard label="Subject" value={grid.subject_name ?? "Not timetabled"} />
            <StatCard
              label="Differs from the day"
              value={rows.filter(differs).length}
              accent={rows.some(differs) ? "amber" : "emerald"}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {grid.period_label ?? `Period ${grid.period_number}`} ·{" "}
                {hhmm(grid.start_time)}–{hhmm(grid.end_time)}
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <Button key={s} variant="secondary" onClick={() => markAll(s)}>
                    All {humanize(s).toLowerCase()}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardBody className="p-0">
              <Table
                head={["Roll", "Student", "This lesson", "The day says", "Remark"]}
                empty={rows.length === 0 && "No children in this section yet."}
              >
                {rows.map((r) => (
                  <tr key={r.student_id}>
                    <td className={td}>{r.roll_no ?? "—"}</td>
                    <td className={tdStrong}>
                      {r.student_name}
                      <span className="block text-[11px] font-normal text-ink-subtle">
                        {r.admission_no}
                        {r.already_marked ? " · already marked" : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        value={r.status}
                        aria-label={`Status for ${r.student_name}`}
                        onChange={(e) => set(r.student_id, { status: e.target.value })}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {humanize(s)}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className={td}>
                      {r.day_status ? (
                        <Badge tone={differs(r) ? "amber" : tone(r.day_status)}>
                          {humanize(r.day_status)}
                        </Badge>
                      ) : (
                        <span className="text-ink-subtle">Not marked today</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        value={r.remark ?? ""}
                        placeholder="Optional"
                        aria-label={`Remark for ${r.student_name}`}
                        onChange={(e) => set(r.student_id, { remark: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </Table>
            </CardBody>
          </Card>

          <p className="text-[12px] text-ink-subtle">
            Each row starts from the morning register, so a lesson only needs the
            differences filling in. Saving sends those differences and nothing else.
          </p>
        </>
      )}
    </div>
  );
}
