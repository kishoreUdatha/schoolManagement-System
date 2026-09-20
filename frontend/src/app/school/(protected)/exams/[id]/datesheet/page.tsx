"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, Table, WarnBox, td, tdStrong } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";
import { hhmm, longDate, shortDate } from "@/lib/dates";

type PaperLabel = {
  paper_id: number;
  class_subject_id: number;
  subject_name: string;
  subject_code: string | null;
  class_id: number | null;
  class_name: string | null;
  exam_date: string;
  start_time: string | null;
  duration_minutes: number | null;
  max_marks: number;
  pass_marks: number;
};

type DatesheetPaper = PaperLabel & {
  ends_at: string;
  has_time: boolean;
};

type Clash = {
  class_id: number;
  class_name: string | null;
  exam_date: string;
  papers: PaperLabel[];
};

type Datesheet = {
  exam_id: number;
  exam_name: string;
  start_date: string;
  end_date: string;
  days: { date: string; papers: DatesheetPaper[] }[];
  clashes: Clash[];
  papers_without_time: number;
};

export default function DatesheetPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Datesheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Datesheet>(`/api/v1/school/exam-ops/${id}/datesheet`)
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  const days = data?.days ?? [];

  return (
    <div className="space-y-6">
      <ErrorBox>{error}</ErrorBox>

      {/* A clash is the one thing on this page that cannot be worked around
          on the day: the same children are due in two rooms at once. */}
      {data && data.clashes.length > 0 && (
        <WarnBox>
          <p className="font-bold">
            {data.clashes.length === 1 ? "One clash" : `${data.clashes.length} clashes`} — the
            same children are due to sit two papers at once:
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {data.clashes.map((c, i) => (
              <li key={i}>
                {c.class_name ?? "A class"} sits{" "}
                {c.papers.map((p) => p.subject_name).join(" and ")} at the same hour on{" "}
                {shortDate(c.exam_date)}.
              </li>
            ))}
          </ul>
        </WarnBox>
      )}

      {data && data.papers_without_time > 0 && (
        <p className="text-[13px] text-ink-muted">
          {data.papers_without_time} paper
          {data.papers_without_time === 1 ? " has" : "s have"} no start time. They are taken to
          begin at 09:00 when checking for clashes.
        </p>
      )}

      {days.length === 0 && !error && (
        <Card>
          <CardBody className="py-10 text-center text-[13px] text-ink-muted">
            No papers have been added to this exam yet.
          </CardBody>
        </Card>
      )}

      {days.map((day) => (
        <Card key={day.date}>
          <CardHeader>
            <CardTitle>{longDate(day.date)}</CardTitle>
            <span className="text-[12px] font-bold text-ink-muted">
              {day.papers.length} paper{day.papers.length === 1 ? "" : "s"}
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <Table head={["Time", "Subject", "Class", "Out of", "Duration"]}>
              {day.papers.map((p) => (
                <tr key={p.paper_id}>
                  <td className={td}>
                    {p.has_time && p.start_time ? (
                      `${hhmm(p.start_time)} – ${hhmm(p.ends_at)}`
                    ) : (
                      <span className="text-ink-subtle">Not set</span>
                    )}
                  </td>
                  <td className={tdStrong}>
                    {p.subject_name}
                    {p.subject_code && (
                      <span className="block font-mono text-[11px] font-normal text-ink-subtle">
                        {p.subject_code}
                      </span>
                    )}
                  </td>
                  <td className={td}>{p.class_name ?? "—"}</td>
                  <td className={td}>{p.max_marks}</td>
                  <td className={td}>
                    {p.duration_minutes ? `${p.duration_minutes} min` : "—"}
                  </td>
                </tr>
              ))}
            </Table>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
