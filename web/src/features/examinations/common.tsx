"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { session } from "@/lib/session";
import { date } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { AcademicYear } from "@/features/students/types";
import type { Exam, Paper } from "./types";

/*
 * What every exam screen shares: which exam (?id=) and which paper (?paper=)
 * is open, chosen from the filter bar and carried in the URL so a screen can
 * hand the same exam to the next one.
 */

/** Put `key=value` into the URL without a reload. */
export function useSetParam() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  return (changes: Record<string, string | number | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === "") q.delete(k);
      else q.set(k, String(v));
    }
    const qs = q.toString();
    router.replace(qs ? `${path}?${qs}` : path, { scroll: false });
  };
}

/**
 * The exam this screen is about. ?id= wins; otherwise the latest exam of the
 * current academic year. `exam` is the full record, papers included.
 */
export function useExamChoice() {
  const params = useSearchParams();
  const setParam = useSetParam();
  const idParam = params.get("id");
  const yearParam = params.get("year");

  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const currentYear = years.data?.find((y) => y.is_current) ?? years.data?.[0];
  // An exam named in the URL is fetched straight away and brings its own year.
  const named = useApi<Exam>(idParam ? `/api/v1/school/exams/${idParam}` : null);
  const namedYear = idParam && named.data?.id === Number(idParam) ? named.data.academic_year_id : null;
  const yearId = yearParam ? Number(yearParam) : idParam && !named.error ? namedYear : (currentYear?.id ?? null);
  const exams = useApi<Exam[]>(yearId ? "/api/v1/school/exams" : null, { academic_year_id: yearId });

  const fallback = useMemo(() => {
    const list = exams.data ?? [];
    return [...list].sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
  }, [exams.data]);
  const examId = idParam ? Number(idParam) : (fallback?.id ?? null);
  const fetched = useApi<Exam>(!idParam && examId ? `/api/v1/school/exams/${examId}` : null);
  const exam = idParam ? named : fetched;

  return {
    years: years.data ?? [],
    yearId,
    setYear: (id: number) => setParam({ year: id, id: null, paper: null }),
    exams: exams.data ?? [],
    examsLoading: years.loading || exams.loading,
    examId,
    setExam: (id: number) => setParam({ id, paper: null }),
    exam: exam.data && exam.data.id === examId ? exam.data : null,
    reloadExam: exam.reload,
    reloadExams: exams.reload,
    error: years.error ?? exams.error ?? exam.error,
  };
}

export type ExamChoice = ReturnType<typeof useExamChoice>;

/** Year and exam selects for the filter bar. */
export function ExamSelects({ c, withYear = true }: { c: ExamChoice; withYear?: boolean }) {
  return (
    <>
      <select aria-label="Exam" value={c.examId ?? ""} onChange={(e) => c.setExam(Number(e.target.value))} disabled={!c.exams.length}>
        {!c.exams.length ? <option value="">{c.examsLoading ? "Loading exams…" : "No exams this year"}</option> : null}
        {c.exams.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>
      {withYear ? (
        <select aria-label="Academic year" value={c.yearId ?? ""} onChange={(e) => c.setYear(Number(e.target.value))}>
          {c.years.map((y) => (
            <option key={y.id} value={y.id}>
              {`${y.name}${y.is_current ? " (current)" : ""}`}
            </option>
          ))}
        </select>
      ) : null}
    </>
  );
}

export const paperLabel = (p: { subject_name: string | null; class_name: string | null; exam_date: string }) =>
  `${p.subject_name ?? "Paper"}${p.class_name ? ` · ${p.class_name}` : ""} · ${date(p.exam_date)}`;

/** The paper this screen is about: ?paper=, else the exam's first. */
export function usePaperChoice(exam: Exam | null) {
  const params = useSearchParams();
  const setParam = useSetParam();
  const wanted = Number(params.get("paper"));
  const papers: Paper[] = exam?.papers ?? [];
  const paper = papers.find((p) => p.id === wanted) ?? papers[0] ?? null;
  return { papers, paper, setPaper: (id: number) => setParam({ paper: id }) };
}

export function PaperSelect({ papers, paper, setPaper }: ReturnType<typeof usePaperChoice>) {
  return (
    <select aria-label="Paper" value={paper?.id ?? ""} onChange={(e) => setPaper(Number(e.target.value))} disabled={!papers.length}>
      {!papers.length ? <option value="">No papers in this exam</option> : null}
      {papers.map((p) => (
        <option key={p.id} value={p.id}>
          {paperLabel(p)}
        </option>
      ))}
    </select>
  );
}

/** "09:30:00" -> "09:30 AM". */
export function clock(t: string | null | undefined): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${String(((h + 11) % 12) + 1).padStart(2, "0")}:${String(m || 0).padStart(2, "0")} ${ampm}`;
}

/*
 * Files. `api` reads JSON, so PDFs, CSVs and uploads go through fetch here
 * with the same bearer token. (A shared helper in src/lib would be better;
 * see the report.)
 */
async function authed(path: string, init: RequestInit = {}): Promise<Response> {
  const token = session.get()?.access;
  const res = await fetch(path, { ...init, headers: { ...(init.headers ?? {}), ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  if (!res.ok) {
    let msg = `The server could not complete that (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") msg = body.detail;
    } catch {
      /* not JSON */
    }
    if (res.status === 401) msg = "Your session has expired. Sign in again.";
    if (res.status === 403) msg = "You do not have access to this.";
    throw new Error(msg);
  }
  return res;
}

/** Download an authenticated file (PDF, CSV) under `filename`. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const blob = await (await authed(path)).blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** POST a multipart form and read the JSON answer. */
export async function uploadForm<T>(path: string, form: FormData): Promise<T> {
  return (await (await authed(path, { method: "POST", body: form })).json()) as T;
}
