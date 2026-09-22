"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { CHANNELS, CHANNEL_LABEL, type Channel, NOTICE_AUDIENCE, type Notice, type NoticeAudience, deliveryLine, useCurrentClasses, useRole } from "./shared";

type Summary = { sent: number; scheduled: number; draft: number; overdue: number; scheduler_running: boolean };
type Due = { due: { notice_id: number; title: string; scheduled_at: string }[]; count: number };
type RunResult = { sent_count: number; failed_count: number; failed: { title: string; error: string }[] };
type MyClasses = {
  class_teacher_of: { section_id: number; class_id: number; class_name: string; section_label: string }[];
  subject_teacher_of: { class_id: number; class_name: string; sections: { section_id: number; section_name: string }[] }[];
};
type RosterStudent = { id: number; full_name: string; admission_no: string };

const OFFICE_AUDIENCES: NoticeAudience[] = ["all_parents", "all_teachers", "all_staff", "class_parents", "section_parents"];
const TEACHER_AUDIENCES: NoticeAudience[] = ["class_parents", "section_parents", "single_parent"];

/** The mock's page-head button, worded for what it does for this role. */
export function CampaignAction() {
  const role = useRole();
  if (role !== "school_admin" && role !== "teacher") return null;
  return (
    <button type="submit" form="campaign-form" value={role === "teacher" ? "send" : "draft"} className="btn primary">
      <Icon name="check" className="sm" />
      {role === "teacher" ? "Send notice" : "Save campaign"}
    </button>
  );
}

/**
 * SCR-254 Notification Campaigns. The office writes a notice
 * (POST /api/v1/school/notices, or PATCH /notices/{id} with ?id=), sends it
 * (POST /notices/{id}/send) or schedules it; due notices go out when
 * somebody runs POST /api/v1/school/ops/scheduled-notices/run — nothing
 * sends on a timer. A teacher's notice is sent on creation
 * (POST /api/v1/teacher/notices) to parents of classes they teach.
 */
export function NotificationCampaigns() {
  const role = useRole();
  if (role === null) return <Loading />;
  if (role === "school_admin" || role === "teacher") return <Compose teacher={role === "teacher"} />;
  return <ErrorNote>Notification campaigns are written by the school office and teachers.</ErrorNote>;
}

