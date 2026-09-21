"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { SchoolClass } from "@/features/students/types";
import { clock, downloadFile, ExamSelects, useExamChoice } from "./common";
import type { AdmitCard } from "./types";

/**
 * SCR-144, live: GET /school/exam-ops/{id}/admit-cards?class_id= and the
 * per-student PDF at …/admit-cards/{student_id}/pdf.
 */
export function AdmitCards() {
  const c = useExamChoice();
  const classes = useApi<SchoolClass[]>(c.exam ? "/api/v1/school/classes" : null, { academic_year_id: c.exam?.academic_year_id });
  const [classId, setClassId] = useState<number | null>(null);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (classes.data?.length && (classId === null || !classes.data.some((x) => x.id === classId))) setClassId(classes.data[0].id);
  }, [classes.data, classId]);

  const cards = useApi<AdmitCard[]>(c.examId && classId ? `/api/v1/school/exam-ops/${c.examId}/admit-cards` : null, { class_id: classId });
  const list = cards.data ?? [];
  const card = list.find((x) => x.student_id === studentId) ?? list[0] ?? null;

  async function pdf() {
    if (!card) return;
    setBusy(true);
    setError(null);
    try {
      await downloadFile(`/api/v1/school/exam-ops/${card.exam_id}/admit-cards/${card.student_id}/pdf`, `admit-card-${card.admission_no}.pdf`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const rows: Row[] = (card?.sittings ?? []).map((s) => [
    s.subject_name,
    date(s.exam_date),
    s.start_time ? `${clock(s.start_time)}${s.ends_at ? `–${clock(s.ends_at)}` : ""}` : "Time not set",
    s.room_name ? `${s.room_name}${s.building ? ` · ${s.building}` : ""}` : "Not allocated",
  ]);

  return (
    <>
      <div className="filterbar">
        <ExamSelects c={c} />
        <select aria-label="Class" value={classId ?? ""} onChange={(e) => setClassId(Number(e.target.value))}>
          {classes.data?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select aria-label="Student" value={card?.student_id ?? ""} onChange={(e) => setStudentId(Number(e.target.value))} disabled={!list.length}>
          {!list.length ? <option value="">{cards.loading ? "Loading…" : "No candidates"}</option> : null}
          {list.map((x) => (
            <option key={x.student_id} value={x.student_id}>
              {`${x.student_name} · ${x.admission_no}`}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => window.print()} disabled={!card}>
          <Icon name="download" className="sm" />
          Print
        </button>
        <button type="button" className="btn primary" onClick={pdf} disabled={!card || busy}>
          <Icon name="download" className="sm" />
          {busy ? "Preparing…" : "Download PDF"}
        </button>
      </div>
      <ErrorNote>{error ?? c.error ?? classes.error ?? cards.error}</ErrorNote>
      {card && card.rooms_allocated < card.sittings.length ? (
        <div className="tip warn" style={{ marginBottom: 16 }}>
          <Icon name="bell" className="sm" />
          <span>{`${card.sittings.length - card.rooms_allocated} of ${card.sittings.length} papers have no room yet for this student. Allocate rooms before issuing.`}</span>
        </div>
      ) : null}
      {card ? (
        <article className="invoice">
          <div className="spread">
            <Link href="/screens" className="brand">
              <span className="brand-mark">
                <Icon name="book" />
              </span>
              <span>
                BrightCampus
                <small>SCHOOL ERP</small>
              </span>
            </Link>
            <h2>Admit Card</h2>
          </div>
          <div className="gap" />
          <dl className="kv">
            <div>
              <dt>Student</dt>
              <dd>{card.student_name}</dd>
            </div>
            <div>
              <dt>Admission no.</dt>
              <dd>{card.admission_no}</dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>{`${card.class_name ?? "—"}${card.section_name ? ` ${card.section_name}` : ""}`}</dd>
            </div>
            <div>
              <dt>Exam</dt>
              <dd>{card.exam_name}</dd>
            </div>
            <div>
              <dt>Roll no.</dt>
              <dd>{card.roll_no ? String(card.roll_no).padStart(2, "0") : "—"}</dd>
            </div>
            <div>
              <dt>Exam centre</dt>
              <dd>{card.school_name}</dd>
            </div>
          </dl>
          <div className="gap" />
          <DataTable columns={["Subject", "Date", "Time", "Room"]} rows={rows} selectable={false} rowAction={false} empty="No papers for this student in this exam." />
          <div className="gap" />
          <div className="tip">
            <Icon name="shield" className="sm" />
            <span>Bring this admit card and school identity card to each examination.</span>
          </div>
        </article>
      ) : (
        <section className="panel">
          <div className="panel-pad muted">{cards.loading || c.examsLoading ? "Loading admit cards…" : "No candidates sit this exam in the chosen class."}</div>
        </section>
      )}
    </>
  );
}
