"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { Application, DirectoryPerson, Interview } from "./types";
import { Dialog, Field, KV, downloadAuthed, today, useNewFlag } from "./ui";

import { ask } from "@/lib/dialog";
const BASE = "/api/v1/school/hr";
const MOVES = ["screening", "shortlisted", "interview", "rejected", "withdrawn"];

/** The recruitment tabs, each carrying the application on. */
export function CandidateTabs({ id, active }: { id: number; active: number }) {
  const tabs: [number, string, string][] = [
    [175, "Overview", `?id=${id}`],
    [176, "Interview schedule", ""],
    [177, "Offer & appointment", `?id=${id}`],
  ];
  return (
    <nav className="module-tabs profile-tabs">
      {tabs.map(([n, t, q]) => (
        <Link key={n} href={`${routeOf(n)}${q}`} className={n === active ? "active" : ""}>
          {t}
        </Link>
      ))}
    </nav>
  );
}

/** Name, opening and stage across the top of the candidate screens. */
export function CandidateBanner({ a, active }: { a: Application; active: number }) {
  const done = a.interviews.filter((i) => i.rating);
  const avg = done.length ? done.reduce((t, i) => t + (i.rating ?? 0), 0) / done.length : null;
  return (
    <section className="panel profile-banner">
      <div className="profile-hero">
        <div className="row">
          <span className="avatar mint large">{initials(a.candidate_name)}</span>
          <div>
            <h2>{a.candidate_name}</h2>
            <p>{`Application for ${a.opening_title}`}</p>
            <div className="profile-meta">
              <span>
                <Icon name="message" className="sm" />
                {` ${a.candidate_email}`}
              </span>
              <span>
                <Icon name="calendar" className="sm" />
                {` Applied ${date(a.applied_on)}`}
              </span>
              <Badge>{label(a.stage)}</Badge>
            </div>
          </div>
        </div>
        <div className="profile-badge">
          <strong>{avg !== null ? `${avg.toFixed(1)}/5` : a.rating ? `${a.rating}/5` : "—"}</strong>
          <small>{avg !== null ? `Panel rating · ${done.length} interview(s)` : "Not yet rated"}</small>
        </div>
      </div>
      <CandidateTabs id={a.id} active={active} />
    </section>
  );
}

/** The application named by ?id=. */
export function useApplication() {
  const id = useSearchParams().get("id");
  const res = useApi<Application>(id ? `${BASE}/applications/${id}` : null);
  return { id, ...res };
}

/**
 * SCR-175, live: GET /api/v1/school/hr/applications/{id}; moves with
 * POST …/stage, interviews with POST …/interviews, PUT/DELETE
 * /hr/interviews/{id}; résumé from GET /hr/candidates/{id}/resume.
 */
