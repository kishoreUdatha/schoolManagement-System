"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { FileSignature, FileText, PencilLine, Users } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Table, WarnBox, td, tdStrong } from "@/components/ui/Field";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { shortDate } from "@/lib/dates";

type DashboardPaper = {
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
  candidates: number;
  marks_entered: number;
  marks_complete: boolean;
  verified: boolean;
  allocated: number;
  rooms_used: number;
  fully_allocated: boolean;
  invigilators: number;
  invigilators_missing: boolean;
};

type Blocker = { kind: string; count: number; detail: string };

type Dashboard = {
  exam_id: number;
  exam_name: string;
  kind: string;
  start_date: string;
  end_date: string;
  is_published: boolean;
  marks_open: boolean;
  results_approved_at: string | null;
  papers: number;
  candidates: number;
  marks_entered: number;
  marks_percent: number;
  papers_verified: number;
  papers_allocated: number;
  rows: DashboardPaper[];
  blockers: Blocker[];
  ready_to_publish: boolean;
};

function shortTime(t: string | null): string {
  return t ? t.slice(0, 5) : "Not set";
}

export default function ExamOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Dashboard>(`/api/v1/school/exam-ops/${id}/dashboard`)
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-[18px]">
      <ErrorBox>{error}</ErrorBox>

      {/* No page header and no welcome band here. The exam's name, its dates
          and its publish state are the layout's, printed once above the tab
          row for every page of this exam, and a second heading here would
          say the same thing twice. Quick actions would repeat those tabs. */}
      <StatStrip
        stats={[
          { label: "Papers", value: data?.papers ?? "—", icon: FileText },
          { label: "Candidates", value: data?.candidates ?? "—", icon: Users },
          {
            label: "Marks entered",
            value: data?.marks_entered ?? "—",
            note: data ? `${data.marks_percent}% of those expected` : undefined,
            icon: PencilLine,
          },
          {
            label: "Papers signed off",
            value: data ? `${data.papers_verified} of ${data.papers}` : "—",
            icon: FileSignature,
          },
        ]}
      />

      {/* The backend words each blocker as something somebody can act on, so
          it is printed as written rather than re-phrased into a percentage. */}
      {data && data.blockers.length > 0 && (
        <WarnBox>
          <p className="font-bold">Results are not ready yet:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {data.blockers.map((b) => (
              <li key={b.kind}>{b.detail}</li>
            ))}
          </ul>
        </WarnBox>
      )}
      {data?.ready_to_publish && (
        <NoticeBox>
          Every paper is marked and signed off, and the results have been approved. This exam
          is ready to publish.
        </NoticeBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Paper by paper</CardTitle>
          {data && !data.marks_open && <Badge tone="neutral">Marks entry closed</Badge>}
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Subject", "When", "Marks", "Signed off", "Halls", "Invigilators"]}
            empty={rows.length === 0 && "No papers have been added to this exam yet."}
          >
            {rows.map((p) => (
              <tr key={p.paper_id}>
                <td className={tdStrong}>
                  <Link
                    href={`/school/exams/${id}/halls?paper=${p.paper_id}`}
                    className="hover:underline"
                  >
                    {p.subject_name}
                  </Link>
                  {p.class_name && (
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      {p.class_name}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {shortDate(p.exam_date)}
                  <span className="block text-[11px] text-ink-subtle">
                    {shortTime(p.start_time)}
                  </span>
                </td>
                <td className={td}>
                  <Badge tone={p.marks_complete ? "emerald" : "amber"}>
                    {p.marks_entered} / {p.candidates}
                  </Badge>
                </td>
                <td className={td}>
                  {p.verified ? (
                    <Badge tone="emerald">Signed off</Badge>
                  ) : (
                    <Badge tone="amber">Not signed off</Badge>
                  )}
                </td>
                <td className={td}>
                  <Badge tone={p.fully_allocated ? "emerald" : "neutral"}>
                    {p.allocated} / {p.candidates}
                  </Badge>
                  {p.rooms_used > 0 && (
                    <span className="block text-[11px] text-ink-subtle">
                      {p.rooms_used} room{p.rooms_used === 1 ? "" : "s"}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {p.invigilators_missing ? (
                    <Badge tone="rose">{p.invigilators} for {p.rooms_used} rooms</Badge>
                  ) : p.invigilators > 0 ? (
                    <Badge tone="emerald">{p.invigilators}</Badge>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        {data && (
          <PanelFooter
            left={`${rows.length} paper${rows.length === 1 ? "" : "s"}`}
            right={`${data.papers_allocated} of ${data.papers} fully seated`}
          />
        )}
      </Card>
    </div>
  );
}
