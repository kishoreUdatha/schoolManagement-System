"use client";

/*
 * PM-058 · Projects & activities. Projects set for the child's class
 * (GET …/projects), the child's progress on each (GET …/projects/{id}/progress)
 * with the teacher's review, the project's milestones
 * (GET /parent/me/children/{id}/project-milestones), a progress update on
 * the child's behalf (POST …/projects/{id}/progress: in progress /
 * submitted, a link, a note), and the clubs and activities the child takes
 * part in (GET /parent/me/children/{id}/activities).
 */

import { useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, dateTime, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading, orNull, useChildPath } from "../support/pm";

type Project = {
  id: number;
  subject_name: string | null;
  class_name: string | null;
  title: string;
  description: string;
  attachment_url: string | null;
  deadline: string;
  kind: "individual" | "group";
  created_by_name: string | null;
  is_past_due: boolean;
};

type Progress = {
  status: "not_started" | "in_progress" | "submitted" | "reviewed";
  attachment_url: string | null;
  comment: string | null;
  submitted_at: string | null;
  teacher_remark: string | null;
  rating: number | null;
  reviewed_by_name: string | null;
  updated_at: string;
};

type Milestone = { id: number; project_id: number; title: string; due_on: string | null; position: number };

type Activity = {
  activity_id: number;
  name: string;
  kind: string;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  in_charge_name: string | null;
  role: string | null;
  joined_on: string;
  left_on: string | null;
};

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const hm = (t: string | null) => (t ? t.slice(0, 5) : "");

const STEP: Record<Progress["status"], number> = { not_started: 0, in_progress: 1, submitted: 2, reviewed: 3 };

export function ProjectsActivities() {
  return (
    <ChildGate>
      <Projects />
    </ChildGate>
  );
}

function Projects() {
  const { go, childId } = useParent();
  const base = useChildPath("/projects");
  const projects = useApi<Project[]>(base);
  const me = childId ? `/api/v1/parent/me/children/${childId}` : null;
  const milestones = useApi<Milestone[]>(me && `${me}/project-milestones`);
  const activities = useApi<Activity[]>(me && `${me}/activities`);

  if (projects.loading && !projects.data) return <PmLoading />;
  if (!projects.data) return <PmError>{projects.error}</PmError>;
  // Upcoming deadlines first, then past ones.
  const list = [...projects.data].sort((a, b) => Number(a.is_past_due) - Number(b.is_past_due) || a.deadline.localeCompare(b.deadline));

  return (
    <>
      <PmError>{projects.error || milestones.error || activities.error}</PmError>
      {list.length === 0 ? <PmEmpty title="No projects yet">Projects set for your child’s class will appear here.</PmEmpty> : null}
      {list.map((p) => (
        <ProjectCard key={p.id} base={base!} project={p} milestones={(milestones.data ?? []).filter((m) => m.project_id === p.id)} />
      ))}
      <Activities list={activities.data} />
      <button className="action secondary" onClick={() => go(45)}>
        Message project teacher
      </button>
    </>
  );
}

