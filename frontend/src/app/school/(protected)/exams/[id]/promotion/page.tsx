"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Table, WarnBox, td, tdStrong } from "@/components/ui/Field";
import {
  FilterBar,
  PanelFooter,
  PersonCell,
  StatStrip,
} from "@/components/ui/Workspace";
import { CircleCheck, Eye, RotateCcw, Users } from "lucide-react";
import { api, apiError } from "@/lib/api";

/** A select sized for the filter bar: same height as the search box, and no
 *  stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

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

      <StatStrip
        stats={[
          {
            label: "Children",
            value: data?.total ?? "—",
            note: data?.exam_name,
            icon: Users,
          },
          {
            label: "Passed everything",
            value: data?.counts.promoted ?? "—",
            note: "Suggested for promotion",
            icon: CircleCheck,
          },
          {
            label: "Failed a subject",
            value: data?.counts.repeated ?? "—",
            note: "Suggested to repeat the year",
            icon: RotateCcw,
          },
          {
            label: "Needs a look",
            value: data?.counts.review ?? "—",
            note: "Absent or unmarked papers",
            icon: Eye,
          },
        ]}
      />

      {needsLook.length > 0 && (
        <WarnBox>
          {needsLook.length === 1 ? "One child has" : `${needsLook.length} children have`} papers
          that were never marked, or that they were absent for. No result is not the same thing as
          a fail, so they are set aside here rather than counted as having failed. Finish the marks
          or record the absence properly before deciding anything for them.
        </WarnBox>
      )}

      <FilterBar>
        <select
          aria-label="Filter by suggestion"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Suggestion | "all")}
          className={filterSelect}
        >
          <option value="all">Everyone</option>
          <option value="promoted">Passed everything</option>
          <option value="repeated">Failed a subject</option>
          <option value="review">Needs a look</option>
        </select>
      </FilterBar>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>What the marks suggest</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Read off the marks entered for this exam. A suggestion is not a decision
              — nothing here moves a child.
            </p>
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
                    <PersonCell
                      name={s.student_name}
                      sub={[s.class_name, s.section_name].filter(Boolean).join(" ") || null}
                    />
                  </Link>
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
        <PanelFooter
          left={`Showing ${shown.length} of ${students.length} child(ren)`}
          right={
            data?.is_published
              ? "Results are published"
              : "Results are not published yet"
          }
        />
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
