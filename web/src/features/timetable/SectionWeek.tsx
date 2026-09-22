"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useHydrated, useSession } from "@/lib/useSession";
import { DAY_NAME, Lesson, Modal, Notice, WeekGrid, span, toneOf, useSectionPick, useYearClasses, weekLabel } from "./shared";
import type { Child, ClassSubject, Entry, ExamRoom, Period, SectionTimetable } from "./types";

/**
 * SCR-121 Timetable Setup (mode "edit") and SCR-125 Class Timetable (mode
 * "view"): one section's week.
 *
 * Edit: GET /school/sections/{id}/timetable, PUT/DELETE a slot, copy from
 * another section, publish / unpublish, and the school-wide teacher clash
 * report (GET /school/sections/clashes). View: the same GET for the office,
 * GET /parent/me/children/{id}/timetable for a parent, GET /student/timetable
 * for a student. ?section= preselects.
 */
export function SectionWeek({ mode }: { mode: "edit" | "view" }) {
  const hydrated = useHydrated();
  const role = useSession()?.user.role;
  if (!hydrated) return <Loading what="Loading the timetable…" />;
  if (mode === "view" && role === "parent") return <ChildWeek />;
  if (mode === "view" && role === "student") return <StudentWeek />;
  if (mode === "view" && role === "teacher") {
    return (
      <section className="panel">
        <div className="panel-pad">
          <p className="muted" style={{ marginBottom: 14 }}>
            Class timetables are kept by the school office. Your own week is under My timetable.
          </p>
          <Link href={routeOf(126)} className="btn primary">
            <Icon name="arrow" className="sm" />
            Open my timetable
          </Link>
        </div>
      </section>
    );
  }
  return <OfficeWeek mode={mode} />;
}

