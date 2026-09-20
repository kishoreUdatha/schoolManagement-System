"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, Select, Table, WarnBox, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { hhmm, readableDate } from "@/lib/dates";
import { openAuthed } from "@/lib/download";

type Exam = { id: number; academic_year_id: number };
type SchoolClass = { id: number; name: string };

type Sitting = {
  paper_id: number;
  subject_name: string;
  subject_code: string | null;
  exam_date: string;
  start_time: string | null;
  ends_at: string;
  duration_minutes: number | null;
  max_marks: number;
  room_name: string | null;
  building: string | null;
};

type AdmitCard = {
  exam_id: number;
  exam_name: string;
  school_name: string;
  school_address: string | null;
  student_id: number;
  student_name: string;
  admission_no: string;
  roll_no: number | null;
  class_name: string | null;
  section_name: string | null;
  photo_url: string | null;
  sittings: Sitting[];
  rooms_allocated: number;
};

export default function AdmitCardsPage() {
  const { id } = useParams<{ id: string }>();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState<number | "">("");
  const [cards, setCards] = useState<AdmitCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Exam>(`/api/v1/school/exams/${id}`)
      .then((r) =>
        api.get<SchoolClass[]>("/api/v1/school/classes", {
          params: { academic_year_id: r.data.academic_year_id },
        })
      )
      .then((r) => setClasses(r.data))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  useEffect(() => {
    if (!classId) {
      setCards([]);
      return;
    }
    setLoading(true);
    api
      .get<AdmitCard[]>(`/api/v1/school/exam-ops/${id}/admit-cards`, {
        params: { class_id: classId },
      })
      .then((r) => setCards(r.data))
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  }, [id, classId]);

  async function downloadPdf(card: AdmitCard) {
    setBusy(card.student_id);
    try {
      await openAuthed(
        `/api/v1/school/exam-ops/${id}/admit-cards/${card.student_id}/pdf`,
        `admit-card-${card.admission_no}.pdf`
      );
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(null);
    }
  }

  const incomplete = cards.filter((c) => c.rooms_allocated < c.sittings.length);

  return (
    <div className="space-y-6">
      <ErrorBox>{error}</ErrorBox>

      <div className="max-w-xs">
        <Select
          label="Class"
          value={classId}
          onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : "")}
        >
          <option value="">Choose a class</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {classId !== "" && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Cards ready" value={loading ? "—" : cards.length} />
            <StatCard
              label="Missing a room"
              value={loading ? "—" : incomplete.length}
              accent={incomplete.length ? "amber" : "emerald"}
              hint={incomplete.length ? "at least one paper each" : undefined}
            />
            <StatCard
              label="Papers on each card"
              value={loading ? "—" : cards[0]?.sittings.length ?? 0}
            />
          </div>

          {incomplete.length > 0 && (
            <WarnBox>
              {incomplete.length === 1
                ? "One child has"
                : `${incomplete.length} children have`}{" "}
              at least one paper with no room allocated. Those cards will print &ldquo;To be
              announced&rdquo; where the room should be, which tells a child to turn up on the
              right day and then work out for themselves where to go. Allocate the rooms on the{" "}
              <Link href={`/school/exams/${id}/halls`} className="font-bold underline">
                Halls
              </Link>{" "}
              tab before printing.
            </WarnBox>
          )}

          {!loading && cards.length === 0 && (
            <Card>
              <CardBody className="py-10 text-center text-[13px] text-ink-muted">
                No cards to print yet — either this class has no children on the roll, or the
                exam has no papers set for it.
              </CardBody>
            </Card>
          )}

          <div className="space-y-4">
            {cards.map((card) => (
              <Card key={card.student_id}>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle>{card.student_name}</CardTitle>
                    <p className="mt-1 text-[13px] text-ink-muted">
                      {card.admission_no}
                      {card.class_name && ` · ${card.class_name} ${card.section_name ?? ""}`}
                      {card.roll_no != null && ` · Roll ${card.roll_no}`}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    loading={busy === card.student_id}
                    onClick={() => downloadPdf(card)}
                  >
                    PDF
                  </Button>
                </CardHeader>
                <CardBody className="p-0">
                  <Table
                    head={["Date", "Time", "Subject", "Out of", "Room"]}
                    empty={card.sittings.length === 0 && "No papers for this child."}
                  >
                    {card.sittings.map((s) => (
                      <tr key={s.paper_id}>
                        <td className={tdStrong}>{readableDate(s.exam_date)}</td>
                        <td className={td}>
                          {s.start_time
                            ? `${hhmm(s.start_time)} – ${hhmm(s.ends_at)}`
                            : "As announced"}
                        </td>
                        <td className={td}>
                          {s.subject_name}
                          {s.subject_code && (
                            <span className="block font-mono text-[11px] text-ink-subtle">
                              {s.subject_code}
                            </span>
                          )}
                        </td>
                        <td className={td}>{s.max_marks}</td>
                        <td className={td}>
                          {s.room_name ? (
                            <>
                              {s.room_name}
                              {s.building && (
                                <span className="block text-[11px] text-ink-subtle">
                                  {s.building}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[#8E5C05] dark:text-amber-300">
                              To be announced
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Table>
                </CardBody>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
