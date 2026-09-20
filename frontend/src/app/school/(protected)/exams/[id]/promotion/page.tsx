"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select, Table, WarnBox, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Suggestion = "promoted" | "repeated" | "review";

type PromotionRow = {
  student_id: number;
  admission_no: string;
  student_name: string;
  class_id: number;
  class_name: string | null;
  section_name: string | null;
  subjects: number;
  passed: number;
  failed: number;
  absent: number;
  unmarked: number;
  obtained: number;
  out_of: number;
  percent: number;
  suggestion: Suggestion;
  because: string;
};

type Preview = {
  exam_id: number;
  exam_name: string;
  is_published: boolean;
  students: PromotionRow[];
  counts: Record<string, number>;
  total: number;
};

const TONE: Record<Suggestion, "emerald" | "amber" | "rose"> = {
  promoted: "emerald",
  repeated: "amber",
  review: "rose",
};

const LABEL: Record<Suggestion, string> = {
  promoted: "Promote",
  repeated: "Repeat year",
  review: "Needs a look",
};

function percentTone(pct: number): "emerald" | "amber" | "rose" {
  if (pct >= 60) return "emerald";
  if (pct >= 35) return "amber";
  return "rose";
}

export default function PromotionPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Preview | null>(null);
  const [filter, setFilter] = useState<Suggestion | "all">("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Preview>(`/api/v1/school/exam-ops/${id}/promotion-preview`)
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  const students = data?.students ?? [];
  const shown = filter === "all" ? students : students.filter((s) => s.suggestion === filter);
  const needsLook = students.filter((s) => s.suggestion === "review");

  return (
    <div className="space-y-6">
      <ErrorBox>{error}</ErrorBox>

      <NoticeBox>
        These are suggestions read off the marks, not decisions. Nothing on this page changes a
        child&rsquo;s year — it only puts the results in front of you so the decision is taken
        looking at them rather than from memory.
      </NoticeBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Children" value={data?.total ?? "—"} />
        <StatCard
          label="Passed everything"
          value={data?.counts.promoted ?? "—"}
          accent="emerald"
        />
        <StatCard label="Failed a subject" value={data?.counts.repeated ?? "—"} accent="amber" />
        <StatCard
          label="Needs a look"
          value={data?.counts.review ?? "—"}
          accent={needsLook.length ? "rose" : "emerald"}
        />
      </div>

      {needsLook.length > 0 && (
        <WarnBox>
          {needsLook.length === 1 ? "One child has" : `${needsLook.length} children have`} papers
          that were never marked, or that they were absent for. No result is not the same thing as
          a fail, so they are set aside here rather than counted as having failed. Finish the marks
          or record the absence properly before deciding anything for them.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>What the marks suggest</CardTitle>
          <div className="w-48">
            <Select
              aria-label="Filter by suggestion"
              value={filter}
              onChange={(e) => setFilter(e.target.value as Suggestion | "all")}
            >
              <option value="all">Everyone</option>
              <option value="promoted">Passed everything</option>
              <option value="repeated">Failed a subject</option>
              <option value="review">Needs a look</option>
            </Select>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={[
              "Admission no",
              "Student",
              "Subjects",
              "Passed",
              "Failed",
              "Absent",
              "Unmarked",
              "Total",
              "Percent",
              "Suggestion",
            ]}
            empty={
              shown.length === 0 &&
              (students.length === 0
                ? "No marks have been entered for this exam yet."
                : "Nobody matches that filter.")
            }
          >
            {shown.map((s) => (
              <tr key={s.student_id}>
                <td className={td}>{s.admission_no}</td>
                <td className={tdStrong}>
                  <Link href={`/school/students/${s.student_id}`} className="hover:underline">
                    {s.student_name}
                  </Link>
                  {(s.class_name || s.section_name) && (
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      {[s.class_name, s.section_name].filter(Boolean).join(" ")}
                    </span>
                  )}
                </td>
                <td className={td}>{s.subjects}</td>
                <td className={td}>{s.passed}</td>
                <td className={td}>{s.failed || "—"}</td>
                <td className={td}>{s.absent || "—"}</td>
                <td className={td}>{s.unmarked || "—"}</td>
                <td className={td}>
                  {s.obtained} <span className="text-ink-subtle">/ {s.out_of}</span>
                </td>
                <td className={td}>
                  {s.out_of > 0 ? (
                    <Badge tone={percentTone(s.percent)}>{s.percent}%</Badge>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
                <td className={td}>
                  <Badge tone={TONE[s.suggestion]}>{LABEL[s.suggestion]}</Badge>
                  <span className="mt-1 block text-[11px] text-ink-subtle">{s.because}</span>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="text-[13px] text-ink-muted">
          When you have decided, the move itself is made on{" "}
          <Link href="/school/students" className="font-bold text-brand-600 hover:underline">
            Students
          </Link>
          , where children are promoted into next year&rsquo;s classes.
        </CardBody>
      </Card>
    </div>
  );
}
