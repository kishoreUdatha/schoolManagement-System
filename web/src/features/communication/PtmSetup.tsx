"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { type PtmDetail, type PtmSession, type TeacherPtm, hhmm, isoDay, useCurrentClasses, useRole } from "./shared";

type StaffRow = { user_id: number; full_name: string; role: string };
type Scope = { section_id: number; class_id: number; label: string };

/** datetime-local value from an ISO timestamp, in the viewer's zone. */
function localInput(v: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Slots each teacher gets for a window and slot length. */
function slotCount(start: string, end: string, minutes: number): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some(Number.isNaN) || !minutes) return 0;
  return Math.max(0, Math.floor((eh * 60 + em - sh * 60 - sm) / minutes));
}

/**
 * SCR-250 PTM Setup. A teacher arranges a meeting for a class they are
 * class teacher of (POST /api/v1/teacher/ptm/sessions?section_id=, then
 * /sessions/{id}/publish); the office arranges one for any scope and adds
 * teachers (POST /api/v1/school/ptm, /ptm/{id}/teachers, /ptm/{id}/publish).
 */
export function PtmSetup() {
  const role = useRole();
  if (role === null) return <Loading />;
  if (role === "teacher") return <TeacherSetup />;
  if (role === "school_admin") return <OfficeSetup />;
  return <ErrorNote>Parent-teacher meetings are arranged by the school office or a class teacher.</ErrorNote>;
}

const field = (text: string, control: JSX.Element, required = false, full = false) => (
  <label className={`field ${full ? "full" : ""}`}>
    <span>
      {text}
      {required ? <span className="req">*</span> : null}
    </span>
    {control}
  </label>
);

function readTimes(f: FormData) {
  const text = (k: string) => String(f.get(k) ?? "").trim() || null;
  const closes = text("booking_closes_at");
  return {
    title: text("title"),
    meeting_date: text("meeting_date"),
    start_time: text("start_time"),
    end_time: text("end_time"),
    slot_minutes: Number(text("slot_minutes") ?? 10),
    venue: text("venue"),
    notes: text("notes"),
    booking_closes_at: closes ? new Date(closes).toISOString() : null,
  };
}

