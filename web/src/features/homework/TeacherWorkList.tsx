"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { ProjectEditDialog, deleteProject } from "@/features/teacher/ProjectEdit";
import { MilestonesDialog } from "@/features/teacher/MilestonesDialog";
import { daysUntil, shortDate, teacherState, todayIso, useEach } from "./shared";
import type { Homework, MyClasses, Progress, Project, Submission } from "./types";

type Item = {
  id: number;
  title: string;
  subject: string;
  className: string;
  classSubjectId: number;
  due: string;
  closed: boolean;
  pastDue: boolean;
  submitted: number | null;
  eligible: number | null;
  awaiting: number | null;
};

const AVATARS = ["", "mint", "lilac", "peach"];

/**
 * SCR-128 Homework List (GET /teacher/homework, per-item submissions) and
 * SCR-134 Assignment List (GET /teacher/projects, per-item progress).
 * Both are the teacher's own work, with the mock's list, tracker and figures.
 * On SCR-134 the author can also edit (PATCH /teacher/projects/{id}) and
 * delete (DELETE /teacher/projects/{id}) an assignment from the tracker.
 */
export function TeacherWorkList({ kind }: { kind: "homework" | "project" }) {
  const router = useRouter();
  const isHw = kind === "homework";
  const noun = isHw ? "homework" : "assignment";
  const classes = useApi<MyClasses>("/api/v1/teacher/my-classes");
  const [csId, setCsId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [includePast, setIncludePast] = useState(true);
  const me = useSession()?.user.id;
  const [editing, setEditing] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Project | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const homework = useApi<Homework[]>(isHw ? "/api/v1/teacher/homework" : null, { class_subject_id: csId, include_past: includePast, limit: 200 });
  const projects = useApi<Project[]>(isHw ? null : "/api/v1/teacher/projects");

  const hwIds = homework.data?.map((h) => `/api/v1/teacher/homework/${h.id}/submissions`) ?? [];
  const pjIds = projects.data?.map((p) => `/api/v1/teacher/projects/${p.id}/progress`) ?? [];
  const subs = useEach<Submission[]>(isHw ? hwIds : []);
  const progress = useEach<Progress[]>(isHw ? [] : pjIds);

  const cards = useMemo(() => classes.data?.subject_teacher_of ?? [], [classes.data]);
  const classSize = useMemo(() => new Map(cards.map((c) => [c.class_subject_id, c.total_students])), [cards]);

  const items: Item[] = useMemo(() => {
    if (isHw)
      return (homework.data ?? []).map((h) => {
        const s = subs.data[`/api/v1/teacher/homework/${h.id}/submissions`];
        return {
          id: h.id,
          title: h.title,
          subject: h.subject_name ?? "—",
          className: h.class_name ?? "—",
          classSubjectId: h.class_subject_id,
          due: h.due_date,
          closed: h.is_closed,
          pastDue: h.is_past_due,
          submitted: s ? s.length : null,
          eligible: classSize.get(h.class_subject_id) ?? null,
          awaiting: s ? s.filter((x) => x.status === "submitted").length : null,
        };
      });
    return (projects.data ?? [])
      .filter((p) => !csId || p.class_subject_id === Number(csId))
      .filter((p) => includePast || !p.is_past_due)
      .map((p) => {
        const r = progress.data[`/api/v1/teacher/projects/${p.id}/progress`];
        return {
          id: p.id,
          title: p.title,
          subject: p.subject_name ?? "—",
          className: p.class_name ?? "—",
          classSubjectId: p.class_subject_id,
          due: p.deadline,
          closed: false,
          pastDue: p.is_past_due,
          submitted: r ? r.filter((x) => x.status === "submitted" || x.status === "reviewed").length : p.progress_count,
          eligible: p.eligible_student_count,
          awaiting: r ? r.filter((x) => x.status === "submitted").length : null,
        };
      });
  }, [isHw, homework.data, projects.data, subs.data, progress.data, classSize, csId, includePast]);

  const shown = items
    .filter((i) => !search || i.title.toLowerCase().includes(search.toLowerCase()))
    .filter((i) => !status || teacherState(i.closed, i.pastDue, i.due) === status);

  const open = items.filter((i) => !i.closed && !i.pastDue);
  const week = open.filter((i) => daysUntil(i.due) <= 7);
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const counting = isHw ? subs.loading : progress.loading;
  const sum = (f: (i: Item) => number | null) => (counting ? "…" : String(items.reduce((n, i) => n + (f(i) ?? 0), 0)));
  const loading = isHw ? homework.loading : projects.loading;
  const n = (v: number) => (loading && !items.length ? "…" : String(v));

  const stats = [
    { label: "Active assignments", value: n(open.length), note: "Open, not yet due" },
    { label: "Due this week", value: n(week.length), note: `By ${shortDate(`${weekEnd.getFullYear()}-${weekEnd.getMonth() + 1}-${weekEnd.getDate()}`)}` },
    { label: "Submitted", value: sum((i) => i.submitted), note: "Across assigned classes" },
    { label: "Awaiting evaluation", value: sum((i) => i.awaiting), note: "Ready to review" },
  ];

  const detail = (id: number) => (isHw ? `${routeOf(130)}?id=${id}` : `${routeOf(136)}?id=${id}`);
  const review = (id: number) => (isHw ? `${routeOf(133)}?id=${id}` : `${routeOf(136)}?id=${id}`);
  const upcoming = [...open].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);

  const rows: Row[] = shown.map((i) => [
    i.title,
    i.subject,
    i.className,
    date(i.due),
    i.submitted === null ? "…" : `${i.submitted} / ${i.eligible ?? "—"}`,
    teacherState(i.closed, i.pastDue, i.due),
  ]);

  const error = actionError ?? classes.error ?? homework.error ?? projects.error;
  const projectOf = (id: number) => projects.data?.find((p) => p.id === id) ?? null;

  async function remove(p: Project) {
    setActionError(null);
    try {
      if (await deleteProject(p)) projects.reload();
    } catch (e) {
      setActionError(errorText(e));
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${noun} list…`} aria-label="Search records" />
        </div>
        <select aria-label="Filter by class and subject" value={csId} onChange={(e) => setCsId(e.target.value)}>
          <option value="">All classes</option>
          {cards.map((c) => (
            <option key={c.class_subject_id} value={c.class_subject_id}>
              {`${c.class_name} · ${c.subject_name}`}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option>Published</option>
          <option>Due soon</option>
          <option>Open (late)</option>
          {isHw ? <option>Closed</option> : null}
        </select>
        <select aria-label="Due dates" value={includePast ? "all" : "upcoming"} onChange={(e) => setIncludePast(e.target.value === "all")}>
          <option value="all">Include past due</option>
          <option value="upcoming">{`Due from ${date(todayIso())}`}</option>
        </select>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel
        title="Assigned work"
        sub="Open work, soonest due first"
        action={upcoming[0] ? <Link href={review(upcoming[0].id)} className="btn">View submissions</Link> : undefined}
      >
        {upcoming.length ? (
          upcoming.map((i, k) => (
            <div className="event-row" key={i.id}>
              <span className={`avatar ${AVATARS[k % 4]}`}>
                <Icon name="book" />
              </span>
              <div className="event-content">
                <h4>
                  <Link href={detail(i.id)}>{i.title}</Link>
                </h4>
                <p>{`${i.subject} · Due ${shortDate(i.due)} · ${i.className}`}</p>
              </div>
              <Badge>{teacherState(i.closed, i.pastDue, i.due)}</Badge>
            </div>
          ))
        ) : (
          <p className="muted">{loading ? "Loading…" : `No open ${noun} right now.`}</p>
        )}
      </Panel>
      <div className="gap" />
      <Panel title="Submission tracker" sub={loading ? "Loading…" : `${items.length} set by you`} flush>
        <DataTable
          columns={[isHw ? "Homework" : "Assignment", "Subject", "Class", "Due date", "Submissions", "Status"]}
          rows={rows}
          onView={isHw ? (k) => router.push(detail(shown[k].id)) : undefined}
          actions={
            isHw
              ? undefined
              : (k) => {
                  const p = projectOf(shown[k].id);
                  const mine = p !== null && p.created_by_user_id === me;
                  return (
                    <>
                      <button type="button" className="btn" onClick={() => router.push(detail(shown[k].id))}>
                        View
                      </button>
                      {mine ? (
                        <>
                          <button type="button" className="btn" onClick={() => setEditing(p)}>
                            Edit
                          </button>
                          <button type="button" className="btn" onClick={() => setMilestones(p)}>
                            Milestones
                          </button>
                          <button type="button" className="btn" onClick={() => remove(p)}>
                            Delete
                          </button>
                        </>
                      ) : null}
                    </>
                  );
                }
          }
          empty={loading ? "Loading…" : cards.length === 0 ? "You aren't assigned as a subject teacher anywhere yet." : search || status || csId ? "Nothing matches these filters." : `No ${noun} set yet.`}
        />
      </Panel>
      {milestones ? <MilestonesDialog project={milestones} onClose={() => setMilestones(null)} /> : null}
      {editing ? (
        <ProjectEditDialog
          project={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            projects.reload();
          }}
        />
      ) : null}
    </>
  );
}
