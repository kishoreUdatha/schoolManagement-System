"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  WarnBox,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type AcademicYear = { id: number; name: string; is_current: boolean };
type SectionLite = { id: number; name: string };
type SchoolClass = { id: number; name: string; sections: SectionLite[] };

type SubjectRow = {
  class_subject_id: number;
  subject_name: string;
  teacher_name: string | null;
  has_teacher: boolean;
  periods_per_week: number;
  placed: number;
  short_by: number;
  over_by: number;
};
type Requirements = {
  section_id: number;
  teaching_slots_per_week: number;
  periods_wanted: number;
  fits: boolean;
  over_by: number;
  unset: string[];
  subjects: SubjectRow[];
};
type Placed = {
  class_subject_id: number;
  subject_name: string;
  day_of_week: number;
  period_number: number;
};
type Unplaced = {
  class_subject_id: number;
  subject_name: string;
  still_short: number;
  because: string;
};
type GenResult = {
  section_id: number;
  placed: number;
  entries: Placed[];
  unplaced: Unplaced[];
  left_empty: number;
  complete: boolean;
};

export default function GenerateTimetablePage() {
  return (
    <Suspense fallback={null}>
      <GenerateTimetable />
    </Suspense>
  );
}

/** Filling a section's week in one go.
 *
 *  The generator is deliberately modest and says what it could not place. This
 *  screen puts that first: a run that came up short is the thing you need to
 *  read, not the count of what worked.
 */
