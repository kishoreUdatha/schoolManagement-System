"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { pct } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { ExamSelects, useExamChoice } from "./common";
import type { PromotionPreview } from "./types";

const DECISION: Record<string, string> = { promoted: "Promote", repeated: "Repeat year", review: "Needs review" };

/**
 * SCR-153, live: GET /school/exam-ops/{id}/promotion-preview. These are
 * suggestions read off the marks, not decisions; the move itself is made on
 * Promotion / Transfer (SCR-069), which calls POST /school/students/promote.
 */
export function PromotionDecision() {
  const c = useExamChoice();
  const prev = useApi<PromotionPreview>(c.examId ? `/api/v1/school/exam-ops/${c.examId}/promotion-preview` : null);
  const [cls, setCls] = useState("");
  const [decision, setDecision] = useState("");
  const students = prev.data?.students ?? [];
  const classes = useMemo(() => Array.from(new Set(students.map((s) => s.class_name ?? "—"))).sort(), [students]);
  const shown = students.filter((s) => (!cls || (s.class_name ?? "—") === cls) && (!decision || s.suggestion === decision));

  const rows: Row[] = shown.map((s) => [
    { name: s.student_name, sub: s.admission_no },
    s.class_name ?? "—",
    s.section_name ?? "—",
    `${s.out_of ? pct(s.percent) : "—"} · ${s.passed} passed, ${s.failed} failed${s.absent ? `, ${s.absent} absent` : ""}${s.unmarked ? `, ${s.unmarked} unmarked` : ""}`,
    s.because,
    DECISION[s.suggestion] ?? s.suggestion,
  ]);

  const count = (k: string) => (prev.data ? String(prev.data.counts[k] ?? 0) : "…");
  const stats = [
    { label: "Students", value: prev.data ? String(prev.data.total) : "…", note: prev.data?.exam_name ?? "Selected exam" },
    { label: "Promote", value: count("promoted"), note: "Passed everything" },
    { label: "Repeat year", value: count("repeated"), note: "Failed one or more subjects" },
    { label: "Needs review", value: count("review"), note: "Unmarked or absent papers" },
  ];

  return (
    <>
      <div className="filterbar">
        <ExamSelects c={c} />
        <select aria-label="Filter class" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select aria-label="Filter decision" value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="">All decisions</option>
          <option value="promoted">Promote</option>
          <option value="repeated">Repeat year</option>
          <option value="review">Needs review</option>
        </select>
        <Link href={routeOf(69)} className="btn primary">
          <Icon name="check" className="sm" />
          Confirm decisions
        </Link>
      </div>
      <ErrorNote>{c.error ?? prev.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>These are suggestions read off the marks, not decisions. Nothing here changes a student’s year: confirm the moves on Promotion / Transfer, where students are placed into next year’s classes.</span>
      </div>
      <Panel
        title="Promotion review"
        sub={prev.data ? `${prev.data.exam_name}${prev.data.is_published ? " · results published" : " · results not published yet"}` : prev.loading ? "Loading…" : "Choose an exam"}
        action={<Badge>{prev.data && (prev.data.counts.review ?? 0) > 0 ? "Review pending" : "No review needed"}</Badge>}
        flush
      >
        <DataTable
          columns={["Student", "Current class", "Section", "Result", "Because", "Decision"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          empty={prev.loading ? "Loading…" : students.length ? "No students match these filters." : undefined}
          emptyState={{
            title: "No results to base a promotion on",
            note: "The suggestions here are read off the exam's marks, so they only appear once results are entered for this exam.",
          }}
        />
      </Panel>
    </>
  );
}
