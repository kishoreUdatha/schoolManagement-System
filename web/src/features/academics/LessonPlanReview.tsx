"use client";

import { useCallback, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, initials } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { PLAN_STATUS, planStatusText } from "./LessonPlanList";
import { usePageAction } from "./planKit";
import type { LessonPlan } from "./planTypes";

const base = "/api/v1/school/lesson-plans";
const TONES = ["mint", "", "peach", "lilac"];
const DAY = 86_400_000;

/** SCR-104, live: GET /api/v1/school/lesson-plans and POST /lesson-plans/{id}/review (approve or return). */
export function LessonPlanReview() {
  const list = useApi<LessonPlan[]>(base);
  const [status, setStatus] = useState("submitted");
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => list.data ?? [], [list.data]);
  const sections = useMemo(() => Array.from(new Set(all.map((p) => p.section_label))).sort(), [all]);
  const q = search.trim().toLowerCase();
  const shown = all.filter(
    (p) =>
      (!status || p.status === status) &&
      (!section || p.section_label === section) &&
      (!q || [p.title, p.subject_name, p.teacher_name, p.section_label].some((v) => v.toLowerCase().includes(q))),
  );
  const current = all.find((p) => p.id === picked) ?? shown.find((p) => p.status === "submitted") ?? null;

  const now = Date.now();
  const waiting = all.filter((p) => p.status === "submitted");
  const oldest = waiting.reduce<string | null>((o, p) => (p.submitted_at && (!o || p.submitted_at < o) ? p.submitted_at : o), null);
  const oldestDays = oldest ? Math.floor((now - new Date(oldest).getTime()) / DAY) : null;
  const weekApproved = all.filter((p) => p.status === "approved" && p.reviewed_at && now - new Date(p.reviewed_at).getTime() < 7 * DAY).length;
  const stats = [
    { label: "Awaiting review", value: String(waiting.length), note: "Submitted, not yet decided" },
    { label: "Approved this week", value: String(weekApproved), note: "Last seven days" },
    { label: "Returned", value: String(all.filter((p) => p.status === "returned").length), note: "Sent back for changes" },
    { label: "Oldest request", value: oldestDays === null ? "—" : `${oldestDays} day${oldestDays === 1 ? "" : "s"}`, note: oldest ? `Submitted ${date(oldest)}` : "Nothing waiting" },
  ];
  const history = all
    .filter((p) => p.reviewed_at)
    .sort((a, b) => (b.reviewed_at ?? "").localeCompare(a.reviewed_at ?? ""))
    .slice(0, 5);

  const review = useCallback(
    async (p: LessonPlan | null, decision: "approve" | "return") => {
      if (!p) return;
      if (p.status !== "submitted") {
        setError("Only a plan waiting for review can be approved or returned.");
        return;
      }
      if (decision === "return" && !comment.trim()) {
        setError("Say what should change before returning the plan.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await api.post(`${base}/${p.id}/review`, { decision, comment: comment.trim() || null });
        notify(decision === "approve" ? `Approved: ${p.title}` : `Returned to ${p.teacher_name}`);
        setComment("");
        setPicked(null);
        list.reload();
      } catch (err) {
        setError(errorText(err));
      } finally {
        setBusy(false);
      }
    },
    [comment, list],
  );
  usePageAction(
    "lesson-review:approve",
    useCallback(() => review(current, "approve"), [review, current]),
  );

  const checks: [string, boolean][] = current
    ? [
        ["Topics from the syllabus", current.topics.length > 0],
        ["Learning objectives", Boolean(current.objectives)],
        ["Teaching method", Boolean(current.activities)],
        ["Resources", Boolean(current.resources)],
        ["Assessment", Boolean(current.assessment)],
        ["Homework", Boolean(current.homework)],
      ]
    : [];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lesson plan review & approval…" aria-label="Search lesson plans" />
        </div>
        <select aria-label="Filter by class" value={section} onChange={(e) => setSection(e.target.value)}>
          <option value="">All classes</option>
          {sections.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(PLAN_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <div className="two-col">
        <div className="panel">
          <div className="approval-summary">
            <strong>{status === "submitted" ? "Requests awaiting approval" : "Lesson plans"}</strong>
            <span>{list.loading ? "Loading…" : `${shown.length} shown`}</span>
          </div>
          {shown.length === 0 ? <p className="panel-pad muted">{list.loading ? "Loading lesson plans…" : "Nothing here. Every submitted plan has been reviewed."}</p> : null}
          {shown.map((p, i) => (
            <article className="request-card" key={p.id} style={current?.id === p.id ? { background: "#f4f8ff" } : undefined}>
              <span className={`avatar ${TONES[i % 4]}`}>{initials(p.teacher_name)}</span>
              <div className="request-info">
                <h3>{p.teacher_name}</h3>
                <p>{`${p.title} · Subject: ${p.subject_name} · Class: ${p.section_label}`}</p>
                <p>{`For ${date(p.plan_date)} · ${p.periods} period${p.periods > 1 ? "s" : ""}${p.submitted_at ? ` · Submitted ${date(p.submitted_at)}` : ""}`}</p>
              </div>
              <div className="actions">
                <Badge>{planStatusText(p)}</Badge>
                <button type="button" className="btn" onClick={() => setPicked(p.id)}>
                  Review
                </button>
                {p.status === "submitted" ? (
                  <button type="button" className="btn primary" disabled={busy} onClick={() => review(p, "approve")}>
                    <Icon name="check" className="sm" />
                    Approve
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
        <aside className="stack">
          {current ? (
            <Panel title={current.title} sub={`${current.teacher_name} · ${current.subject_name} · ${current.section_label}`}>
              <dl className="kv">
                {(
                  [
                    ["Topics", current.topics.map((t) => t.title).join(", ")],
                    ["Objectives", current.objectives],
                    ["Teaching method", current.activities],
                    ["Resources", current.resources],
                    ["Assessment", current.assessment],
                    ["Homework", current.homework],
                  ] as [string, string | null][]
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd style={{ whiteSpace: "pre-line" }}>{v}</dd>
                    </div>
                  ))}
              </dl>
              {current.status === "submitted" ? (
                <div className="stack" style={{ marginTop: 14 }}>
                  <label className="field">
                    <span>Comment for the teacher</span>
                    <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Required when returning the plan" />
                  </label>
                  <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="btn primary" disabled={busy} onClick={() => review(current, "approve")}>
                      <Icon name="check" className="sm" />
                      Approve
                    </button>
                    <button type="button" className="btn" disabled={busy} onClick={() => review(current, "return")}>
                      Return for changes
                    </button>
                  </div>
                </div>
              ) : current.review_comment ? (
                <p className="muted" style={{ marginTop: 12 }}>{`${current.reviewed_by_name ?? "Reviewer"}: ${current.review_comment}`}</p>
              ) : null}
            </Panel>
          ) : null}
          <Panel title="Review checklist" sub={current ? "What this plan includes" : "Pick a plan to review"}>
            <div className="checklist">
              {checks.map(([k, ok]) => (
                <div className="check-item" key={k}>
                  <input type="checkbox" aria-label={k} checked={ok} readOnly />
                  <label>
                    {k}
                    <small>{ok ? "Included in this plan" : "Not filled in"}</small>
                  </label>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Approval history">
            {history.length ? (
              history.map((p) => (
                <div className="timeline-item" key={p.id}>
                  <span className="timeline-dot">
                    <Icon name={p.status === "approved" ? "check" : "message"} />
                  </span>
                  <div>
                    <h4>{`${PLAN_STATUS[p.status]}: ${p.title}`}</h4>
                    <p>{`${p.reviewed_by_name ?? "Reviewer"} · ${p.teacher_name} · ${p.section_label}`}</p>
                  </div>
                  <time>{date(p.reviewed_at).slice(0, 6)}</time>
                </div>
              ))
            ) : (
              <p className="muted">No plan has been reviewed yet.</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}