function Footer({ saving, canPublish, onCancel }: { saving: boolean; canPublish: boolean; onCancel: () => void }) {
  return (
    <div className="form-footer">
      <span>Fields marked * are required</span>
      <div className="actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn" value="draft" disabled={saving}>
          Save draft
        </button>
        {canPublish ? (
          <button type="submit" className="btn primary" value="publish" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Publish PTM"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Aside({ title, sessions, loading, hrefFor }: { title: string; sessions: PtmSession[]; loading: boolean; hrefFor: (s: PtmSession) => string }) {
  return (
    <aside className="stack">
      <div className="aside-panel">
        <h3>{title}</h3>
        {sessions.length ? (
          sessions.map((s) => (
            <div className="timeline-item" key={s.id}>
              <span className="timeline-dot">
                <Icon name="calendar" />
              </span>
              <div>
                <h4>
                  <Link href={hrefFor(s)}>{s.title}</Link>
                </h4>
                <p>{`${date(s.meeting_date)} · ${hhmm(s.start_time)}–${hhmm(s.end_time)} · ${s.scope_label} · ${s.booked_count}/${s.slot_count} booked`}</p>
              </div>
              <Badge>{s.is_published ? "Published" : "Draft"}</Badge>
            </div>
          ))
        ) : (
          <p>{loading ? "Loading…" : "No meetings arranged yet."}</p>
        )}
        <div className="gap" />
        <p>A draft is invisible to families. Publishing is what opens booking and notifies parents.</p>
      </div>
    </aside>
  );
}

function OfficeSetup() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const list = useApi<PtmSession[]>("/api/v1/school/ptm");
  const existing = useApi<PtmDetail>(id ? `/api/v1/school/ptm/${id}` : null);
  const staff = useApi<StaffRow[]>("/api/v1/school/directory/staff");
  const { classes } = useCurrentClasses();
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [teachers, setTeachers] = useState<string[]>([]);
  const [times, setTimes] = useState({ start: "09:00", end: "12:00", minutes: 10 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = existing.data;
  useEffect(() => {
    if (!s) return;
    setClassId(s.class_id ? String(s.class_id) : "");
    setSectionId(s.section_id ? String(s.section_id) : "");
    setTimes({ start: s.start_time.slice(0, 5), end: s.end_time.slice(0, 5), minutes: s.slot_minutes });
  }, [s]);

  if (id && existing.loading && !s) return <Loading what="Loading the meeting…" />;
  const inSession = new Set(s?.teachers.map((t) => t.teacher_user_id) ?? []);
  const available = (staff.data ?? []).filter((x) => (x.role === "teacher" || x.role === "principal") && !inSession.has(x.user_id));
  const sections = classes.find((c) => String(c.id) === classId)?.sections ?? [];
  const locked = Boolean(s && s.teacher_count > 0);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const publish = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "publish";
    const body = { ...readTimes(new FormData(e.currentTarget)), class_id: classId ? Number(classId) : null, section_id: sectionId ? Number(sectionId) : null };
    if (publish && !s?.teacher_count && !teachers.length) return setError("Add at least one teacher before publishing, so parents have slots to book.");
    setSaving(true);
    setError(null);
    try {
      const saved = s ? await api.put<PtmSession>(`/api/v1/school/ptm/${s.id}`, body) : await api.post<PtmSession>("/api/v1/school/ptm", body);
      const done: string[] = [s ? "Meeting updated." : "Meeting saved as a draft."];
      if (teachers.length) {
        try {
          await api.post(`/api/v1/school/ptm/${saved.id}/teachers`, { user_ids: teachers.map(Number) });
          done.push(`${teachers.length} teacher(s) added with their slots.`);
        } catch (err) {
          done.push(`Teachers were not added: ${errorText(err)}`);
        }
      }
      if (publish && !saved.is_published) {
        try {
          await api.post(`/api/v1/school/ptm/${saved.id}/publish`);
          done.push("Published: parents and teachers are notified.");
        } catch (err) {
          done.push(`Not published: ${errorText(err)}`);
        }
      }
      notify(done.join(" "));
      setTeachers([]);
      router.replace(`${routeOf(250)}?id=${saved.id}`);
      existing.reload();
      list.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="two-col">
      <form id="ptm-form" className="panel" onSubmit={submit} key={s?.id ?? "new"}>
        <div className="panel-pad">
          <ErrorNote>{error ?? list.error ?? existing.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                {field("Meeting title", <input name="title" required minLength={2} maxLength={200} defaultValue={s?.title} placeholder="Enter meeting title" />, true)}
                {field("Date", <input type="date" name="meeting_date" required min={s ? undefined : isoDay(new Date())} disabled={locked} defaultValue={s?.meeting_date} />, true)}
                {field(
                  "Classes",
                  <select
                    value={classId}
                    onChange={(x) => {
                      setClassId(x.target.value);
                      setSectionId("");
                    }}
                  >
                    <option value="">Whole school</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>,
                  true,
                )}
                {field(
                  "Section",
                  <select value={sectionId} disabled={!classId} onChange={(x) => setSectionId(x.target.value)}>
                    <option value="">All sections</option>
                    {sections.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>,
                )}
                {field(
                  s ? "Add teachers" : "Teachers",
                  <select multiple value={teachers} onChange={(x) => setTeachers(Array.from(x.target.selectedOptions, (o) => o.value))} style={{ minHeight: 96 }}>
                    {available.map((t) => (
                      <option key={t.user_id} value={t.user_id}>
                        {t.role === "principal" ? `${t.full_name} (principal)` : t.full_name}
                      </option>
                    ))}
                  </select>,
                  !s,
                )}
                {field(
                  "Slot duration (minutes)",
                  <input type="number" name="slot_minutes" min={5} max={120} disabled={locked} value={times.minutes} onChange={(x) => setTimes({ ...times, minutes: Number(x.target.value) })} />,
                )}
                {field("Start time", <input type="time" name="start_time" required disabled={locked} value={times.start} onChange={(x) => setTimes({ ...times, start: x.target.value })} />, true)}
                {field("End time", <input type="time" name="end_time" required disabled={locked} value={times.end} onChange={(x) => setTimes({ ...times, end: x.target.value })} />, true)}
                {field("Booking deadline", <input type="datetime-local" name="booking_closes_at" defaultValue={localInput(s?.booking_closes_at ?? null)} />)}
                {field("Venue", <input name="venue" maxLength={200} defaultValue={s?.venue ?? ""} placeholder="Enter venue" />)}
                {field("Notes for parents", <textarea name="notes" maxLength={5000} defaultValue={s?.notes ?? ""} placeholder="Anything parents should know" />, false, true)}
              </div>
              {locked ? (
                <>
                  {/* Disabled inputs are not submitted; send the locked values as they are. */}
                  <input type="hidden" name="meeting_date" value={s?.meeting_date} />
                  <input type="hidden" name="start_time" value={times.start} />
                  <input type="hidden" name="end_time" value={times.end} />
                  <input type="hidden" name="slot_minutes" value={times.minutes} />
                </>
              ) : null}
              <p className="muted small" style={{ marginTop: 12 }}>
                {`${slotCount(times.start, times.end, times.minutes)} slot(s) per teacher.${locked ? " Date, times and slot length are locked once teachers are added." : ""}${s ? ` Teachers in this meeting: ${s.teachers.map((t) => t.teacher_name).join(", ") || "none yet"}.` : ""}`}
              </p>
            </section>
          </div>
        </div>
        <Footer saving={saving} canPublish={!s?.is_published} onCancel={() => router.back()} />
      </form>
      <Aside title="Meetings" sessions={list.data ?? []} loading={list.loading} hrefFor={(x) => `${routeOf(250)}?id=${x.id}`} />
    </div>
  );
}

function TeacherSetup() {
  const router = useRouter();
  const mine = useApi<TeacherPtm[]>("/api/v1/teacher/ptm");
  const scopes = useApi<Scope[]>("/api/v1/teacher/ptm/my-classes");
  const [sectionId, setSectionId] = useState("");
  const [times, setTimes] = useState({ start: "16:00", end: "17:00", minutes: 10 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sectionId && scopes.data?.length) setSectionId(String(scopes.data[0].section_id));
  }, [scopes.data, sectionId]);

  if (scopes.data && !scopes.data.length) {
    return (
      <div className="two-col">
        <section className="panel">
          <div className="panel-pad muted">You are not class teacher of any section, so arranging a parent-teacher meeting is the school office’s to do.</div>
        </section>
        <Aside title="Your meetings" sessions={mine.data ?? []} loading={mine.loading} hrefFor={() => routeOf(251)} />
      </div>
    );
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const publish = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "publish";
    if (!sectionId) return setError("Choose your class.");
    setSaving(true);
    setError(null);
    const form = e.currentTarget;
    try {
      const saved = await api.post<PtmDetail>("/api/v1/teacher/ptm/sessions", readTimes(new FormData(form)), { section_id: sectionId });
      if (publish) {
        try {
          await api.post(`/api/v1/teacher/ptm/sessions/${saved.id}/publish`);
          notify("Arranged and published: parents can now book.");
        } catch (err) {
          notify(`Arranged as a draft, but not published: ${errorText(err)}`);
        }
      } else {
        notify("Arranged as a draft. Parents cannot book until it is published.");
      }
      form.reset();
      mine.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="two-col">
      <form id="ptm-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? scopes.error ?? mine.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                {field("Meeting title", <input name="title" required minLength={2} maxLength={200} placeholder="Enter meeting title" />, true)}
                {field("Date", <input type="date" name="meeting_date" required min={isoDay(new Date())} />, true)}
                {field(
                  "Classes",
                  <select value={sectionId} required onChange={(x) => setSectionId(x.target.value)}>
                    {(scopes.data ?? []).map((x) => (
                      <option key={x.section_id} value={x.section_id}>
                        {x.label}
                      </option>
                    ))}
                  </select>,
                  true,
                )}
                {field("Teachers", <input value="You (class teacher)" readOnly />, true)}
                {field("Slot duration (minutes)", <input type="number" name="slot_minutes" min={5} max={120} value={times.minutes} onChange={(x) => setTimes({ ...times, minutes: Number(x.target.value) })} />)}
                {field("Start time", <input type="time" name="start_time" required value={times.start} onChange={(x) => setTimes({ ...times, start: x.target.value })} />, true)}
                {field("End time", <input type="time" name="end_time" required value={times.end} onChange={(x) => setTimes({ ...times, end: x.target.value })} />, true)}
                {field("Booking deadline", <input type="datetime-local" name="booking_closes_at" />)}
                {field("Venue", <input name="venue" maxLength={200} placeholder="Your classroom" />)}
                {field("Notes for parents", <textarea name="notes" maxLength={5000} placeholder="Anything parents should know" />, false, true)}
              </div>
              <p className="muted small" style={{ marginTop: 12 }}>{`${slotCount(times.start, times.end, times.minutes)} slot(s) will be made for you across that window.`}</p>
            </section>
          </div>
        </div>
        <Footer saving={saving} canPublish onCancel={() => router.back()} />
      </form>
      <Aside title="Your meetings" sessions={mine.data ?? []} loading={mine.loading} hrefFor={() => routeOf(251)} />
    </div>
  );
}