function OfficeWeek({ mode }: { mode: "edit" | "view" }) {
  const preset = Number(useSearchParams().get("section")) || null;
  const { year, classes } = useYearClasses();
  const pick = useSectionPick(classes.data, preset);
  const tt = useApi<SectionTimetable>(pick.sectionId ? `/api/v1/school/sections/${pick.sectionId}/timetable` : null);
  const clashes = useApi<Clash[]>(mode === "edit" ? "/api/v1/school/sections/clashes" : null);
  const subjects = useApi<ClassSubject[]>(mode === "edit" && pick.classId ? `/api/v1/school/classes/${pick.classId}/subjects` : null);
  const [editing, setEditing] = useState<{ period: Period; entry?: Entry } | null>(null);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [published, setPublished] = useState<string | null | undefined>(undefined);

  useEffect(() => setPublished(undefined), [pick.sectionId]);
  const publishedAt = published === undefined ? tt.data?.timetable_published_at : published;

  const byPeriod = useMemo(() => {
    const m = new Map<number, Entry>();
    tt.data?.entries.forEach((e) => m.set(e.period_id, e));
    return m;
  }, [tt.data]);

  const data = tt.data?.section_id === pick.sectionId ? tt.data : null;
  const lastDay = Math.max(5, ...(data?.periods.map((p) => p.day_of_week) ?? [5]));

  async function clear(p: Period) {
    if (!window.confirm(`Clear the lesson in ${p.label ?? `period ${p.period_number}`}?`)) return;
    try {
      await api.delete(`/api/v1/school/sections/${pick.sectionId}/timetable/${p.id}`);
      setNotice(`${p.label ?? `Period ${p.period_number}`} cleared.`);
      tt.reload();
      clashes.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function togglePublish() {
    if (!window.confirm(publishedAt ? "Unpublish this timetable? Parents and teachers stop seeing it." : "Publish this timetable? Parents and teachers see it straight away.")) return;
    try {
      const r = await api.post<SectionTimetable>(`/api/v1/school/sections/${pick.sectionId}/timetable/${publishedAt ? "unpublish" : "publish"}`);
      setPublished(r.timetable_published_at);
      notify(r.timetable_published_at ? "Published — parents and teachers can see it now." : "Unpublished.");
    } catch (e) {
      setError(errorText(e));
    }
  }

  const label = data?.section_label ?? (pick.cls && pick.section ? `${pick.cls.name} ${pick.section.name}` : "Choose a section");

  return (
    <>
      <div className="filterbar">
        <select aria-label="Class" value={pick.classId ?? ""} onChange={(e) => pick.pickClass(e.target.value ? Number(e.target.value) : null)}>
          {!classes.data?.length ? <option value="">{classes.loading ? "Loading classes…" : "No classes"}</option> : null}
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Section" value={pick.sectionId ?? ""} disabled={!pick.cls} onChange={(e) => pick.setSectionId(Number(e.target.value))}>
          {!pick.cls?.sections.length ? <option value="">No sections</option> : null}
          {pick.cls?.sections.map((s) => (
            <option key={s.id} value={s.id}>
              {`Section ${s.name}`}
            </option>
          ))}
        </select>
        {mode === "edit" && data ? (
          <>
            <button type="button" className="btn" onClick={() => setCopying(true)}>
              <Icon name="file" className="sm" />
              Copy from…
            </button>
            <button type="button" className="btn" onClick={togglePublish}>
              <Icon name="check" className="sm" />
              {publishedAt ? "Unpublish" : "Publish"}
            </button>
          </>
        ) : null}
      </div>
      <ErrorNote>{error ?? classes.error ?? tt.error ?? subjects.error}</ErrorNote>
      <Notice>{notice}</Notice>
      <Panel
        title={weekLabel(lastDay)}
        sub={`${label}${year ? ` · Academic year ${year.name}` : ""}${data ? ` · ${data.entries.length} lessons placed` : ""}`}
        action={data ? <span className={`badge ${publishedAt ? "blue" : "warn"}`}>{publishedAt ? "Published" : "Draft"}</span> : undefined}
        flush
      >
        <div className="table-wrap">
          {!pick.sectionId ? (
            <div className="panel-pad muted">{classes.loading ? "Loading classes…" : "No section to show. Add sections under Academics first."}</div>
          ) : !data ? (
            <div className="panel-pad muted">{tt.loading ? "Loading the timetable…" : "The timetable could not be loaded."}</div>
          ) : (
            <WeekGrid
              slots={data.periods}
              empty={
                <>
                  No periods set up yet. Add them in <Link href={routeOf(122)}>Period setup</Link>.
                </>
              }
              cell={(_, p) => {
                if (!p) return null;
                if (p.is_break) return <Lesson tone="peach" title={p.label ?? "Break"} lines={[span(p.start_time, p.end_time)]} />;
                const e = byPeriod.get(p.id);
                if (mode === "view") return e ? <Lesson tone={toneOf(e.class_subject_id)} title={e.subject_name} lines={[e.teacher_name ?? "No teacher", e.room_name]} /> : null;
                return e ? (
                  <>
                    <Lesson tone={toneOf(e.class_subject_id)} title={e.subject_name} lines={[e.teacher_name ?? "No teacher", e.room_name ?? "Own classroom"]} onClick={() => setEditing({ period: p, entry: e })} />
                    <button type="button" className="btn text" style={{ fontSize: 11 }} onClick={() => clear(p)}>
                      Clear
                    </button>
                  </>
                ) : (
                  <button type="button" className="kanban-add" style={{ minHeight: 86 }} onClick={() => setEditing({ period: p })}>
                    + Add lesson
                  </button>
                );
              }}
            />
          )}
        </div>
        {data ? (
          <div className="table-footer">
            <span>{`${data.entries.length} lesson(s) placed`}</span>
            <span className="muted">{publishedAt ? `Published ${dateTime(publishedAt)} · parents and teachers can see this` : "Draft — not visible outside the office"}</span>
          </div>
        ) : null}
      </Panel>
      {mode === "edit" ? <ClashPanel
          clashes={clashes.data}
          loading={clashes.loading}
          error={clashes.error}
          onOpen={(sid) => {
            const owner = classes.data?.find((c) => c.sections.some((x) => x.id === sid));
            if (!owner) return;
            pick.pickClass(owner.id);
            pick.setSectionId(sid);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        /> : null}
      {editing && pick.sectionId ? (
        <AssignModal
          sectionId={pick.sectionId}
          period={editing.period}
          entry={editing.entry}
          subjects={subjects.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            notify("Lesson saved.");
            tt.reload();
            clashes.reload();
          }}
        />
      ) : null}
      {copying && pick.sectionId && pick.cls ? (
        <CopyModal
          sectionId={pick.sectionId}
          others={pick.cls.sections.filter((s) => s.id !== pick.sectionId)}
          onClose={() => setCopying(false)}
          onDone={() => {
            setCopying(false);
            notify("Timetable copied.");
            tt.reload();
            clashes.reload();
          }}
        />
      ) : null}
    </>
  );
}

/** GET /school/sections/clashes: one teacher timetabled in two sections at the same day and period. */
type Clash = {
  teacher_user_id: number;
  teacher_name: string | null;
  day_of_week: number;
  period_number: number;
  sections: { section_id: number; section_label: string; subject_name: string; teacher_name: string | null }[];
};

function ClashPanel({ clashes, loading, error, onOpen }: { clashes: Clash[] | null; loading: boolean; error: string | null; onOpen: (sectionId: number) => void }) {
  return (
    <>
      <div className="gap" />
      <Panel title="Teacher clashes" sub={clashes ? `${clashes.length} across the whole school` : "A teacher placed in two sections at the same time"}>
        {error ? (
          <p className="muted">{error}</p>
        ) : clashes?.length ? (
          clashes.map((c, i) => (
            <div className="timeline-item" key={`${c.teacher_user_id}-${c.day_of_week}-${c.period_number}-${i}`}>
              <span className="timeline-dot">
                <Icon name="bell" />
              </span>
              <div>
                <h4>{`${c.teacher_name ?? "A teacher"} · ${DAY_NAME[c.day_of_week] ?? `Day ${c.day_of_week}`}, period ${c.period_number}`}</h4>
                <p>
                  {c.sections.map((s, j) => (
                    <span key={s.section_id}>
                      {j ? ", " : ""}
                      <button type="button" className="btn text" style={{ padding: 0 }} onClick={() => onOpen(s.section_id)}>
                        {s.section_label}
                      </button>
                      {` (${s.subject_name})`}
                    </span>
                  ))}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="muted">{loading ? "Checking for clashes…" : "No clashes. Every teacher is in one section at a time."}</p>
        )}
      </Panel>
    </>
  );
}

/** PUT /school/sections/{id}/timetable/{period_id}: a subject, and a room if not their own. */
function AssignModal({ sectionId, period, entry, subjects, onClose, onSaved }: { sectionId: number; period: Period; entry?: Entry; subjects: ClassSubject[]; onClose: () => void; onSaved: () => void }) {
  const rooms = useApi<ExamRoom[]>("/api/v1/school/exam-ops/rooms");
  const [csId, setCsId] = useState<number | "">(entry?.class_subject_id ?? "");
  const [roomId, setRoomId] = useState<number | "">(entry?.room_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!csId) return;
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/v1/school/sections/${sectionId}/timetable/${period.id}`, { class_subject_id: csId, room_id: roomId === "" ? null : roomId });
      onSaved();
    } catch (err) {
      // A 409 names the other class the teacher is already in.
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`${period.label ?? `Period ${period.period_number}`} · ${span(period.start_time, period.end_time)}`} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <label className="field">
            <span>
              Subject<span className="req">*</span>
            </span>
            <select value={csId} required onChange={(e) => setCsId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Select subject</option>
              {subjects.map((cs) => (
                <option key={cs.id} value={cs.id}>
                  {`${cs.subject.name} (${cs.subject.code})${cs.teacher_user_id ? "" : " — no teacher"}`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Room</span>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Their own classroom</option>
              {rooms.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {`${r.name}${r.capacity ? ` — seats ${r.capacity}` : ""}`}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!subjects.length ? <p className="muted">No subjects are assigned to this class yet. Add them under Academics first.</p> : null}
        <div className="actions row">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving || !csId}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Save lesson"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** POST /school/sections/{id}/timetable/copy */
function CopyModal({ sectionId, others, onClose, onDone }: { sectionId: number; others: { id: number; name: string }[]; onClose: () => void; onDone: () => void }) {
  const [source, setSource] = useState<number | "">("");
  const [overwrite, setOverwrite] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!source) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/sections/${sectionId}/timetable/copy`, { source_section_id: source, overwrite });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Copy from another section" onClose={onClose}>
      {!others.length ? (
        <>
          <p>No other sections in this class to copy from.</p>
          <div className="actions row">
            <button type="button" className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <ErrorNote>{error}</ErrorNote>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
            <label className="field">
              <span>
                Source section<span className="req">*</span>
              </span>
              <select value={source} required onChange={(e) => setSource(e.target.value ? Number(e.target.value) : "")}>
                <option value="">Select section</option>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {`Section ${s.name}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="row" style={{ gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              Overwrite what is already in this section
            </label>
          </div>
          <p>A slot that would double-book a teacher is skipped rather than copied, so the result may be short of the source.</p>
          <div className="actions row">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving || !source}>
              <Icon name="check" className="sm" />
              {saving ? "Copying…" : "Copy"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** A student's own class week: GET /student/timetable (published timetables only). */
function StudentWeek() {
  const tt = useApi<SectionTimetable>("/api/v1/student/timetable");
  const data = tt.data;
  const byPeriod = new Map<number, Entry>();
  data?.entries.forEach((e) => byPeriod.set(e.period_id, e));
  const unpublished = tt.error === "Timetable is not published yet";
  const noClass = tt.error === "You are not in a class yet";
  return (
    <>
      <ErrorNote>{unpublished || noClass ? null : tt.error}</ErrorNote>
      <Panel title={weekLabel()} sub={data ? `Your class · ${data.section_label}` : "Your class"} action={data ? <span className="badge blue">Published</span> : undefined} flush>
        <div className="table-wrap">
          {unpublished ? (
            <div className="panel-pad muted">The school hasn&apos;t published your class timetable yet. Check back soon.</div>
          ) : noClass ? (
            <div className="panel-pad muted">You haven&apos;t been placed in a class yet. Ask the school office.</div>
          ) : !data ? (
            <div className="panel-pad muted">{tt.loading ? "Loading the timetable…" : "No timetable to show."}</div>
          ) : (
            <WeekGrid
              slots={data.periods}
              empty="No periods have been set up yet."
              cell={(_, p) => {
                if (!p) return null;
                if (p.is_break) return <Lesson tone="peach" title={p.label ?? "Break"} lines={[span(p.start_time, p.end_time)]} />;
                const e = byPeriod.get(p.id);
                return e ? <Lesson tone={toneOf(e.subject_code)} title={e.subject_name} lines={[e.teacher_name]} /> : null;
              }}
            />
          )}
        </div>
      </Panel>
    </>
  );
}

/** A parent's view: GET /parent/me/children, then that child's published week. */
function ChildWeek() {
  const children = useApi<Child[]>("/api/v1/parent/me/children");
  const [childId, setChildId] = useState<number | null>(null);
  useEffect(() => {
    if (childId === null && children.data?.length) setChildId(children.data[0].id);
  }, [children.data, childId]);
  const tt = useApi<SectionTimetable>(childId ? `/api/v1/parent/me/children/${childId}/timetable` : null);
  const child = children.data?.find((c) => c.id === childId);
  const data = tt.data;
  const byPeriod = new Map<number, Entry>();
  data?.entries.forEach((e) => byPeriod.set(e.period_id, e));
  const unpublished = tt.error === "Timetable is not published yet";

  return (
    <>
      <div className="filterbar">
        <select aria-label="Child" value={childId ?? ""} onChange={(e) => setChildId(Number(e.target.value))}>
          {children.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{children.error ?? (unpublished ? null : tt.error)}</ErrorNote>
      <Panel title={weekLabel()} sub={child ? `${child.full_name} · ${child.section_label ?? "—"}` : "Your child's class"} action={data ? <span className="badge blue">Published</span> : undefined} flush>
        <div className="table-wrap">
          {unpublished ? (
            <div className="panel-pad muted">The school hasn&apos;t published this timetable yet. Check back soon.</div>
          ) : !data ? (
            <div className="panel-pad muted">{tt.loading || children.loading ? "Loading the timetable…" : "No timetable to show."}</div>
          ) : (
            <WeekGrid
              slots={data.periods}
              empty="No periods have been set up yet."
              cell={(_, p) => {
                if (!p) return null;
                if (p.is_break) return <Lesson tone="peach" title={p.label ?? "Break"} lines={[span(p.start_time, p.end_time)]} />;
                const e = byPeriod.get(p.id);
                return e ? <Lesson tone={toneOf(e.subject_code)} title={e.subject_name} lines={[e.teacher_name]} /> : null;
              }}
            />
          )}
        </div>
      </Panel>
    </>
  );
}
