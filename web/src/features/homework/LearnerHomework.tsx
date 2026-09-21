"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { ChildPicker, daysUntil, learnerState, shortDate, useEach, useLearner } from "./shared";
import type { Homework, Submission } from "./types";

const AVATARS = ["", "mint", "lilac", "peach"];
const STATES = ["Assigned", "Due soon", "Submitted", "Returned", "Marked", "Overdue", "Closed"];

/** The learner's homework and what they handed in for each (null when nothing yet). */
export function useLearnerHomework() {
  const learner = useLearner();
  const list = useApi<Homework[]>(learner.base);
  const paths = learner.base ? (list.data ?? []).map((h) => `${learner.base}/${h.id}/submission`) : [];
  const subs = useEach<Submission | null>(paths);
  const subOf = (h: Homework) => subs.data[`${learner.base}/${h.id}/submission`];
  return { learner, list, subs, subOf };
}

/**
 * SCR-131, live: a student's own homework (GET /student/homework and each
 * …/{id}/submission), or, for a parent, one child's (GET
 * /parent/me/children/{id}/homework, same shapes).
 */
export function LearnerHomework() {
  const router = useRouter();
  const { learner, list, subs, subOf } = useLearnerHomework();
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState("");

  const items = useMemo(() => [...(list.data ?? [])].sort((a, b) => a.due_date.localeCompare(b.due_date)), [list.data]);
  const subjects = Array.from(new Set(items.map((h) => h.subject_name).filter(Boolean))) as string[];

  if (learner.wrongRole)
    return <ErrorNote>This screen shows a student&apos;s own homework. Sign in as a student or a parent to see it.</ErrorNote>;

  const shown = items
    .filter((h) => !search || h.title.toLowerCase().includes(search.toLowerCase()))
    .filter((h) => !subject || h.subject_name === subject)
    .filter((h) => !status || learnerState(h, subOf(h)) === status);

  const todo = items.filter((h) => !h.is_past_due && !h.is_closed);
  const week = todo.filter((h) => daysUntil(h.due_date) <= 7);
  const handed = items.filter((h) => subOf(h));
  const waiting = handed.filter((h) => subOf(h)?.status === "submitted");
  const n = (v: number, wait = false) => ((list.loading && !list.data) || (wait && subs.loading) ? "…" : String(v));
  const q = learner.childQuery;

  const stats = [
    { label: "Active assignments", value: n(todo.length), note: "Still open" },
    { label: "Due this week", value: n(week.length), note: week[0] ? `Next due ${shortDate(week[0].due_date)}` : "Nothing due this week" },
    { label: "Submitted", value: n(handed.length, true), note: "Handed in so far" },
    { label: "Awaiting evaluation", value: n(waiting.length, true), note: "With the teacher" },
  ];

  const rows: Row[] = shown.map((h) => {
    const s = subOf(h);
    return [
      h.title,
      h.subject_name ?? "—",
      h.created_by_name ?? "—",
      date(h.due_date),
      s?.marking?.total != null ? `${s.marking.total} / ${s.marking.max_total}` : s ? date(s.submitted_at) : "—",
      learnerState(h, s),
    ];
  });

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search homework…" aria-label="Search records" />
        </div>
        <ChildPicker learner={learner} />
        <select aria-label="Filter by subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <ErrorNote>{learner.error ?? list.error}</ErrorNote>
      <Panel
        title="Assigned work"
        sub={learner.who ? `${learner.who.name} · soonest due first` : "Soonest due first"}
        action={handed.length ? <Link href={`${routeOf(136)}?${q.slice(1)}`} className="btn">View submissions</Link> : undefined}
      >
        {todo.length ? (
          todo.slice(0, 5).map((h, k) => (
            <div className="event-row" key={h.id}>
              <span className={`avatar ${AVATARS[k % 4]}`}>
                <Icon name="book" />
              </span>
              <div className="event-content">
                <h4>
                  <Link href={`${routeOf(132)}?id=${h.id}${q}`}>{h.title}</Link>
                </h4>
                <p>{`${h.subject_name ?? "—"} · Due ${shortDate(h.due_date)} · ${h.class_name ?? ""}`}</p>
              </div>
              <Badge>{learnerState(h, subOf(h))}</Badge>
            </div>
          ))
        ) : (
          <p className="muted">{list.loading || !learner.hydrated ? "Loading…" : "Nothing to hand in right now."}</p>
        )}
      </Panel>
      <div className="gap" />
      <Panel title="Submission tracker" sub="Everything set this year" flush>
        <DataTable
          columns={["Homework", "Subject", "Teacher", "Due date", "Submission", "Status"]}
          rows={rows}
          onView={(k) => router.push(`${routeOf(132)}?id=${shown[k].id}${q}`)}
          empty={list.loading ? "Loading…" : items.length ? "Nothing matches these filters." : "Nothing has been set yet."}
        />
      </Panel>
    </>
  );
}