export function CandidateDetails() {
  const { id, data: a, error, loading, reload } = useApplication();
  const people = useApi<DirectoryPerson[]>("/api/v1/school/directory/staff");
  const [scheduling, closeScheduling] = useNewFlag();
  const [feedbackFor, setFeedbackFor] = useState<Interview | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [panel, setPanel] = useState<number[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!id) return <PickFirst what="candidate" href={routeOf(174)} cta="Open candidate applications" />;
  if (loading && !a) return <Loading what="Loading the candidate…" />;
  if (!a) return <ErrorNote>{error ?? "Application not found."}</ErrorNote>;

  async function run(fn: () => Promise<unknown>, done: string) {
    setErr(null);
    setBusy(true);
    try {
      await fn();
      notify(done);
      reload();
      return true;
    } catch (e) {
      setErr(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const move = (stage: string, reason: string | null = null) =>
    run(() => api.post(`${BASE}/applications/${a.id}/stage`, { stage, reason }), `Moved to ${label(stage)}.`);

  async function schedule(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const when = String(f.get("scheduled_at") ?? "");
    const ok = await run(
      () =>
        api.post(`${BASE}/applications/${a!.id}/interviews`, {
          scheduled_at: new Date(when).toISOString(),
          minutes: Number(f.get("minutes")) || 30,
          mode: String(f.get("mode") ?? "in_person"),
          place_or_link: String(f.get("place_or_link") ?? "").trim() || null,
          panel_user_ids: panel,
        }),
      "Interview scheduled and the panel told.",
    );
    if (ok) {
      setPanel([]);
      closeScheduling();
    }
  }

  async function feedback(e: FormEvent<HTMLFormElement>) {
    if (!feedbackFor) return;
    const f = new FormData(e.currentTarget);
    const rec = String(f.get("recommended") ?? "");
    const ok = await run(
      () =>
        api.put(`${BASE}/interviews/${feedbackFor.id}`, {
          status: String(f.get("status") ?? "done"),
          feedback: String(f.get("feedback") ?? "").trim() || null,
          rating: f.get("rating") ? Number(f.get("rating")) : null,
          recommended: rec === "" ? null : rec === "yes",
        }),
      "Feedback saved.",
    );
    if (ok) setFeedbackFor(null);
  }

  async function reject(e: FormEvent<HTMLFormElement>) {
    const reason = String(new FormData(e.currentTarget).get("reason") ?? "").trim();
    if (await move("rejected", reason)) setRejecting(false);
  }

  const upcoming = a.interviews.filter((i) => i.status === "scheduled").length;
  type Ev = { at: string; title: string; sub: string; icon: "file" | "calendar" | "check" | "money" };
  const events: Ev[] = ([
    { at: a.applied_on, title: "Applied", sub: a.opening_title, icon: "file" },
    ...a.interviews.map((i) => ({
      at: i.scheduled_at,
      title: `Round ${i.round_no} · ${label(i.status)}`,
      sub: [label(i.mode), i.panel_names.join(", "), i.rating ? `${i.rating}/5` : ""].filter(Boolean).join(" · "),
      icon: "calendar" as const,
    })),
    ...(a.offer ? [{ at: a.offer.responded_at ?? a.offer.sent_at ?? a.offer.joining_date, title: `Offer ${label(a.offer.status).toLowerCase()}`, sub: `${a.offer.role_title} · ${money(a.offer.annual_salary)} a year`, icon: "money" as const }] : []),
  ] as Ev[]).sort((x, y) => y.at.localeCompare(x.at));

  return (
    <>
      <CandidateBanner a={a} active={175} />
      <ErrorNote>{err}</ErrorNote>
      <div className="two-col">
        <div className="stack">
          <Panel title="Personal information">
            <KV
              rows={[
                ["Candidate", a.candidate_name],
                ["Position", a.opening_title],
                ["Experience", a.experience_years ? `${Number(a.experience_years)} years` : "—"],
                ["Qualification", a.qualification ?? "—"],
                ["Stage", label(a.stage)],
                ["Applied", date(a.applied_on)],
              ]}
            />
          </Panel>
          <Panel title="Contact information">
            <KV
              rows={[
                ["Email address", a.candidate_email],
                ["Mobile number", a.candidate_phone ?? "—"],
                [
                  "Résumé",
                  a.has_resume ? (
                    <button type="button" className="btn" onClick={() => downloadAuthed(`${BASE}/candidates/${a.candidate_id}/resume`, `resume-${a.candidate_name}`).catch((e) => setErr(errorText(e)))}>
                      <Icon name="download" className="sm" />
                      Download résumé
                    </button>
                  ) : (
                    "Not uploaded"
                  ),
                ],
                ["Notes", a.notes ?? "—"],
                ...(a.rejected_reason ? ([["Rejected because", a.rejected_reason]] as [string, string][]) : []),
              ]}
            />
          </Panel>
          <Panel title="Interviews" sub={`${a.interviews.length} scheduled in all · ${upcoming} still to happen`}>
            {a.interviews.length === 0 ? <p className="muted">None yet.</p> : null}
            {a.interviews.map((i, n) => (
              <div className="spread" key={i.id} style={{ padding: "10px 0", borderTop: n ? "1px solid var(--line)" : undefined, alignItems: "flex-start" }}>
                <div>
                  <strong>{`Round ${i.round_no}`}</strong>
                  <p className="small muted">{[dateTime(i.scheduled_at), `${i.minutes} min`, label(i.mode), i.place_or_link, i.panel_names.join(", ")].filter(Boolean).join(" · ")}</p>
                  {i.feedback ? <p className="small">{`${i.feedback}${i.rating ? ` · ${i.rating}/5` : ""}${i.recommended === true ? " · recommended" : i.recommended === false ? " · not recommended" : ""}`}</p> : null}
                </div>
                <div className="row">
                  <Badge>{label(i.status)}</Badge>
                  {i.status === "scheduled" ? (
                    <>
                      <button type="button" className="btn" onClick={() => setFeedbackFor(i)}>
                        Add feedback
                      </button>
                      <button type="button" className="btn" disabled={busy} onClick={async () => (await ask("Cancel this interview?")) && run(() => api.delete(`${BASE}/interviews/${i.id}`), "Interview removed.")}>
                        Cancel
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="At a glance">
            <div className="progress-stack">
              <div className="progress-label">
                <span>Stage</span>
                <strong>{label(a.stage)}</strong>
              </div>
              <div className="progress-label">
                <span>Interviews done</span>
                <strong>{`${a.interviews.filter((i) => i.status === "done").length} / ${a.interviews.length}`}</strong>
              </div>
              <div className="progress-label">
                <span>Recommended by panel</span>
                <strong>{a.interviews.filter((i) => i.recommended).length}</strong>
              </div>
              <div className="progress-label">
                <span>Offer</span>
                <strong>{a.offer ? label(a.offer.status) : "None"}</strong>
              </div>
            </div>
          </Panel>
          {a.stage !== "hired" ? (
            <Panel title="Move this application">
              <div className="stack">
                <select
                  aria-label="Move to stage"
                  value=""
                  disabled={busy}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next === "rejected") setRejecting(true);
                    else if (next) move(next);
                  }}
                >
                  <option value="">Move to…</option>
                  {MOVES.filter((m) => m !== a.stage).map((m) => (
                    <option key={m} value={m}>
                      {label(m)}
                    </option>
                  ))}
                </select>
                <Link className="btn" href={`${routeOf(177)}?id=${a.id}`}>
                  <Icon name="money" className="sm" />
                  {a.offer ? "Open the offer" : "Make an offer"}
                </Link>
              </div>
            </Panel>
          ) : null}
          <Panel title="Recent activity">
            {events.slice(0, 6).map((ev, n) => (
              <div className="timeline-item" key={n}>
                <span className="timeline-dot">
                  <Icon name={ev.icon} />
                </span>
                <div>
                  <h4>{ev.title}</h4>
                  <p>{`${date(ev.at)} · ${ev.sub}`}</p>
                </div>
              </div>
            ))}
          </Panel>
        </aside>
      </div>

      {scheduling ? (
        <Dialog title={`Schedule an interview · ${a.candidate_name}`} onClose={closeScheduling} onSubmit={schedule} submit="Schedule" busy={busy} error={err} wide>
          <div className="form-grid">
            <Field label="When" required>
              <input name="scheduled_at" type="datetime-local" required defaultValue={`${today()}T10:00`} />
            </Field>
            <Field label="Minutes">
              <input name="minutes" type="number" min={5} max={480} defaultValue={45} />
            </Field>
            <Field label="Mode">
              <select name="mode" defaultValue="in_person">
                <option value="in_person">In person</option>
                <option value="phone">Phone</option>
                <option value="video">Video call</option>
              </select>
            </Field>
            <Field label="Where or meeting link">
              <input name="place_or_link" maxLength={300} />
            </Field>
            <div className="field full">
              <span>Panel</span>
              <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                {people.data?.map((p) => (
                  <label key={p.user_id} className="row small" style={{ gap: 4 }}>
                    <input type="checkbox" checked={panel.includes(p.user_id)} onChange={(e) => setPanel(e.target.checked ? [...panel, p.user_id] : panel.filter((x) => x !== p.user_id))} />
                    {p.full_name}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Dialog>
      ) : null}

      {feedbackFor ? (
        <Dialog title={`Round ${feedbackFor.round_no} feedback`} onClose={() => setFeedbackFor(null)} onSubmit={feedback} submit="Save feedback" busy={busy} error={err}>
          <div className="form-grid">
            <Field label="Outcome">
              <select name="status" defaultValue="done">
                <option value="done">Held</option>
                <option value="no_show">Candidate did not come</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>
            <Field label="Rating (1–5)">
              <input name="rating" type="number" min={1} max={5} />
            </Field>
            <Field label="Recommend?">
              <select name="recommended" defaultValue="">
                <option value="">Not saying</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
            <Field label="How did it go?" full>
              <textarea name="feedback" rows={3} maxLength={5000} defaultValue={feedbackFor.feedback ?? ""} />
            </Field>
          </div>
        </Dialog>
      ) : null}

      {rejecting ? (
        <Dialog title={`Reject ${a.candidate_name}`} onClose={() => setRejecting(false)} onSubmit={reject} submit="Reject" busy={busy} error={err}>
          <Field label="Why" required full>
            <textarea name="reason" required rows={3} maxLength={500} />
          </Field>
        </Dialog>
      ) : null}
    </>
  );
}
