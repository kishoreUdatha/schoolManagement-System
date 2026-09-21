"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSearchParams } from "next/navigation";
import type { SchoolClass } from "@/features/students/types";
import { APPS, daysFromToday, ENQ, useYears } from "./shared";
import { STAGES, type Activity, type Application, type EnquiryDetail } from "./types";

const KIND_ICON: Record<string, IconName> = { note: "file", call: "message", visit: "building", email: "message", whatsapp: "message", stage_change: "check" };

function activityTitle(a: Activity): string {
  if (a.kind === "stage_change") return `Stage: ${label(a.from_stage)} → ${label(a.to_stage)}`;
  return label(a.kind);
}

/**
 * SCR-046, live: GET /admissions/enquiries/{id} (?id=) with its activity
 * timeline; POST /stage, /activities and /convert. The application tabs look
 * up the application made from this enquiry (GET /applications?search=).
 */
export function EnquiryDetails() {
  const id = useSearchParams().get("id");
  const res = useApi<EnquiryDetail>(id ? `${ENQ}/${id}` : null);
  const e = res.data;
  const apps = useApi<Application[]>(e ? APPS : null, { search: e?.student_name });
  const app = apps.data?.find((a) => a.enquiry_id === e?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!id) return <PickFirst what="enquiry" href={routeOf(44)} cta="Open the enquiry list" />;
  if (res.loading && !e) return <Loading what="Loading the enquiry…" />;
  if (!e) return <ErrorNote>{res.error ?? "Enquiry not found."}</ErrorNote>;

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      notify(done);
      res.reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const kv = (rows: [string, string][]) => (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );

  const due = daysFromToday(e.next_follow_up_date);
  const closed = e.stage === "enrolled" || e.stage === "lost";
  const withApp = (n: number) => (app ? `${routeOf(n)}?id=${app.id}` : routeOf(n === 50 ? 48 : n));
  const activities = [...(e.activities ?? [])].sort((a, z) => z.created_at.localeCompare(a.created_at));

  return (
    <>
      <section className="panel profile-banner">
        <div className="profile-hero">
          <div className="row">
            <span className="avatar mint large">{initials(e.student_name)}</span>
            <div>
              <h2>{e.student_name}</h2>
              <p>{`${e.applying_for_class ?? "Class not given"} · Enquiry no. ENQ-${e.id}`}</p>
              <div className="profile-meta">
                <span>
                  <Icon name="pin" className="sm" />
                  {` ${label(e.source)}${e.campaign_name ? ` · ${e.campaign_name}` : ""}`}
                </span>
                <span>
                  <Icon name="calendar" className="sm" />
                  {` Enquired ${date(e.created_at)}`}
                </span>
                <Badge>{label(e.stage)}</Badge>
              </div>
            </div>
          </div>
          <div className="profile-badge">
            <strong>{e.next_follow_up_date ? date(e.next_follow_up_date) : "—"}</strong>
            <small>{due === null ? "No follow-up scheduled" : due < 0 ? `Follow-up overdue by ${-due} day${due === -1 ? "" : "s"}` : due === 0 ? "Follow-up due today" : "Next follow-up"}</small>
          </div>
        </div>
        <nav className="module-tabs profile-tabs">
          <Link href={withApp(50)}>Application</Link>
          <Link href={withApp(51)}>Documents</Link>
          <Link href={withApp(52)}>Assessment</Link>
          <Link href={withApp(53)}>Approval</Link>
        </nav>
      </section>
      <ErrorNote>{error}</ErrorNote>
      <div className="two-col">
        <div className="stack">
          <Panel title="Personal information" action={<Link href={`${routeOf(45)}?id=${e.id}`} className="btn text">Edit</Link>}>
            {kv([
              ["Applicant", e.student_name],
              ["Applying for", e.applying_for_class ?? "—"],
              ["Parent name", e.parent_name],
              ["Mobile number", e.parent_phone],
              ["Source", label(e.source)],
              ["Counsellor", e.assigned_to_name ?? "Unassigned"],
            ])}
          </Panel>
          <Panel title="Contact information">
            {kv([
              ["Email address", e.parent_email ?? "—"],
              ["Mobile number", e.parent_phone],
              ["Address", e.address ?? "—"],
              ["Emergency contact", `${e.parent_name} · ${e.parent_phone}`],
            ])}
          </Panel>
          {!closed ? <FollowUpForm id={e.id} busy={busy} run={run} /> : null}
          {!closed ? <ConvertForm e={e} onDone={res.reload} /> : null}
        </div>
        <aside className="stack">
          <Panel title="At a glance">
            <div className="progress-stack">
              <div className="progress-label">
                <span>Stage</span>
                <strong>{label(e.stage)}</strong>
              </div>
              <div className="progress-label">
                <span>Next follow-up</span>
                <strong>{date(e.next_follow_up_date)}</strong>
              </div>
              <div className="progress-label">
                <span>Contacts logged</span>
                <strong>{activities.filter((a) => a.kind !== "stage_change").length}</strong>
              </div>
              <div className="progress-label">
                <span>Application</span>
                <strong>{app ? `${app.application_no} · ${label(app.status)}` : "Not started"}</strong>
              </div>
            </div>
            {e.student_id ? (
              <p className="small" style={{ marginTop: 12 }}>
                <Link href={`${routeOf(57)}?id=${e.student_id}`}>{`Enrolled on ${date(e.converted_at)} · open the student`}</Link>
              </p>
            ) : null}
            {e.lost_reason ? <p className="small muted" style={{ marginTop: 12 }}>{`Lost: ${e.lost_reason}`}</p> : null}
            {!app && !closed ? (
              <Link href={`${routeOf(49)}?enquiry=${e.id}`} className="btn" style={{ marginTop: 12 }}>
                <Icon name="plus" className="sm" />
                Start application
              </Link>
            ) : null}
          </Panel>
          {!closed ? <StagePanel e={e} busy={busy} run={run} /> : null}
          <Panel title="Recent activity">
            {activities.length ? (
              activities.map((a) => (
                <div className="timeline-item" key={a.id}>
                  <span className="timeline-dot">
                    <Icon name={KIND_ICON[a.kind] ?? "file"} />
                  </span>
                  <div>
                    <h4>{activityTitle(a)}</h4>
                    <p>{[a.note, `${dateTime(a.created_at)} · ${a.user_name ?? "School office"}`].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">Nothing logged yet.</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

type Run = (fn: () => Promise<unknown>, done: string) => Promise<boolean>;

function StagePanel({ e, busy, run }: { e: EnquiryDetail; busy: boolean; run: Run }) {
  const [stage, setStage] = useState(e.stage);
  const [reason, setReason] = useState("");
  return (
    <Panel title="Move stage">
      <div className="form-grid">
        <label className="field">
          <span>Stage</span>
          <select value={stage} onChange={(x) => setStage(x.target.value as typeof stage)}>
            {STAGES.filter((s) => s !== "enrolled").map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        {stage === "lost" ? (
          <label className="field">
            <span>
              Reason
              <span className="req">*</span>
            </span>
            <input value={reason} onChange={(x) => setReason(x.target.value)} placeholder="Why was it lost?" />
          </label>
        ) : null}
      </div>
      <div className="gap" />
      <button
        type="button"
        className="btn primary"
        disabled={busy || stage === e.stage || (stage === "lost" && !reason.trim())}
        onClick={() => run(() => api.post(`${ENQ}/${e.id}/stage`, stage === "lost" ? { stage, lost_reason: reason.trim() } : { stage }), `Moved to ${label(stage)}.`)}
      >
        <Icon name="check" className="sm" />
        Save stage
      </button>
    </Panel>
  );
}

function FollowUpForm({ id, busy, run }: { id: number; busy: boolean; run: Run }) {
  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const f = new FormData(form);
    const ok = await run(
      () =>
        api.post(`${ENQ}/${id}/activities`, {
          kind: String(f.get("kind")),
          note: String(f.get("note")).trim(),
          next_follow_up_date: String(f.get("next") || "") || null,
        }),
      "Follow-up logged.",
    );
    if (ok) form.reset();
  }
  return (
    <form id="follow-up" className="panel" onSubmit={submit}>
      <div className="panel-head">
        <div>
          <h2>Log a follow-up</h2>
          <p>Record the contact and when to follow up next</p>
        </div>
      </div>
      <div className="panel-body">
        <div className="form-grid">
          <label className="field">
            <span>Type</span>
            <select name="kind" defaultValue="call">
              {["call", "visit", "email", "whatsapp", "note"].map((k) => (
                <option key={k} value={k}>
                  {label(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Next follow-up</span>
            <input type="date" name="next" />
          </label>
          <label className="field full">
            <span>
              Note
              <span className="req">*</span>
            </span>
            <input name="note" required placeholder="What was discussed?" />
          </label>
        </div>
        <div className="gap" />
        <button type="submit" className="btn primary" disabled={busy}>
          <Icon name="check" className="sm" />
          Save follow-up
        </button>
      </div>
    </form>
  );
}

/** POST /enquiries/{id}/convert: enrol straight from the enquiry. */
function ConvertForm({ e, onDone }: { e: EnquiryDetail; onDone: () => void }) {
  const { data: years, current } = useYears();
  const [yearId, setYearId] = useState<number | null>(null);
  const year = yearId ?? current?.id ?? null;
  const classes = useApi<SchoolClass[]>(year ? "/api/v1/school/classes" : null, { academic_year_id: year });
  const [classId, setClassId] = useState<number | null>(null);
  const sections = useMemo(() => classes.data?.find((c) => c.id === classId)?.sections ?? [], [classes.data, classId]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<{ student_id: number; admission_no: string; parent_temporary_password?: string | null; parent_login_note?: string | null }>(`${ENQ}/${e.id}/convert`, {
        academic_year_id: year,
        section_id: Number(f.get("section_id")),
        admission_no: String(f.get("admission_no") ?? "").trim() || null,
        create_parent_login: f.get("login") === "on",
        relation: String(f.get("relation")),
      });
      setResult(
        [`Enrolled as ${r.admission_no}.`, r.parent_temporary_password ? `Parent temporary password: ${r.parent_temporary_password}` : null, r.parent_login_note].filter(Boolean).join(" "),
      );
      notify("Student created.");
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
          <h2>Enrol as a student</h2>
          <p>Creates the student and, if you choose, a parent login</p>
        </div>
      </div>
      <div className="panel-body">
        <ErrorNote>{error}</ErrorNote>
        {result ? (
          <div className="tip" role="status" style={{ marginBottom: 16 }}>
            <Icon name="check" className="sm" />
            <span>{result}</span>
            <button type="button" className="btn text" onClick={onDone}>
              Done
            </button>
          </div>
        ) : null}
        <div className="form-grid">
          <label className="field">
            <span>Academic year</span>
            <select value={year ?? ""} onChange={(x) => setYearId(Number(x.target.value))}>
              {years?.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              Class
              <span className="req">*</span>
            </span>
            <select required value={classId ?? ""} onChange={(x) => setClassId(x.target.value ? Number(x.target.value) : null)}>
              <option value="">Select class</option>
              {classes.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>
              Section
              <span className="req">*</span>
            </span>
            <select name="section_id" required disabled={!classId}>
              <option value="">Select section</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Admission no.</span>
            <input name="admission_no" placeholder="Leave blank to number automatically" />
          </label>
          <label className="field">
            <span>Parent is the</span>
            <select name="relation" defaultValue="guardian">
              {["father", "mother", "guardian", "other"].map((r) => (
                <option key={r} value={r}>
                  {label(r)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Parent login</span>
            <span className="row">
              <input type="checkbox" name="login" defaultChecked /> Create a parent portal login
            </span>
          </label>
        </div>
        <div className="gap" />
        <button type="submit" className="btn primary" disabled={saving}>
          <Icon name="cap" className="sm" />
          {saving ? "Enrolling…" : "Create student"}
        </button>
      </div>
    </form>
  );
}