function GenerateTimetable() {
  const search = useSearchParams();
  const preset = search.get("section");

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sectionId, setSectionId] = useState<number | "">(preset ? Number(preset) : "");
  const [req, setReq] = useState<Requirements | null>(null);
  const [result, setResult] = useState<GenResult | null>(null);
  const [replace, setReplace] = useState(true);
  const [seed, setSeed] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<AcademicYear[]>("/api/v1/school/academic-years")
      .then((r) => {
        const cur = r.data.find((y) => y.is_current) ?? r.data[0];
        if (!cur) return;
        return api
          .get<SchoolClass[]>("/api/v1/school/classes", {
            params: { academic_year_id: cur.id },
          })
          .then((c) => {
            setClasses(c.data);
            if (!preset) {
              const first = c.data.find((k) => k.sections.length > 0);
              if (first) setSectionId(first.sections[0].id);
            }
          });
      })
      .catch((e) => setError(apiError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRequirements = useCallback(() => {
    if (!sectionId) {
      setReq(null);
      return;
    }
    api
      .get<Requirements>(`/api/v1/school/timetable-gen/sections/${sectionId}/requirements`)
      .then((r) => setReq(r.data))
      .catch((e) => setError(apiError(e)));
  }, [sectionId]);

  useEffect(() => {
    setResult(null);
    loadRequirements();
  }, [loadRequirements]);

  async function setPeriods(csId: number, value: number) {
    setSavingId(csId);
    setError(null);
    try {
      await api.put(`/api/v1/school/timetable-gen/class-subjects/${csId}/periods`, {
        periods_per_week: value,
      });
      loadRequirements();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSavingId(null);
    }
  }

  async function generate() {
    if (!sectionId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const { data } = await api.post<GenResult>(
        `/api/v1/school/timetable-gen/sections/${sectionId}/generate`,
        { replace, seed: seed.trim() ? Number(seed) : null }
      );
      setResult(data);
      loadRequirements();
    } catch (e) {
      // A 400 here says exactly how many periods over the week is, which is
      // more use than "could not generate".
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  const subjects = req?.subjects ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Generate a timetable"
        subtitle="Say how many periods each subject needs, then let it place them around the teachers."
        actions={
          <>
            <Link href="/school/timetable">
              <Button variant="secondary">All timetables</Button>
            </Link>
            {sectionId && (
              <Link href={`/school/timetable/setup?section=${sectionId}`}>
                <Button variant="secondary">Edit by hand</Button>
              </Link>
            )}
          </>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Select
            label="Section"
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select…</option>
            {classes.flatMap((c) =>
              c.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {c.name} {s.name}
                </option>
              ))
            )}
          </Select>
          <label className="flex items-center gap-2 pb-3 text-[13px] text-ink-muted">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            Replace what is already there
          </label>
          <Input
            label="Seed"
            value={seed}
            placeholder="optional"
            hint="The same seed lays the week out the same way twice."
            onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))}
          />
          <Button onClick={generate} loading={busy} disabled={!sectionId || !req?.fits}>
            Generate
          </Button>
        </CardBody>
      </Card>

      {req && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Slots in the week" value={req.teaching_slots_per_week} />
            <StatCard
              label="Periods asked for"
              value={req.periods_wanted}
              accent={req.fits ? "emerald" : "rose"}
              hint={req.fits ? undefined : `${req.over_by} too many`}
            />
            <StatCard
              label="Already placed"
              value={subjects.reduce((n, s) => n + s.placed, 0)}
            />
            <StatCard
              label="Subjects with no target"
              value={req.unset.length}
              accent={req.unset.length ? "amber" : "emerald"}
            />
          </div>

          {!req.fits && (
            <WarnBox>
              The subjects want {req.periods_wanted} periods a week but there are only{" "}
              {req.teaching_slots_per_week}. Reduce something by {req.over_by} before
              generating — nothing will be placed until the week fits.
            </WarnBox>
          )}

          {req.unset.length > 0 && (
            <NoticeBox>
              No weekly target set for {req.unset.join(", ")}. A subject with no target is
              left out of generation entirely rather than guessed at.
            </NoticeBox>
          )}

          <Card>
            <CardHeader>
              <CardTitle>What each subject needs</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <Table
                head={["Subject", "Teacher", "Periods a week", "Placed", "Still short"]}
                empty={subjects.length === 0 && "No subjects assigned to this class yet."}
              >
                {subjects.map((s) => (
                  <tr key={s.class_subject_id}>
                    <td className={tdStrong}>{s.subject_name}</td>
                    <td className={td}>
                      {s.has_teacher ? (
                        s.teacher_name
                      ) : (
                        <Badge tone="amber">Nobody assigned</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={0}
                        max={40}
                        className="w-24"
                        defaultValue={s.periods_per_week}
                        disabled={savingId === s.class_subject_id}
                        aria-label={`Periods a week for ${s.subject_name}`}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (v !== s.periods_per_week) setPeriods(s.class_subject_id, v);
                        }}
                      />
                    </td>
                    <td className={td}>{s.placed}</td>
                    <td className={td}>
                      {s.short_by > 0 ? (
                        <Badge tone="amber">{s.short_by}</Badge>
                      ) : s.over_by > 0 ? (
                        <Badge tone="rose">{s.over_by} over</Badge>
                      ) : (
                        <Badge tone="emerald">Done</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            </CardBody>
          </Card>
        </>
      )}

      {result && (
        <>
          {/* The short list comes before the success count on purpose: a run
              that placed forty lessons and missed three is the three. */}
          {result.unplaced.length > 0 ? (
            <WarnBox>
              It could not place everything. {result.unplaced.length} subject(s) came up
              short — each reason is below, and nothing was invented to fill the gap.
            </WarnBox>
          ) : (
            <NoticeBox>
              Every subject got the periods it asked for. {result.left_empty} slot(s) left
              free.
            </NoticeBox>
          )}

          {result.unplaced.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Could not be placed</CardTitle>
              </CardHeader>
              <CardBody className="p-0">
                <Table head={["Subject", "Still short", "Why"]}>
                  {result.unplaced.map((u) => (
                    <tr key={u.class_subject_id}>
                      <td className={tdStrong}>{u.subject_name}</td>
                      <td className={td}>
                        <Badge tone="rose">{u.still_short}</Badge>
                      </td>
                      {/* Verbatim: the wording names the teacher and the
                          constraint, which is what tells you what to change. */}
                      <td className={td}>{u.because}</td>
                    </tr>
                  ))}
                </Table>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Placed this run</CardTitle>
              <span className="text-[12px] font-bold text-ink-muted">
                {result.placed} lesson(s), {result.left_empty} slot(s) still free
              </span>
            </CardHeader>
            <CardBody className="p-0">
              <Table
                head={["Subject", "Day", "Period"]}
                empty={result.entries.length === 0 && "Nothing was placed."}
              >
                {result.entries.map((e, i) => (
                  <tr key={`${e.class_subject_id}-${i}`}>
                    <td className={tdStrong}>{e.subject_name}</td>
                    <td className={td}>{DAYS[e.day_of_week - 1]}</td>
                    <td className={td}>P{e.period_number}</td>
                  </tr>
                ))}
              </Table>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
