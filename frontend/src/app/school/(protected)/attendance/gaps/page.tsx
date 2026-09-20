"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { useAcademicYear } from "@/components/AcademicYearProvider";
import { longDate, toIso } from "@/lib/dates";

type Section = { id: number; name: string };
type SchoolClass = { id: number; name: string; sections: Section[] };

type Gap = {
  student_id: number;
  student_name: string | null;
  admission_no: string | null;
  period_number: number;
  period_label: string | null;
  remark: string | null;
};
type Gaps = { date: string; section_id: number; gaps: Gap[]; count: number };

/** Children who came through the gate and never reached the classroom.
 *
 *  This is the only reason to mark attendance twice a day. A child absent all
 *  day is not here — they are simply away, and the register already says so.
 */
export default function AttendanceGapsPage() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sectionId, setSectionId] = useState<number | "">("");
  const [day, setDay] = useState(toIso());
  const [data, setData] = useState<Gaps | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sections come from the year chosen in the top bar, so switching the year
  // re-points this page rather than pinning it to whichever year is current.
  const yearId = useAcademicYear()?.yearId ?? null;

  useEffect(() => {
    if (!yearId) return;
    api
      .get<SchoolClass[]>("/api/v1/school/classes", {
        params: { academic_year_id: yearId },
      })
      .then((c) => {
        setClasses(c.data);
        const first = c.data.find((k) => k.sections.length > 0);
        setSectionId(first ? first.sections[0].id : "");
      })
      .catch((e) => setError(apiError(e)));
  }, [yearId]);

  const load = useCallback(() => {
    if (sectionId === "") return;
    api
      .get<Gaps>("/api/v1/school/attendance-ops/periods/gaps", {
        params: { section_id: sectionId, date: day },
      })
      .then((r) => {
        setData(r.data);
        setError(null);
      })
      .catch((e) => setError(apiError(e)));
  }, [sectionId, day]);

  useEffect(() => {
    load();
  }, [load]);

  // One child can be missing from more than one lesson; that is worse than
  // slipping a single period, so it earns its own line.
  const perChild = new Map<number, Gap[]>();
  (data?.gaps ?? []).forEach((g) => {
    perChild.set(g.student_id, [...(perChild.get(g.student_id) ?? []), g]);
  });
  const repeat = [...perChild.values()].filter((g) => g.length > 1).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unaccounted for"
        subtitle="Children marked present this morning who were missing from a lesson."
      />
      <ErrorBox>{error}</ErrorBox>

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
          <Button variant="secondary" onClick={load} disabled={sectionId === ""}>
            Check again
          </Button>
        </CardBody>
      </Card>

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Lessons missed"
              value={data.count}
              accent={data.count ? "rose" : "emerald"}
            />
            <StatCard label="Children involved" value={perChild.size} />
            <StatCard
              label="Missing from more than one"
              value={repeat}
              accent={repeat ? "rose" : "emerald"}
            />
          </div>

          {data.count === 0 ? (
            <NoticeBox>
              Nobody is unaccounted for on {longDate(data.date)}. Either every lesson
              matches the morning register, or the lessons have not been marked yet.
            </NoticeBox>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{longDate(data.date)}</CardTitle>
              </CardHeader>
              <CardBody className="p-0">
                <Table head={["Student", "Missing from", "Remark", ""]}>
                  {data.gaps.map((g, i) => (
                    <tr key={`${g.student_id}-${g.period_number}-${i}`}>
                      <td className={tdStrong}>
                        {g.student_name ?? "Unknown"}
                        <span className="block text-[11px] font-normal text-ink-subtle">
                          {g.admission_no}
                        </span>
                      </td>
                      <td className={td}>
                        <Badge tone="rose">
                          {g.period_label ?? `Period ${g.period_number}`}
                        </Badge>
                        {(perChild.get(g.student_id)?.length ?? 0) > 1 && (
                          <span className="ml-2 text-[11px] text-ink-subtle">
                            {perChild.get(g.student_id)!.length} lessons today
                          </span>
                        )}
                      </td>
                      <td className={td}>{g.remark ?? "—"}</td>
                      <td className={td}>
                        <Link
                          href={`/school/students/${g.student_id}`}
                          className="font-bold text-brand-600 hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </Table>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
