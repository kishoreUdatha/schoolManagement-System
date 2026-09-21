"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { SchoolClass } from "@/features/students/types";
import { clock, downloadFile, ExamSelects, useExamChoice, useSetParam } from "./common";
import type { AdmitCard } from "./types";

/**
 * SCR-144, live: GET /school/exam-ops/{id}/admit-cards?class_id=, one
 * student's card from GET …/admit-cards/{student_id} (?student=, so another
 * screen can link straight to it), and the per-student PDF at
 * …/admit-cards/{student_id}/pdf, opened or downloaded.
 */
export function AdmitCards() {
  const c = useExamChoice();
  const setParam = useSetParam();
  const studentParam = useSearchParams().get("student");
  const studentId = studentParam ? Number(studentParam) : null;
  const classes = useApi<SchoolClass[]>(c.exam ? "/api/v1/school/classes" : null, { academic_year_id: c.exam?.academic_year_id });
  const [classId, setClassId] = useState<number | null>(null);
  const [busy, setBusy] = useState<"open" | "download" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (classes.data?.length && (classId === null || !classes.data.some((x) => x.id === classId))) setClassId(classes.data[0].id);
  }, [classes.data, classId]);

  const cards = useApi<AdmitCard[]>(c.examId && classId ? `/api/v1/school/exam-ops/${c.examId}/admit-cards` : null, { class_id: classId });
  const list = cards.data ?? [];
  // A student named in the URL may sit in another class than the one shown.
  const inList = list.find((x) => x.student_id === studentId);
  const one = useApi<AdmitCard>(c.examId && studentId && cards.data && !inList ? `/api/v1/school/exam-ops/${c.examId}/admit-cards/${studentId}` : null);
  const single = one.data && one.data.student_id === studentId && one.data.exam_id === c.examId ? one.data : null;
  const card = inList ?? single ?? list[0] ?? null;
  const options = single && !inList ? [single, ...list] : list;

  async function pdf(kind: "open" | "download") {
    if (!card) return;
    const path = `/api/v1/school/exam-ops/${card.exam_id}/admit-cards/${card.student_id}/pdf`;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "open") await api.open(path);
      else await downloadFile(path, `admit-card-${card.admission_no}.pdf`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
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
        <select
          aria-label="Class"
          value={classId ?? ""}
          onChange={(e) => {
            setClassId(Number(e.target.value));
            setParam({ student: null });
          }}
        >
          {classes.data?.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        <select aria-label="Student" value={card?.student_id ?? ""} onChange={(e) => setParam({ student: e.target.value })} disabled={!options.length}>
          {!options.length ? <option value="">{cards.loading ? "Loading…" : "No candidates"}</option> : null}
          {options.map((x) => (
            <option key={x.student_id} value={x.student_id}>
              {`${x.student_name} · ${x.admission_no}${x === single ? ` · ${x.class_name ?? ""}` : ""}`}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => window.print()} disabled={!card}>
          <Icon name="download" className="sm" />
          Print
        </button>
        <button type="button" className="btn" onClick={() => pdf("open")} disabled={!card || busy !== null}>
          <Icon name="file" className="sm" />
          {busy === "open" ? "Preparing…" : "Open PDF"}
        </button>
        <button type="button" className="btn primary" onClick={() => pdf("download")} disabled={!card || busy !== null}>
          <Icon name="download" className="sm" />
          {busy === "download" ? "Preparing…" : "Download PDF"}
        </button>
      </div>
      <ErrorNote>{error ?? c.error ?? classes.error ?? cards.error ?? one.error}</ErrorNote>
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
