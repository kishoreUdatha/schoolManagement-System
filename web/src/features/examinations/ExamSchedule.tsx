"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { date } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { clock, ExamSelects, useExamChoice } from "./common";
import type { Datesheet, DatesheetPaper } from "./types";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const TONES = ["", "mint", "peach"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** SCR-141, live: GET /school/exam-ops/{id}/datesheet, drawn as the mock's month calendar. */
export function ExamSchedule() {
  const c = useExamChoice();
  const sheet = useApi<Datesheet>(c.examId ? `/api/v1/school/exam-ops/${c.examId}/datesheet` : null);
  const [cls, setCls] = useState("");
  const [month, setMonth] = useState<{ y: number; m: number } | null>(null);

  // Open on the month the exam starts.
  useEffect(() => {
    if (sheet.data) {
      const [y, m] = sheet.data.start_date.split("-").map(Number);
      setMonth({ y, m: m - 1 });
    }
  }, [sheet.data]);

  const all = useMemo(() => (sheet.data?.days ?? []).flatMap((d) => d.papers), [sheet.data]);
  const classes = useMemo(() => Array.from(new Set(all.map((p) => p.class_name ?? "—"))).sort(), [all]);
  const byDay = useMemo(() => {
    const m = new Map<string, DatesheetPaper[]>();
    all.filter((p) => !cls || (p.class_name ?? "—") === cls).forEach((p) => m.set(p.exam_date, [...(m.get(p.exam_date) ?? []), p]));
    return m;
  }, [all, cls]);

  const now = new Date();
  const view = month ?? { y: now.getFullYear(), m: now.getMonth() };
  const first = new Date(view.y, view.m, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // back to Monday
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const weeks = cells[35].getMonth() !== view.m ? 35 : 42;
  const today = iso(now);
  const shift = (k: number) => setMonth({ y: view.m + k < 0 ? view.y - 1 : view.m + k > 11 ? view.y + 1 : view.y, m: (view.m + k + 12) % 12 });

  const clashes = sheet.data?.clashes ?? [];
  // The whole datesheet of the chosen exam, before the class filter.
  const n = (v: number) => (!c.examId ? "—" : !sheet.data || sheet.loading ? "…" : String(v));
  const stats = [
    { label: "Papers", value: n(all.length), note: `${classes.length} classes` },
    { label: "Exam days", value: n(sheet.data?.days.filter((d) => d.papers.length).length ?? 0), note: sheet.data ? `${date(sheet.data.start_date)} – ${date(sheet.data.end_date)}` : "choose an exam" },
    { label: "Still to come", value: n(all.filter((p) => p.exam_date >= today).length), note: "papers from today" },
    { label: "Clashes", value: n(clashes.length), note: `${sheet.data?.papers_without_time ?? 0} papers without a time` },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <ExamSelects c={c} />
        <select aria-label="Filter class" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => shift(-1)} aria-label="Previous month">
          ‹
        </button>
        <button type="button" className="btn" onClick={() => shift(1)} aria-label="Next month">
          ›
        </button>
        <Link href={`${routeOf(140)}${c.examId ? `?id=${c.examId}` : ""}`} className="btn primary">
          <Icon name="plus" className="sm" />
          Add exam slot
        </Link>
      </div>
      <ErrorNote>{c.error ?? sheet.error}</ErrorNote>
      {clashes.length ? (
        <div className="tip warn" style={{ marginBottom: 16 }}>
          <Icon name="bell" className="sm" />
          <span>{`Clash: ${clashes.map((x) => `${x.class_name ?? "A class"} has ${x.papers.length} papers on ${x.exam_date}`).join("; ")}.`}</span>
        </div>
      ) : null}
      {sheet.data?.papers_without_time ? (
        <div className="tip" style={{ marginBottom: 16 }}>
          <Icon name="clock" className="sm" />
          <span>{`${sheet.data.papers_without_time} paper${sheet.data.papers_without_time === 1 ? " has" : "s have"} no start time yet, so clashes within a day cannot be checked for them.`}</span>
        </div>
      ) : null}
      <Panel
        title={`${MONTHS[view.m]} ${view.y}`}
        sub={sheet.data ? `${sheet.data.exam_name} · ${all.length} paper${all.length === 1 ? "" : "s"}${sheet.loading ? " · Loading…" : ""}` : sheet.loading ? "Loading…" : "Choose an exam"}
        action={
          <button type="button" className="btn" onClick={() => setMonth({ y: now.getFullYear(), m: now.getMonth() })}>
            Today
          </button>
        }
        flush
      >
        <div className="table-wrap">
          <div className="calendar-grid">
            {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
              <div className="day-head" key={d}>
                {d}
              </div>
            ))}
            {cells.slice(0, weeks).map((d) => {
              const key = iso(d);
              const outside = d.getMonth() !== view.m;
              return (
                <div key={key} className={`calendar-day ${outside ? "outside" : ""} ${key === today ? "today" : ""}`}>
                  <strong>{d.getDate()}</strong>
                  {outside
                    ? null
                    : (byDay.get(key) ?? []).map((p, i) => (
                        <span key={p.paper_id} className={`cal-event ${TONES[i % 3]}`}>
                          {`${p.subject_name}${p.class_name ? ` · ${p.class_name}` : ""}`}
                          <br />
                          {p.start_time ? clock(p.start_time) : "Time not set"}
                        </span>
                      ))}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
    </>
  );
}