function ProjectCard({ base, project: p, milestones }: { base: string; project: Project; milestones: Milestone[] }) {
  const { notify } = useParent();
  const prog = useApi<Progress | null>(`${base}/${p.id}/progress`);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ status: "in_progress", attachment_url: "", comment: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cur = prog.data;
  const status = cur?.status ?? "not_started";
  const step = STEP[status];
  const locked = status === "reviewed";

  function start() {
    setF({ status: status === "submitted" ? "submitted" : "in_progress", attachment_url: cur?.attachment_url ?? "", comment: cur?.comment ?? "" });
    setErr(null);
    setOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post(`${base}/${p.id}/progress`, { status: f.status, attachment_url: orNull(f.attachment_url), comment: orNull(f.comment) });
      notify(f.status === "submitted" ? "Marked as submitted." : "Progress updated.");
      setOpen(false);
      prog.reload();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <span className="eyebrow">{(p.subject_name ?? "School").toUpperCase()} PROJECT</span>
      <h2>{p.title}</h2>
      <p>
        {label(p.kind)}
        {p.class_name ? ` · ${p.class_name}` : ""}
        {p.created_by_name ? ` · ${p.created_by_name}` : ""}
      </p>
      <p style={{ whiteSpace: "pre-line" }}>{p.description}</p>
      <span className={status === "reviewed" || status === "submitted" ? "status" : p.is_past_due ? "status amber" : "status blue"}>
        {prog.loading && !cur ? "…" : label(status)}
      </span>
      <div className="progress-track">
        <span style={{ width: `${(step / 3) * 100}%` }} />
      </div>
      <small>
        {p.is_past_due ? "Was due" : "Due"} {date(p.deadline)}
        {cur?.submitted_at ? ` · Submitted ${dateTime(cur.submitted_at)}` : ""}
      </small>
      {milestones.length ? (
        <div className="timeline">
          {milestones.map((m) => {
            const done = step >= 2;
            const late = !done && m.due_on !== null && m.due_on < new Date().toISOString().slice(0, 10);
            return (
              <p key={m.id} className={done ? "current" : undefined}>
                <b>{m.title}</b>
                <small>
                  {m.due_on ? `Due ${date(m.due_on)}` : "No date"}
                  {done ? " · done" : late ? " · date passed" : ""}
                </small>
              </p>
            );
          })}
        </div>
      ) : null}
      {p.attachment_url ? (
        <p>
          <a href={p.attachment_url} target="_blank" rel="noopener noreferrer">
            Project brief
          </a>
        </p>
      ) : null}
      {cur?.attachment_url ? (
        <p>
          <a href={cur.attachment_url} target="_blank" rel="noopener noreferrer">
            Your child’s work
          </a>
        </p>
      ) : null}
      {status === "reviewed" ? (
        <div className="item">
          <span>
            <strong>{cur?.teacher_remark ?? "Reviewed"}</strong>
            <small>
              {cur?.reviewed_by_name ?? "Teacher"}
              {cur?.rating ? ` · ${cur.rating}/5` : ""}
            </small>
          </span>
          <span className="value good">Reviewed</span>
        </div>
      ) : null}
      <PmError>{err || prog.error}</PmError>
      {open ? (
        <form onSubmit={save}>
          <label className="field">
            Status
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="in_progress">In progress</option>
              <option value="submitted">Submitted</option>
            </select>
          </label>
          <label className="field">
            Link to the work (optional)
            <input type="url" placeholder="https://" value={f.attachment_url} onChange={(e) => setF({ ...f, attachment_url: e.target.value })} />
          </label>
          <label className="field">
            Note for the teacher (optional)
            <textarea rows={2} value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} />
          </label>
          <button className="action" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save progress"}
          </button>
          <button className="action secondary" type="button" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </form>
      ) : !locked ? (
        <button className="action secondary" onClick={start}>
          Update progress
        </button>
      ) : null}
    </div>
  );
}

function Activities({ list }: { list: Activity[] | null }) {
  if (!list) return null;
  const current = list.filter((a) => !a.left_on);
  const past = list.filter((a) => a.left_on);
  return (
    <section className="section">
      <h3>Activities</h3>
      {list.length === 0 ? <p className="micro">Your child is not in any club or activity yet.</p> : null}
      {current.map((a) => (
        <div key={a.activity_id} className="item">
          <span>
            <strong>{a.name}</strong>
            <small>
              {[
                label(a.kind),
                a.day_of_week !== null ? `${DAYS[a.day_of_week]}${a.start_time ? ` ${hm(a.start_time)}–${hm(a.end_time)}` : ""}` : null,
                a.venue,
                a.in_charge_name,
              ]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </span>
          <span className="value good">{a.role ?? "Member"}</span>
        </div>
      ))}
      {past.map((a) => (
        <div key={a.activity_id} className="item">
          <span>
            <strong>{a.name}</strong>
            <small>
              {date(a.joined_on)} – {date(a.left_on)}
            </small>
          </span>
          <span className="value">Past</span>
        </div>
      ))}
    </section>
  );
}
