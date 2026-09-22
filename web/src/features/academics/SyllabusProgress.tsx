"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { ClassSubject } from "./planTypes";

type Year = { id: number; name: string; is_current: boolean };

/** SCR-105, live: GET /api/v1/school/syllabus (per-section covered / total topics and behind-plan count). */
export function SyllabusProgress() {
  const years = useApi<Year[]>("/api/v1/school/academic-years");
  const [yearId, setYearId] = useState("");
  const list = useApi<ClassSubject[]>("/api/v1/school/syllabus", { academic_year_id: yearId });
  const [classId, setClassId] = useState("");
  const [section, setSection] = useState("");
  const [state, setState] = useState("");

  const all = useMemo(() => list.data ?? [], [list.data]);
  const classes = useMemo(() => {
    const m = new Map<number, string>();
    all.forEach((c) => m.set(c.class_id, c.class_name));
    return Array.from(m.entries());
  }, [all]);
  const sections = useMemo(
    () => Array.from(new Set(all.filter((c) => !classId || String(c.class_id) === classId).flatMap((c) => c.sections.map((s) => s.section_label)))).sort(),
    [all, classId],
  );

  const rows = all
    .filter((c) => !classId || String(c.class_id) === classId)
    .flatMap((c) => c.sections.map((s) => ({ c, s })))
    .filter(({ s }) => (!section || s.section_label === section) && (!state || (state === "behind" ? s.behind > 0 : state === "none" ? s.total === 0 : s.total > 0 && s.behind === 0)));

  const covered = rows.reduce((n, r) => n + r.s.covered, 0);
  const total = rows.reduce((n, r) => n + r.s.total, 0);
  const overall = total ? (covered / total) * 100 : 0;
  const behind = rows.filter((r) => r.s.behind > 0).sort((a, b) => b.s.behind - a.s.behind).slice(0, 5);
  const year = years.data?.find((y) => String(y.id) === yearId) ?? years.data?.find((y) => y.is_current);

  // The strip counts the whole year, whatever the filters below show.
  const every = all.flatMap((c) => c.sections);
  const done = every.reduce((n, s) => n + s.covered, 0);
  const planned = every.reduce((n, s) => n + s.total, 0);
  const n = (v: string | number) => (list.loading && !list.data ? (list.loading ? "…" : "—") : String(v));
  const stats = [
    { label: "Covered", value: n(planned ? `${((done / planned) * 100).toFixed(1)}%` : "0%"), note: `${done} of ${planned} topics` },
    { label: "Subject sections", value: n(every.length), note: `${all.length} class subjects` },
    { label: "Behind plan", value: n(every.filter((s) => s.behind > 0).length), note: "sections past planned dates" },
    { label: "No syllabus", value: n(every.filter((s) => s.total === 0).length), note: "sections without topics" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <select aria-label="Filter by class" value={classId} onChange={(e) => { setClassId(e.target.value); setSection(""); }}>
          <option value="">All classes</option>
          {classes.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by section" value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">All sections</option>
          {sections.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select aria-label="Filter by progress" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="">All statuses</option>
          <option value="behind">Behind plan</option>
          <option value="ontrack">On track</option>
          <option value="none">No syllabus yet</option>
        </select>
        <select aria-label="Academic year" value={yearId} onChange={(e) => setYearId(e.target.value)}>
          <option value="">Current academic year</option>
          {years.data?.map((y) => (
            <option key={y.id} value={y.id}>
              {`${y.name}${y.is_current ? " (current)" : ""}`}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <div className="two-col">
        <div>
          <Panel title="Syllabus completion" sub={`${section || "Every section"} · ${year?.name ?? "Current academic year"}${list.loading ? " · Loading…" : ""}`}>
            {rows.length === 0 ? <p className="muted">{list.loading ? "Loading…" : "No subjects match these filters."}</p> : null}
            {rows.map(({ c, s }) => {
              const p = s.total ? (s.covered / s.total) * 100 : 0;
              return (
                <div className="usage-row" key={`${c.class_subject_id}-${s.section_id}`}>
                  <div className="spread">
                    <strong>
                      <Link href={`${routeOf(99)}?id=${c.class_subject_id}`}>{c.subject_name}</Link>
                    </strong>
                    <span>{s.total ? `${s.covered} / ${s.total} topics` : "No topics yet"}</span>
                  </div>
                  <div className="bar-track">
                    <i style={{ width: `${p.toFixed(1)}%` }} />
                  </div>
                  <p>{`${c.teacher_name ?? "No teacher assigned"} · ${s.section_label} · ${s.behind ? `${s.behind} topic${s.behind > 1 ? "s" : ""} behind plan` : s.total ? "On track" : "Syllabus not set up"}`}</p>
                </div>
              );
            })}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Overall progress">
            <div className="donut" style={{ background: `conic-gradient(var(--blue) 0 ${overall}%, #e9eff9 ${overall}% 100%)` }}>
              <div>
                {`${overall.toFixed(1)}%`}
                <small>{`${covered} / ${total} topics`}</small>
              </div>
            </div>
          </Panel>
          <Panel title="Behind plan" sub="Topics past their planned dates and not yet taught">
            {behind.length ? (
              behind.map(({ c, s }) => (
                <div className="timeline-item" key={`${c.class_subject_id}-${s.section_id}`}>
                  <span className="timeline-dot">
                    <Icon name="clock" />
                  </span>
                  <div>
                    <h4>{`${c.subject_name} · ${s.section_label}`}</h4>
                    <p>{`${c.teacher_name ?? "No teacher"} · ${s.behind} topic${s.behind > 1 ? "s" : ""} behind`}</p>
                  </div>
                  <time>{`${s.percent}%`}</time>
                </div>
              ))
            ) : (
              <p className="muted">Every section is on plan.</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
