"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Kv, StudentFrame, today } from "./StudentFrame";
import { INCIDENT_CATEGORIES, type Incident } from "./records";
import type { StudentProfile } from "./types";

/**
 * SCR-064, live: GET /discipline/incidents?student_id=, POST /discipline/incidents
 * (add observation), POST /discipline/incidents/{id}/actions (add note).
 */
export function StudentBehaviour() {
  return <StudentFrame active={64}>{(s) => <Body s={s} />}</StudentFrame>;
}

function Body({ s }: { s: StudentProfile }) {
  const incidents = useApi<Incident[]>("/api/v1/school/discipline/incidents", { student_id: s.id });
  const list = incidents.data ?? [];
  const [pick, setPick] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [noting, setNoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pick === null && list.length) setPick(list[0].id);
  }, [list, pick]);

  // The page-head button opens the form from outside this component.
  useEffect(() => {
    const open = () => setAdding(true);
    window.addEventListener("student-behaviour:add", open);
    return () => window.removeEventListener("student-behaviour:add", open);
  }, []);

  const c = list.find((x) => x.id === pick);
  const isOpen = (x: Incident) => x.status === "reported" || x.status === "investigating";
  const n = (v: number) => (incidents.loading && !incidents.data ? (incidents.loading ? "…" : "—") : String(v));
  const stats = [
    { label: "Cases", value: n(list.length), note: "On record for this student" },
    { label: "Open", value: n(list.filter(isOpen).length), note: "Reported or under review" },
    { label: "High severity", value: n(list.filter((x) => x.severity === "high").length), note: "Of all cases" },
    { label: "Parents told", value: n(list.filter((x) => x.shared_with_parents).length), note: "Cases shared with the family" },
  ];

  async function addObservation(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const made = await api.post<Incident>("/api/v1/school/discipline/incidents", {
        student_id: s.id,
        occurred_on: String(f.get("occurred_on")),
        category: String(f.get("category")),
        severity: String(f.get("severity")),
        place: String(f.get("place") ?? "").trim() || null,
        description: String(f.get("description") ?? "").trim(),
      });
      notify("Observation recorded.");
      setAdding(false);
      setPick(made.id);
      incidents.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function addNote(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!c) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/discipline/incidents/${c.id}/actions`, {
        kind: String(f.get("kind")),
        details: String(f.get("details") ?? "").trim() || null,
        notify_parents: false,
        open_counselling_case: false,
      });
      notify("Follow-up recorded.");
      setNoting(false);
      incidents.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  // The case's story, newest first: actions, parents told, closure, opening.
  const timeline = c
    ? [
        ...(c.closed_on ? [{ icon: "check" as const, title: `Case ${label(c.status).toLowerCase()}`, sub: c.resolution ?? c.closed_by_name ?? "—", at: c.closed_on }] : []),
        ...(c.parent_informed_at ? [{ icon: "check" as const, title: "Guardian informed", sub: "Shared with parents", at: c.parent_informed_at }] : []),
        ...c.actions.map((a) => ({ icon: "message" as const, title: label(a.kind), sub: [a.details, a.assigned_by_name].filter(Boolean).join(" · ") || "—", at: a.completed_on ?? a.start_date ?? c.occurred_on })),
        { icon: "calendar" as const, title: "Case opened", sub: `Reported by ${c.reported_by_name ?? "school office"}`, at: c.occurred_on },
      ]
    : [];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="two-col">
        <div className="stack">
          <ErrorNote>{error ?? incidents.error}</ErrorNote>
          {adding ? (
            <Panel title="Add observation" sub={s.full_name}>
              <form onSubmit={addObservation}>
                <div className="form-grid">
                  <label className="field">
                    <span>
                      Date<span className="req">*</span>
                    </span>
                    <input type="date" name="occurred_on" required defaultValue={today()} max={today()} />
                  </label>
                  <label className="field">
                    <span>
                      Category<span className="req">*</span>
                    </span>
                    <select name="category" defaultValue="other">
                      {INCIDENT_CATEGORIES.map((x) => (
                        <option key={x} value={x}>
                          {label(x)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Severity</span>
                    <select name="severity" defaultValue="low">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Place</span>
                    <input name="place" maxLength={160} placeholder="e.g. Playground" />
                  </label>
                  <label className="field full">
                    <span>
                      Observation<span className="req">*</span>
                    </span>
                    <textarea name="description" required minLength={3} placeholder="What happened" />
                  </label>
                </div>
                <div className="form-footer">
                  <span>Fields marked * are required</span>
                  <div className="actions">
                    <button type="button" className="btn" onClick={() => setAdding(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn primary" disabled={busy}>
                      <Icon name="check" className="sm" />
                      {busy ? "Saving…" : "Save observation"}
                    </button>
                  </div>
                </div>
              </form>
            </Panel>
          ) : null}
          {list.length > 1 ? (
            <div className="filterbar">
              <select aria-label="Case" value={pick ?? ""} onChange={(e) => setPick(Number(e.target.value))}>
                {list.map((x) => (
                  <option key={x.id} value={x.id}>
                    {`${x.reference_no} · ${date(x.occurred_on)} · ${label(x.category)}`}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <Panel title="Case details" sub={c?.reference_no}>
            {c ? (
              <Kv
                rows={[
                  ["Date", date(c.occurred_on)],
                  ["Category", label(c.category)],
                  ["Observation", c.description],
                  ["Recorded by", c.reported_by_name ?? "—"],
                  ["Follow-up", c.actions.length ? `${c.actions.length} recorded` : "—"],
                  ["Status", <Badge key="s">{label(c.status)}</Badge>],
                ]}
              />
            ) : (
              <p className="muted">{incidents.loading ? "Loading…" : "No behaviour or discipline case is recorded for this student."}</p>
            )}
          </Panel>
          {c ? (
            <Panel title="Follow-up activity">
              {timeline.map((t, i) => (
                <div className="timeline-item" key={i}>
                  <span className="timeline-dot">
                    <Icon name={t.icon} />
                  </span>
                  <div>
                    <h4>{t.title}</h4>
                    <p>{t.sub}</p>
                  </div>
                  <time>{date(t.at).slice(0, 6)}</time>
                </div>
              ))}
            </Panel>
          ) : null}
        </div>
        <aside className="stack">
          <Panel title="Record information">
            <Kv
              rows={[
                ["Student", s.full_name],
                ["Class", `${s.class_name ?? "—"} ${s.section_name ?? ""}`],
                ["Academic year", s.academic_year_name ?? "—"],
                ["Cases on record", incidents.data ? String(list.length) : "…"],
              ]}
            />
          </Panel>
          {c ? (
            <Panel title="Next action">
              {noting ? (
                <form onSubmit={addNote} className="stack">
                  <label className="field">
                    <span>Action</span>
                    <select name="kind" defaultValue="other">
                      {["verbal_warning", "written_warning", "parent_meeting", "detention", "counselling_referral", "other"].map((k) => (
                        <option key={k} value={k}>
                          {label(k)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Note</span>
                    <textarea name="details" maxLength={5000} placeholder="What was done" />
                  </label>
                  <div className="row">
                    <button type="button" className="btn" onClick={() => setNoting(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn primary" disabled={busy}>
                      {busy ? "Saving…" : "Save note"}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="muted small">Review the latest information and record any follow-up.</p>
                  <div className="gap" />
                  <button type="button" className="btn" onClick={() => setNoting(true)} disabled={!c}>
                    <Icon name="plus" className="sm" />
                    Add note
                  </button>
                </>
              )}
            </Panel>
          ) : null}
        </aside>
      </div>
    </>
  );
}

/** "Add observation" in the page head; opens the form in the screen body. */
export function AddObservationButton() {
  return (
    <button type="button" className="btn primary" onClick={() => window.dispatchEvent(new Event("student-behaviour:add"))}>
      <Icon name="plus" className="sm" />
      Add observation
    </button>
  );
}
