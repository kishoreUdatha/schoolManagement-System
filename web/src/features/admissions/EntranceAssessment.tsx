"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { appClass, APPS, emitChange, useDetails, useOnChange } from "./shared";
import type { Application, Assessment, AssessmentKind, StaffOption } from "./types";

import { ask } from "@/lib/dialog";
const KINDS: AssessmentKind[] = ["written_test", "interaction", "interview", "audition", "other"];
const COLUMN_KINDS: AssessmentKind[] = ["written_test", "interaction", "interview"];
const OPEN = ["submitted", "verification", "assessment"];

const num = (v: string | null) => (v === null ? null : Number(v));

function cell(tests: Assessment[], kind: AssessmentKind): string {
  const t = [...tests].reverse().find((x) => x.kind === kind);
  if (!t) return "—";
  if (t.status === "done") return t.max_marks ? `${num(t.marks_obtained) ?? "—"} / ${num(t.max_marks)}` : t.passed ? "Passed" : "Not passed";
  return label(t.status);
}

function decision(tests: Assessment[]): string {
  const live = tests.filter((t) => t.status !== "cancelled");
  if (!live.length) return "Not scheduled";
  if (live.some((t) => t.status === "scheduled")) return "Scheduled";
  if (live.every((t) => t.status === "absent")) return "Absent";
  return live.filter((t) => t.status === "done").every((t) => t.passed) ? "Recommended" : "Not recommended";
}

/**
 * SCR-052, live: applications at the assessment stage (GET /applications?status=assessment,
 * then GET /applications/{id} for the tests). PUT /applications/assessments/{id}
 * records a result; POST /applications/{id}/assessments schedules one;
 * DELETE /applications/assessments/{id} removes one not yet marked.
 */
