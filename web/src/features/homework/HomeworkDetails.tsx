"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { FileCards } from "@/components/ui/Attachments";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { LinkCard, teacherState } from "./shared";
import type { Homework, MyClasses, Rubric, Submission } from "./types";

import { ask } from "@/lib/dialog";
/**
 * SCR-130, live: GET /teacher/homework/{id} (?id=), its submissions,
 * the class size from /teacher/my-classes and the rubric's criteria.
 * Close / reopen (POST …/close), edit (SCR-129 ?id=) and delete.
 */
export function HomeworkDetails() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const hw = useApi<Homework>(id ? `/api/v1/teacher/homework/${id}` : null);
  const subs = useApi<Submission[]>(id ? `/api/v1/teacher/homework/${id}/submissions` : null);
  const classes = useApi<MyClasses>(id ? "/api/v1/teacher/my-classes" : null);
  const rubric = useApi<Rubric>(hw.data?.rubric_id ? `/api/v1/school/rubrics/${hw.data.rubric_id}` : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!id) return <PickFirst what="homework" href={routeOf(128)} cta="Open the homework list" />;
  if (hw.loading && !hw.data) return <Loading what="Loading the homework…" />;
  const h = hw.data;
  if (!h) return <ErrorNote>{hw.error ?? "Homework not found."}</ErrorNote>;

  const list = subs.data ?? [];
  const size = classes.data?.subject_teacher_of.find((c) => c.class_subject_id === h.class_subject_id)?.total_students;
  const reviewed = list.filter((s) => s.status !== "submitted");
  const marked = list.filter((s) => s.marking?.total != null);
  const avg = marked.length ? marked.reduce((n, s) => n + (s.marking!.total ?? 0), 0) / marked.length : null;
  const max = rubric.data?.max_total ?? marked[0]?.marking?.max_total;
  const fig = (v: number | undefined | null) => (subs.loading && !subs.data ? "…" : v == null ? "—" : String(v));

  const stats = [
    { label: "Submitted", value: size ? `${fig(list.length)} / ${size}` : fig(list.length), note: "Students" },
    { label: "Pending", value: size !== undefined ? fig(Math.max(size - list.length, 0)) : "—", note: "Students" },
    { label: "Reviewed", value: fig(reviewed.length), note: "Submissions" },
    { label: "Average score", value: avg === null ? "—" : `${avg.toFixed(1)} / ${max ?? "—"}`, note: h.rubric_id ? "Marked work" : "No rubric on this homework" },
  ];

  async function act(what: "close" | "reopen" | "delete") {
    if (what === "delete" && !(await ask(`Delete "${h!.title}"?`))) return;
    setBusy(true);
    setError(null);
    try {
      if (what === "delete") {
        await api.delete(`/api/v1/teacher/homework/${id}`);
        notify("Homework deleted.");
        router.push(routeOf(128));
        return;
      }
      await api.post(`/api/v1/teacher/homework/${id}/close`, { closed: what === "close" });
      notify(what === "close" ? "Closed — no more submissions." : "Open for submissions again.");
      hw.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="two-col">
      <div className="stack">
        <ErrorNote>{error ?? subs.error}</ErrorNote>
        <Panel
          title="Homework brief"
          action={
            <div className="row">
              <Badge>{teacherState(h.is_closed, h.is_past_due, h.due_date)}</Badge>
              <button type="button" className="btn" disabled={busy} onClick={() => act(h.is_closed ? "reopen" : "close")}>
                {h.is_closed ? "Reopen" : "Close"}
              </button>
              {h.can_edit ? (
                <>
                  <Link href={`${routeOf(129)}?id=${h.id}`} className="btn">
                    Edit
                  </Link>
                  <button type="button" className="btn" disabled={busy} onClick={() => act("delete")}>
                    Delete
                  </button>
                </>
              ) : null}
            </div>
          }
        >
          <h3 style={{ fontSize: "22px", marginBottom: "13px" }}>{h.title}</h3>
          <p className="muted small" style={{ lineHeight: "1.9", whiteSpace: "pre-line" }}>
            {h.description}
          </p>
          <div className="gap" />
          <div className="assessment-prompt">
            <strong>What to submit</strong>
            <p className="small muted">A written response, files (PDF, image or Word), a link to the work, or any of these. Students and parents can hand it in until it is closed.</p>
          </div>
          {h.attachment_url ? <LinkCard url={h.attachment_url} note="Attached by the teacher" /> : null}
          <FileCards files={h.attachments ?? []} pathOf={(a) => `/api/v1/teacher/homework/${h.id}/files/${a.id}`} note="Attached by the teacher" onError={setError} />
        </Panel>
        <Panel title="Submission overview">
          <StatStrip items={stats} compact />
        </Panel>
      </div>
      <aside className="stack">
        <Panel title="Assignment details">
          <dl className="kv">
            {[
              ["Subject", h.subject_name ?? "—"],
              ["Class", h.class_name ?? "—"],
              ["Teacher", h.created_by_name ?? "—"],
              ["Assigned on", date(h.created_at)],
              ["Due date", date(h.due_date)],
              ["Maximum score", max != null ? String(max) : "—"],
              ...(h.is_closed ? [["Closed", `${date(h.closed_at)}${h.closed_by_name ? ` by ${h.closed_by_name}` : ""}`]] : []),
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Marking criteria" sub={h.rubric_name ?? undefined}>
          {rubric.data?.criteria.length ? (
            [...rubric.data.criteria]
              .sort((a, b) => a.sequence - b.sequence)
              .map((c) => (
                <div className="event-row" key={c.id}>
                  <div className="event-content">
                    <h4>{c.title}</h4>
                  </div>
                  <strong className="small">{`${c.max_points} marks`}</strong>
                </div>
              ))
          ) : (
            <p className="muted">{h.rubric_id ? (rubric.loading ? "Loading…" : "The rubric has no criteria.") : "No rubric — each submission is approved or returned."}</p>
          )}
        </Panel>
      </aside>
    </div>
  );
}
