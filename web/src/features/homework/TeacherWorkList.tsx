"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatCards } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { ask } from "@/lib/dialog";
import { notify } from "@/lib/notify";
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
  what: string;
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
  const [subject, setSubject] = useState("");
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
          what: h.description,
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
          what: p.description ?? "",
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

  /**
   * Where a piece of work stands, in the words of the screen: work waiting to
   * be marked says so before anything else, because that is the teacher's job
   * on this page.
   */
  function state(i: Item): string {
    if (i.closed) return "Completed";
    if (i.awaiting) return "Review pending";
    if (i.pastDue) return "Overdue";
    return daysUntil(i.due) <= 3 ? "Due soon" : "Active";
  }

  const subjects = useMemo(() => [...new Set(items.map((i) => i.subject))].filter((x) => x !== "—").sort(), [items]);
  const shown = items
    .filter((i) => !search || i.title.toLowerCase().includes(search.toLowerCase()))
    .filter((i) => !subject || i.subject === subject)
    .filter((i) => !status || state(i) === status)
    // soonest due first, so the work that needs a teacher is at the top
    .sort((a, b) => a.due.localeCompare(b.due));

  const open = items.filter((i) => !i.closed && !i.pastDue);
  const week = open.filter((i) => daysUntil(i.due) <= 7);
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const counting = isHw ? subs.loading : progress.loading;
  const sum = (f: (i: Item) => number | null) => (counting ? "…" : String(items.reduce((n, i) => n + (f(i) ?? 0), 0)));
  const loading = isHw ? homework.loading : projects.loading;
  const n = (v: number) => (loading && !items.length ? "…" : String(v));

  // Each card filters the list it counts; pressing the one already chosen clears it.
  const pick = (want: string) => () => setStatus((cur) => (cur === want ? "" : want));
  const stats = [
    { label: `Active ${noun}`, value: n(open.length), note: "Currently open", icon: "book" as const, onClick: pick("Active"), active: status === "Active" },
    { label: "Due this week", value: n(week.length), note: `By ${shortDate(`${weekEnd.getFullYear()}-${weekEnd.getMonth() + 1}-${weekEnd.getDate()}`)}`, icon: "calendar" as const, onClick: pick("Due soon"), active: status === "Due soon" },
    { label: "Submitted", value: sum((i) => i.submitted), note: `Across all ${noun}`, icon: "check" as const },
    { label: "Awaiting evaluation", value: sum((i) => i.awaiting), note: "Ready to review", icon: "clock" as const, onClick: pick("Review pending"), active: status === "Review pending" },
  ];

  const detail = (id: number) => (isHw ? `${routeOf(130)}?id=${id}` : `${routeOf(136)}?id=${id}`);
  const review = (id: number) => (isHw ? `${routeOf(133)}?id=${id}` : `${routeOf(136)}?id=${id}`);
  const upcoming = [...open].sort((a, b) => a.due.localeCompare(b.due)).slice(0, 5);

  /** "Due in 3 days", "Due tomorrow", "Overdue by 2 days" — what a teacher actually reads for. */
  function when(i: Item): { note: string; tone?: "warn" | "bad" } {
    if (i.closed) return { note: "Closed" };
    const days = daysUntil(i.due);
    if (days < 0) return { note: `Overdue by ${-days} day${days === -1 ? "" : "s"}`, tone: "bad" };
    if (days === 0) return { note: "Due today", tone: "warn" };
    if (days === 1) return { note: "Due tomorrow", tone: "warn" };
    return { note: `Due in ${days} days`, tone: days <= 3 ? "warn" : undefined };
  }

  /** Everything a row can do, behind one "…" — the row stays a row. */
  function RowMenu({ label, items }: { label: string; items: { text: string; bad?: boolean; go: () => void }[] }) {
    const [at, setAt] = useState<{ top: number; right: number } | null>(null);
    // An open menu closes on the next click anywhere else, or on Escape —
    // otherwise it sits over the row below and swallows the click meant for it.
    useEffect(() => {
      if (!at) return;
      const shut = (e: Event) => {
        if (e instanceof KeyboardEvent && e.key !== "Escape") return;
        setAt(null);
      };
      const t = setTimeout(() => {
        document.addEventListener("click", shut);
        document.addEventListener("keydown", shut);
      });
      return () => {
        clearTimeout(t);
        document.removeEventListener("click", shut);
        document.removeEventListener("keydown", shut);
      };
    }, [at]);
    if (!items.length) return null;
    return (
      <span className="row-menu">
        <button
          type="button"
          className="btn icon"
          aria-label={`More for ${label}`}
          onClick={(e) => {
            if (at) {
              setAt(null);
              return;
            }
            const b = e.currentTarget.getBoundingClientRect();
            setAt({ top: b.bottom + 4, right: window.innerWidth - b.right });
          }}
        >
          …
        </button>
        {at ? (
          <span className="row-menu-list" style={{ top: at.top, right: at.right }} onMouseLeave={() => setAt(null)}>
            {items.map((x) => (
              <button
                key={x.text}
                type="button"
                className={x.bad ? "bad" : ""}
                onClick={() => {
                  setAt(null);
                  x.go();
                }}
              >
                {x.text}
              </button>
            ))}
          </span>
        ) : null}
      </span>
    );
  }

  async function closeWork(i: Item, close: boolean) {
    setActionError(null);
    try {
      await api.patch(`/api/v1/teacher/homework/${i.id}`, { is_closed: close });
      notify(close ? "Closed for submissions." : "Open for submissions again.");
      homework.reload();
    } catch (e) {
      setActionError(errorText(e));
    }
  }

  async function removeWork(i: Item) {
    if (!(await ask(`Delete "${i.title}"? Anything handed in goes with it.`))) return;
    setActionError(null);
    try {
      await api.delete(`/api/v1/teacher/homework/${i.id}`);
      notify("Homework deleted.");
      homework.reload();
    } catch (e) {
      setActionError(errorText(e));
    }
  }

  const rows: Row[] = shown.map((i) => {
    const w = when(i);
    const handed = i.submitted ?? 0;
    const of = i.eligible ?? 0;
    return [
      // the name alone; what the class was asked to do is on the brief
      { name: i.title },
      i.subject,
      i.className,
      { text: date(i.due), note: w.note, tone: w.tone },
      i.submitted === null
        ? "…"
        : { text: `${handed} / ${of || "—"}`, percent: of ? (handed / of) * 100 : 0, note: i.awaiting ? `${i.awaiting} to mark` : undefined },
      state(i),
    ];
  });

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
      <StatCards items={stats} />
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
        <select aria-label="Filter by subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option>Active</option>
          <option>Due soon</option>
          <option>Review pending</option>
          <option>Overdue</option>
          <option>Completed</option>
        </select>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <section className="panel">
        <DataTable
          columns={[isHw ? "Homework" : "Assignment", "Subject", "Class", "Due date", "Submissions", "Status"]}
          rows={rows}
          actions={
            isHw
              ? (k) => {
                  const i = shown[k];
                  // Everything behind the dots, the marking first: work handed
                  // in belongs on the marking screen, the rest on the brief.
                  return (
                    <RowMenu
                      label={i.title}
                      items={[
                        ...(i.submitted
                          ? [{ text: i.awaiting ? `Evaluate ${i.awaiting}` : "View submissions", go: () => router.push(review(i.id)) }]
                          : []),
                        { text: "Homework brief", go: () => router.push(detail(i.id)) },
                        ...(homework.data?.find((h) => h.id === i.id)?.can_edit
                          ? [
                              { text: "Edit homework", go: () => router.push(`${routeOf(129)}?id=${i.id}`) },
                              { text: i.closed ? "Reopen for submissions" : "Close for submissions", go: () => closeWork(i, !i.closed) },
                              { text: "Delete", bad: true, go: () => removeWork(i) },
                            ]
                          : []),
                      ]}
                    />
                  );
                }
              : (k) => {
                  const i = shown[k];
                  const pr = projectOf(i.id);
                  const mine = pr !== null && pr.created_by_user_id === me;
                  return (
                    <RowMenu
                      label={i.title}
                      items={[
                        { text: i.awaiting ? `Evaluate ${i.awaiting}` : "View submissions", go: () => router.push(detail(i.id)) },
                        ...(mine && pr
                          ? [
                              { text: "Edit assignment", go: () => setEditing(pr) },
                              { text: "Milestones", go: () => setMilestones(pr) },
                              { text: "Delete", bad: true, go: () => remove(pr) },
                            ]
                          : []),
                      ]}
                    />
                  );
                }
          }
          empty={loading ? "Loading…" : cards.length === 0 ? "You aren't assigned as a subject teacher anywhere yet." : search || status || csId ? "Nothing matches these filters." : undefined}
          emptyState={{
            title: `No ${noun} set yet`,
            note: `Once you set ${noun} for one of your classes, it appears here with how many students have submitted.`,
            action: (
              <Link href={isHw ? "/homework/create-homework" : "/homework/create-assignment"} className="btn primary">
                <Icon name="plus" className="sm" />
                {isHw ? "Create homework" : "Create assignment"}
              </Link>
            ),
          }}
        />
      </section>
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
