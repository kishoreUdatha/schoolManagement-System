"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardList, Hourglass, Send } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  WarnBox,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type Exam = {
  id: number;
  name: string;
  kind: string;
  academic_year_name: string | null;
  start_date: string;
  end_date: string;
  is_published: boolean;
  published_at: string | null;
  papers_count: number;
  total_marks_entered: number;
};

type Blocker = { kind: string; count: number; detail: string };
type Dashboard = {
  exam_id: number;
  papers: number;
  candidates: number;
  marks_entered: number;
  marks_percent: number;
  papers_verified: number;
  blockers: Blocker[];
  ready_to_publish: boolean;
};

/** Releasing a result set, which is the principal's call.
 *
 *  Publishing is what puts a mark in front of a family, so the button is
 *  deliberately preceded by what is not finished yet: papers still unmarked,
 *  papers marked but not signed off. A head who publishes anyway has decided
 *  to; one who publishes without being told has merely clicked.
 */
export default function PrincipalExamsPage() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [checks, setChecks] = useState<Record<number, Dashboard>>({});
  const [confirm, setConfirm] = useState<Exam | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api
      .get<Exam[]>("/api/v1/school/exams")
      .then((r) => {
        setExams(r.data);
        r.data.forEach((e) =>
          api
            .get<Dashboard>(`/api/v1/school/exam-ops/${e.id}/dashboard`)
            .then((d) => setChecks((c) => ({ ...c, [e.id]: d.data })))
            .catch(() => undefined)
        );
      })
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
  }, []);

  const act = async (exam: Exam, action: "publish" | "unpublish") => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await api.post(`/api/v1/school/exams/${exam.id}/${action}`);
      setDone(
        action === "publish"
          ? `${exam.name} is now with families.`
          : `${exam.name} has been taken back off the family portal.`
      );
      setConfirm(null);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const published = exams.filter((e) => e.is_published).length;
  const waiting = exams.filter(
    (e) => !e.is_published && checks[e.id]?.ready_to_publish
  ).length;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Exam results"
        subtitle="What is ready to go to families, what is still missing, and the decision to release it."
      />
      <ErrorBox>{error}</ErrorBox>
      {done && <NoticeBox>{done}</NoticeBox>}

      {/* Counted off the exams already listed and the readiness check each
          one returned — nothing here is a second question to the server. */}
      <StatStrip
        stats={[
          { label: "Exams", value: exams.length, note: "Set up this year", icon: ClipboardList },
          {
            label: "Published",
            value: published,
            note: "Families can see these",
            icon: Send,
          },
          {
            label: "Ready to publish",
            value: waiting,
            note: waiting ? "Marked and signed off" : "Nothing waiting on you",
            icon: CheckCircle2,
          },
          {
            label: "Not ready",
            value: exams.length - published - waiting,
            note: "Still missing marks or sign-off",
            icon: Hourglass,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Every exam</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              What is marked, what is signed off, and what has gone to families.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Exam", "When", "Papers", "Marks", "State", ""]}
            empty={exams.length === 0 && "No exams have been set up yet."}
          >
            {exams.map((e) => {
              const check = checks[e.id];
              return (
                <tr key={e.id}>
                  <td className={tdStrong}>
                    {e.name}
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      {humanize(e.kind)}
                      {e.academic_year_name ? ` · ${e.academic_year_name}` : ""}
                    </span>
                  </td>
                  <td className={td}>
                    {e.start_date}
                    <span className="block text-[11px] text-ink-subtle">to {e.end_date}</span>
                  </td>
                  <td className={td}>{e.papers_count}</td>
                  <td className={td}>
                    {check ? (
                      <>
                        {check.marks_entered} of {check.candidates}
                        <span className="block text-[11px] text-ink-subtle">
                          {check.papers_verified} of {check.papers} signed off
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                  <td className={td}>
                    {e.is_published ? (
                      <Badge tone="emerald">Published</Badge>
                    ) : check?.ready_to_publish ? (
                      <Badge tone="amber">Ready</Badge>
                    ) : check ? (
                      <Badge tone="neutral">{check.blockers.length} thing(s) outstanding</Badge>
                    ) : (
                      <Badge tone="neutral">Checking…</Badge>
                    )}
                  </td>
                  <td className={td}>
                    {e.is_published ? (
                      <Button variant="secondary" onClick={() => act(e, "unpublish")}>
                        Take back
                      </Button>
                    ) : (
                      <Button onClick={() => setConfirm(e)}>Publish</Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${exams.length} exam${exams.length === 1 ? "" : "s"} · ${published} published`}
          right={waiting ? `${waiting} ready for your decision` : "Nothing waiting on you"}
        />
      </Card>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? `Publish ${confirm.name}?` : ""}
      >
        {confirm && (
          <div className="space-y-4">
            {checks[confirm.id]?.blockers.length ? (
              <>
                <WarnBox>
                  This exam is not finished. Publishing now puts these results in front of
                  families as they stand.
                </WarnBox>
                <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-muted">
                  {checks[confirm.id].blockers.map((b) => (
                    <li key={b.kind}>{b.detail}</li>
                  ))}
                </ul>
              </>
            ) : (
              <NoticeBox>
                Every paper is marked and signed off. Publishing sends these results to
                families.
              </NoticeBox>
            )}
            <p className="text-[13px] text-ink-muted">
              Results can be taken back afterwards, but families may already have seen
              them by then.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button onClick={() => act(confirm, "publish")} loading={busy}>
                Publish results
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