export function EntranceAssessment() {
  const router = useRouter();
  const idParam = useSearchParams().get("id");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const list = useApi<Application[]>(APPS, { search });
  const open = useMemo(() => (list.data ?? []).filter((a) => OPEN.includes(a.status) || String(a.id) === idParam), [list.data, idParam]);
  const atAssessment = useMemo(() => open.filter((a) => a.status === "assessment" || String(a.id) === idParam), [open, idParam]);
  const details = useDetails(atAssessment.map((a) => a.id));
  const staff = useApi<StaffOption[]>("/api/v1/school/directory/staff");
  const reload = useCallback(() => {
    list.reload();
    details.reload();
  }, [list, details]);
  useOnChange(reload);

  const classes = [...new Set(atAssessment.map(appClass))].sort();
  const shown = atAssessment
    .map((a) => ({ a, tests: details.data[a.id]?.assessments ?? [] }))
    .filter(({ a, tests }) => (!classFilter || appClass(a) === classFilter) && (!decisionFilter || decision(tests) === decisionFilter));

  const rows: Row[] = shown.map(({ a, tests }) => {
    const done = tests.filter((t) => t.status === "done" && t.max_marks);
    const got = done.reduce((s, t) => s + (num(t.marks_obtained) ?? 0), 0);
    const max = done.reduce((s, t) => s + (num(t.max_marks) ?? 0), 0);
    return [{ name: a.student_name, sub: a.application_no }, ...COLUMN_KINDS.map((k) => cell(tests, k)), max ? `${got} / ${max}` : "—", decision(tests)];
  });

  // Figures cover every applicant at the assessment stage (search applies, the
  // class and decision filters do not); test figures wait for the details.
  const testsOf = atAssessment.map((a) => details.data[a.id]?.assessments ?? []);
  const n = (v: number, needsTests = false) => (!list.data || (needsTests && atAssessment.some((a) => !details.data[a.id])) ? "…" : String(v));
  const decided = (d: string) => testsOf.filter((t) => decision(t) === d).length;
  const stats = [
    { label: "At assessment", value: n(atAssessment.length), note: `${open.length} open applications` },
    { label: "Awaiting marks", value: n(testsOf.flat().filter((t) => t.status === "scheduled").length, true), note: "assessments scheduled" },
    { label: "Recommended", value: n(decided("Recommended"), true), note: "passed every test" },
    { label: "Not recommended", value: n(decided("Not recommended") + decided("Absent"), true), note: "failed a test or absent" },
  ];

  const scheduled = shown.flatMap(({ a, tests }) => tests.filter((t) => t.status === "scheduled").map((t) => ({ a, t })));

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search entrance assessment…" aria-label="Search applicants" />
        </div>
        <select aria-label="Filter by class" value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select aria-label="Filter by decision" value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value)}>
          <option value="">All decisions</option>
          {["Scheduled", "Recommended", "Not recommended", "Absent", "Not scheduled"].map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel title="Entrance assessment results" sub={`Applications at the assessment stage${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Applicant", "Written test", "Interaction", "Interview", "Total", "Decision"]}
          rows={rows}
          selectable={false}
          onView={(i) => router.push(`${routeOf(50)}?id=${shown[i].a.id}`)}
          empty={list.loading ? "Loading…" : "No applications are at the assessment stage."}
        />
      </Panel>
      <div className="two-col" style={{ marginTop: 20 }}>
        <ResultForm scheduled={scheduled} />
        <ScheduleForm apps={open} staff={staff.data ?? []} preset={idParam} />
      </div>
    </>
  );
}

function ResultForm({ scheduled }: { scheduled: { a: Application; t: Assessment }[] }) {
  const [pick, setPick] = useState("");
  const [status, setStatus] = useState("done");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = scheduled.find(({ t }) => String(t.id) === pick);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const f = new FormData(form);
    const marks = String(f.get("marks") ?? "").trim();
    const passed = String(f.get("passed") ?? "");
    setSaving(true);
    setError(null);
    try {
      await api.put(`${APPS}/assessments/${pick}`, {
        status,
        marks_obtained: status === "done" && marks !== "" ? marks : null,
        passed: status === "done" ? passed === "yes" : null,
        remarks: String(f.get("remarks") ?? "").trim() || null,
      });
      notify("Result recorded.");
      form.reset();
      setPick("");
      emitChange();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  /** DELETE /applications/assessments/{id}: only one not yet marked done. */
  async function remove() {
    if (!chosen || !(await ask(`Remove the ${label(chosen.t.kind).toLowerCase()} for ${chosen.a.student_name} on ${dateTime(chosen.t.scheduled_at)}?`))) return;
    setSaving(true);
    setError(null);
    try {
      await api.delete(`${APPS}/assessments/${chosen.t.id}`);
      notify("Assessment removed.");
      setPick("");
      emitChange();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="assessment-result" className="panel" onSubmit={submit}>
      <div className="panel-head">
        <div>
          <h2>Record a result</h2>
          <p>{scheduled.length ? `${scheduled.length} assessment${scheduled.length === 1 ? "" : "s"} waiting for marks` : "Nothing waiting for marks"}</p>
        </div>
      </div>
      <div className="panel-body">
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <label className="field full">
            <span>
              Assessment
              <span className="req">*</span>
            </span>
            <select required value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Select assessment</option>
              {scheduled.map(({ a, t }) => (
                <option key={t.id} value={t.id}>
                  {`${a.student_name} · ${label(t.kind)} · ${dateTime(t.scheduled_at)}`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Outcome</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="done">Attended</option>
              <option value="absent">Absent</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="field">
            <span>{`Marks${chosen?.t.max_marks ? ` out of ${Number(chosen.t.max_marks)}` : ""}`}</span>
            <input name="marks" type="number" min={0} step="0.5" max={chosen?.t.max_marks ? Number(chosen.t.max_marks) : undefined} disabled={status !== "done"} />
          </label>
          <label className="field">
            <span>
              Passed
              {status === "done" ? <span className="req">*</span> : null}
            </span>
            <select name="passed" required={status === "done"} disabled={status !== "done"} defaultValue="">
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="field">
            <span>Remarks</span>
            <input name="remarks" placeholder="Optional" />
          </label>
        </div>
        <div className="gap" />
        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="btn primary" disabled={saving || !pick}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Save assessment"}
          </button>
          {chosen ? (
            <button type="button" className="btn text" disabled={saving} onClick={remove}>
              Remove this assessment
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function ScheduleForm({ apps, staff, preset }: { apps: Application[]; staff: StaffOption[]; preset: string | null }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const f = new FormData(form);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    setSaving(true);
    setError(null);
    try {
      await api.post(`${APPS}/${text("application")}/assessments`, {
        kind: text("kind"),
        scheduled_at: new Date(String(f.get("when"))).toISOString(),
        venue: text("venue"),
        assessor_user_id: text("assessor") ? Number(text("assessor")) : null,
        max_marks: text("max_marks"),
      });
      notify("Assessment scheduled.");
      form.reset();
      emitChange();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="panel-head">
        <div>
          <h2>Schedule an assessment</h2>
          <p>The application moves to the assessment stage</p>
        </div>
      </div>
      <div className="panel-body">
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <label className="field full">
            <span>
              Application
              <span className="req">*</span>
            </span>
            <select name="application" required defaultValue={preset ?? ""} key={apps.length}>
              <option value="">Select application</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {`${a.student_name} · ${a.application_no} · ${appClass(a)}`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Type</span>
            <select name="kind" defaultValue="written_test">
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {label(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              Date and time
              <span className="req">*</span>
            </span>
            <input type="datetime-local" name="when" required />
          </label>
          <label className="field">
            <span>Venue</span>
            <input name="venue" placeholder="e.g. Room 12" />
          </label>
          <label className="field">
            <span>Assessor</span>
            <select name="assessor" defaultValue="">
              <option value="">Not assigned</option>
              {staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {`${s.full_name} · ${label(s.role)}`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Maximum marks</span>
            <input name="max_marks" type="number" min={1} step="0.5" placeholder="e.g. 100" />
          </label>
        </div>
        <div className="gap" />
        <button type="submit" className="btn primary" disabled={saving}>
          <Icon name="calendar" className="sm" />
          {saving ? "Scheduling…" : "Schedule"}
        </button>
      </div>
    </form>
  );
}
