"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui/Card";
import { ErrorBox, Select, Table, td, tdStrong } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export type SectionProgress = {
  section_id: number;
  section_label: string;
  covered: number;
  total: number;
  percent: number;
  behind: number;
};

export type ClassSubjectSummary = {
  class_subject_id: number;
  class_id: number;
  class_name: string;
  subject_id: number;
  subject_name: string;
  teacher_user_id: number | null;
  teacher_name: string | null;
  chapters: number;
  topics: number;
  can_edit: boolean;
  sections: SectionProgress[];
};

export function ProgressBar({ p, behind }: { p: SectionProgress; behind?: boolean }) {
  return (
    <div className="min-w-40">
      <div className="flex justify-between text-xs text-ink-muted">
        <span>{p.section_label}</span>
        <span>
          {p.covered}/{p.total} · {p.percent}%
        </span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-surface-subtle">
        <div
          className={cn("h-full rounded-full", p.behind > 0 ? "bg-amber-500" : "bg-emerald-500")}
          style={{ width: `${p.percent}%` }}
        />
      </div>
      {behind !== false && p.behind > 0 && <div className="text-[11px] text-amber-500">{p.behind} topic(s) behind plan</div>}
    </div>
  );
}

/** Class-subjects with per-section progress. Reviewers get a year picker. */
export function SyllabusList({ linkBase, yearPicker = false }: { linkBase: string; yearPicker?: boolean }) {
  const [years, setYears] = useState<{ id: number; name: string; is_current: boolean }[]>([]);
  const [yearId, setYearId] = useState("");
  const [rows, setRows] = useState<ClassSubjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!yearPicker) return;
    api
      .get<{ id: number; name: string; is_current: boolean }[]>("/api/v1/school/academic-years")
      .then((r) => {
        setYears(r.data);
        const cur = r.data.find((y) => y.is_current) ?? r.data[0];
        setYearId(cur ? String(cur.id) : "current");
      })
      // Not allowed to list years (principal): fall back to the current year.
      .catch(() => setYearId("current"));
  }, [yearPicker]);

  useEffect(() => {
    if (yearPicker && !yearId) return;
    api
      .get<ClassSubjectSummary[]>("/api/v1/school/syllabus", {
        params: yearId && yearId !== "current" ? { academic_year_id: yearId } : {},
      })
      .then((r) => setRows(r.data))
      .catch((e) => setError(apiError(e)));
  }, [yearId, yearPicker]);

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      {yearPicker && years.length > 0 && (
        <div className="max-w-xs">
          <Select label="Academic year" value={yearId} onChange={(e) => setYearId(e.target.value)}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
                {y.is_current ? " (current)" : ""}
              </option>
            ))}
          </Select>
        </div>
      )}
      <Card>
        <Table head={["Class", "Subject", "Teacher", "Syllabus", "Progress by section"]} empty={rows.length === 0 && "No subjects assigned."}>
          {rows.map((r) => (
            <tr key={r.class_subject_id}>
              <td className={td}>{r.class_name}</td>
              <td className={tdStrong}>
                <Link href={`${linkBase}/${r.class_subject_id}`} className="text-brand-500 hover:underline">
                  {r.subject_name}
                </Link>
              </td>
              <td className={td}>{r.teacher_name ?? "—"}</td>
              <td className={td}>{r.topics ? `${r.chapters} chapters · ${r.topics} topics` : <span className="text-amber-500">not set up</span>}</td>
              <td className="space-y-2 px-3 py-2">
                {r.topics > 0 && r.sections.map((s) => <ProgressBar key={s.section_id} p={s} />)}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