function Compose({ teacher }: { teacher: boolean }) {
  const router = useRouter();
  const idParam = useSearchParams().get("id");
  const id = teacher ? null : idParam;
  const existing = useApi<Notice>(id ? `/api/v1/school/notices/${id}` : null);
  const { classes: officeClasses } = useCurrentClasses(!teacher);
  const mine = useApi<MyClasses>(teacher ? "/api/v1/teacher/my-classes" : null);
  const summary = useApi<Summary>(teacher ? null : "/api/v1/school/event-ops/campaigns", { limit: 1 });
  const due = useApi<Due>(teacher ? null : "/api/v1/school/ops/scheduled-notices");

  const [audience, setAudience] = useState<NoticeAudience>(teacher ? "class_parents" : "all_parents");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [channels, setChannels] = useState<Set<Channel>>(new Set(["in_app"]));
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = existing.data;

  useEffect(() => {
    if (!n) return;
    setAudience(n.audience);
    setClassId(n.audience_class_id ? String(n.audience_class_id) : "");
    setSectionId(n.audience_section_id ? String(n.audience_section_id) : "");
    setChannels(new Set(n.channels));
  }, [n]);

  // Classes and sections this person may address.
  const classes = useMemo(() => {
    if (!teacher) return officeClasses.map((c) => ({ id: c.id, name: c.name, sections: c.sections.map((s) => ({ id: s.id, name: `${c.name} ${s.name}` })) }));
    const map = new Map<number, { id: number; name: string; sections: { id: number; name: string }[] }>();
    const add = (cid: number, cname: string, sid: number, sname: string) => {
      const c = map.get(cid) ?? { id: cid, name: cname, sections: [] };
      if (!c.sections.some((s) => s.id === sid)) c.sections.push({ id: sid, name: sname });
      map.set(cid, c);
    };
    mine.data?.class_teacher_of.forEach((c) => add(c.class_id, c.class_name, c.section_id, c.section_label));
    mine.data?.subject_teacher_of.forEach((c) => c.sections.forEach((s) => add(c.class_id, c.class_name, s.section_id, `${c.class_name} ${s.section_name}`)));
    return Array.from(map.values());
  }, [teacher, officeClasses, mine.data]);
  const allSections = classes.flatMap((c) => c.sections);
  const roster = useApi<RosterStudent[]>(teacher && audience === "single_parent" && sectionId ? `/api/v1/teacher/sections/${sectionId}/students` : null);

  if (id && existing.loading && !n) return <Loading what="Loading the notice…" />;
  if (n && n.status === "sent") {
    return <ErrorNote>This notice has already been sent, so it can no longer be edited. Its delivery is on Announcements.</ErrorNote>;
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const send = teacher || ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "send";
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    if (audience === "class_parents" && !classId) return setError("Choose the class.");
    if (audience === "section_parents" && !sectionId) return setError("Choose the section.");
    if (audience === "single_parent" && !studentId) return setError("Choose the student whose family should get this.");
    if (!teacher && !channels.size) return setError("Choose at least one channel.");
    const day = text("schedule_date");
    const time = text("schedule_time");
    const body: Record<string, unknown> = {
      title: text("title"),
      body: text("body"),
      audience,
      audience_class_id: audience === "class_parents" ? Number(classId) : null,
      audience_section_id: audience === "section_parents" ? Number(sectionId) : null,
      audience_student_id: audience === "single_parent" ? Number(studentId) : null,
      attachment_url: text("attachment_url"),
    };
    if (!teacher) {
      body.channels = Array.from(channels);
      body.scheduled_at = day ? new Date(`${day}T${time ?? "09:00"}`).toISOString() : null;
      // What it is about, and when/where for an event — shown as fields in the parent app.
      body.category = text("category") ?? "general";
      body.event_date = text("event_date");
      body.event_start_time = text("event_start_time");
      body.event_end_time = text("event_end_time");
      body.event_venue = text("event_venue");
    }
    if (send && !window.confirm(`Send "${body.title}" now?`)) return;
    setSaving(true);
    setError(null);
    try {
      if (teacher) {
        const r = await api.post<Notice>("/api/v1/teacher/notices", body);
        notify(`Handed to ${r.recipient_count} parent(s). ${deliveryLine(r.delivery)}.`);
        router.push(routeOf(252));
        return;
      }
      const saved = n ? await api.patch<Notice>(`/api/v1/school/notices/${n.id}`, body) : await api.post<Notice>("/api/v1/school/notices", body);
      if (send) {
        try {
          const r = await api.post<Notice>(`/api/v1/school/notices/${saved.id}/send`);
          notify(`Handed to ${r.recipient_count} recipient(s). ${deliveryLine(r.delivery)}.`);
        } catch (err) {
          notify(`Saved, but not sent: ${errorText(err)}`);
        }
      } else {
        notify(saved.status === "scheduled" ? "Saved as scheduled. It goes out when due notices are run." : "Saved as a draft.");
      }
      router.push(routeOf(252));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function runDue() {
    if (!window.confirm("Send every scheduled notice that is now due? They go to their audiences straight away.")) return;
    setRunning(true);
    try {
      const r = await api.post<RunResult>("/api/v1/school/ops/scheduled-notices/run");
      notify(r.failed_count ? `${r.sent_count} due notice(s) sent; ${r.failed_count} could not be sent: ${r.failed.map((x) => `${x.title} (${x.error})`).join("; ")}` : `${r.sent_count} due notice(s) sent.`);
      due.reload();
      summary.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setRunning(false);
    }
  }

  const field = (label: string, control: JSX.Element, required = false, full = false) => (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {label}
        {required ? <span className="req">*</span> : null}
      </span>
      {control}
    </label>
  );
  const scheduled = n?.scheduled_at ? new Date(n.scheduled_at) : null;
  const p = (x: number) => String(x).padStart(2, "0");

  return (
    <div className="two-col">
      <form id="campaign-form" className="panel" onSubmit={submit} key={n?.id ?? "new"}>
        <div className="panel-pad">
          <ErrorNote>{error ?? existing.error ?? mine.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                {field("Campaign name", <input name="title" required maxLength={200} defaultValue={n?.title} placeholder="Enter campaign name" />, true)}
                {teacher
                  ? field("Channel", <input value="In-app" readOnly />, true)
                  : field(
                      "Channel",
                      <div className="row" style={{ gap: 12, flexWrap: "wrap", minHeight: 43, alignItems: "center" }}>
                        {CHANNELS.map((c) => (
                          <label key={c} className="row" style={{ gap: 6 }}>
                            <input
                              type="checkbox"
                              checked={channels.has(c)}
                              onChange={(x) => {
                                const next = new Set(channels);
                                if (x.target.checked) next.add(c);
                                else next.delete(c);
                                setChannels(next);
                              }}
                            />
                            {CHANNEL_LABEL[c]}
                          </label>
                        ))}
                      </div>,
                      true,
                    )}
                {field(
                  "Audience",
                  <select
                    value={audience}
                    required
                    onChange={(x) => {
                      setAudience(x.target.value as NoticeAudience);
                      setStudentId("");
                    }}
                  >
                    {(teacher ? TEACHER_AUDIENCES : OFFICE_AUDIENCES).map((a) => (
                      <option key={a} value={a}>
                        {NOTICE_AUDIENCE[a]}
                      </option>
                    ))}
                  </select>,
                  true,
                )}
                {audience === "class_parents"
                  ? field(
                      "Class",
                      <select value={classId} required onChange={(x) => setClassId(x.target.value)}>
                        <option value="">Select class</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>,
                      true,
                    )
                  : null}
                {audience === "section_parents" || audience === "single_parent"
                  ? field(
                      "Section",
                      <select
                        value={sectionId}
                        required
                        onChange={(x) => {
                          setSectionId(x.target.value);
                          setStudentId("");
                        }}
                      >
                        <option value="">Select section</option>
                        {allSections.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>,
                      true,
                    )
                  : null}
                {audience === "single_parent"
                  ? field(
                      "Student",
                      <select value={studentId} required disabled={!sectionId} onChange={(x) => setStudentId(x.target.value)}>
                        <option value="">{roster.loading ? "Loading…" : "Select student"}</option>
                        {(roster.data ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {`${s.full_name} · ${s.admission_no}`}
                          </option>
                        ))}
                      </select>,
                      true,
                    )
                  : null}
                {field("Message", <textarea name="body" required defaultValue={n?.body} placeholder="Enter message" />, true, true)}
                {!teacher ? (
                  <>
                    {field("Schedule date", <input type="date" name="schedule_date" defaultValue={scheduled ? `${scheduled.getFullYear()}-${p(scheduled.getMonth() + 1)}-${p(scheduled.getDate())}` : ""} />)}
                    {field("Schedule time", <input type="time" name="schedule_time" defaultValue={scheduled ? `${p(scheduled.getHours())}:${p(scheduled.getMinutes())}` : ""} />)}
                    {field(
                      "Category",
                      <select name="category" defaultValue={n?.category ?? "general"}>
                        <option value="general">School updates</option>
                        <option value="events">Events</option>
                        <option value="exams">Exams</option>
                        <option value="homework">Homework</option>
                        <option value="attendance">Attendance</option>
                        <option value="fees">Fees</option>
                      </select>,
                    )}
                    {field("Event date", <input type="date" name="event_date" defaultValue={n?.event_date ?? ""} />)}
                    {field("Event starts", <input type="time" name="event_start_time" defaultValue={n?.event_start_time?.slice(0, 5) ?? ""} />)}
                    {field("Event ends", <input type="time" name="event_end_time" defaultValue={n?.event_end_time?.slice(0, 5) ?? ""} />)}
                    {field("Event venue", <input name="event_venue" maxLength={200} defaultValue={n?.event_venue ?? ""} placeholder="e.g. School auditorium" />)}
                  </>
                ) : null}
                {field("Attachment link", <input type="url" name="attachment_url" maxLength={500} defaultValue={n?.attachment_url ?? ""} placeholder="https://…" />, false, true)}
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
            {!teacher ? (
              <button type="submit" className="btn" value="draft" disabled={saving}>
                Save campaign
              </button>
            ) : null}
            <button type="submit" className="btn primary" value="send" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Working…" : "Send now"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>Communication</h3>
          {teacher ? (
            <p>Your notice goes in-app to the parents you choose, straight away. What each parent received is counted as the server reports it.</p>
          ) : (
            <>
              <dl className="kv">
                <div>
                  <dt>Sent</dt>
                  <dd>{summary.data?.sent ?? "…"}</dd>
                </div>
                <div>
                  <dt>Scheduled</dt>
                  <dd>{summary.data?.scheduled ?? "…"}</dd>
                </div>
                <div>
                  <dt>Drafts</dt>
                  <dd>{summary.data?.draft ?? "…"}</dd>
                </div>
                <div>
                  <dt>Past their time</dt>
                  <dd>{summary.data?.overdue ?? "…"}</dd>
                </div>
                <div>
                  <dt>Due to send now</dt>
                  <dd>{due.data?.count ?? "…"}</dd>
                </div>
              </dl>
              <div className="gap" />
              {summary.data && !summary.data.scheduler_running ? (
                <p>Nothing sends on a timer in this deployment. A scheduled notice goes out when due notices are run — by a job on the server or by the button below.</p>
              ) : null}
              {due.data?.due.length ? <p>{`Due: ${due.data.due.map((d) => `${d.title} (${dateTime(d.scheduled_at)})`).join(", ")}`}</p> : null}
              <div className="gap" />
              <button type="button" className="btn" disabled={running || !due.data?.count} onClick={runDue}>
                <Icon name="clock" className="sm" />
                {running ? "Sending…" : "Send due notices now"}
              </button>
              <div className="gap" />
              <p>Each channel’s result is reported as the server records it: sent, queued, skipped (no address on file) or failed.</p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
