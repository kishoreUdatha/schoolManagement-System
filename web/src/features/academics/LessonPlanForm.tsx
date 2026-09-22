"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { planStatusText } from "./LessonPlanList";
import { todayIso } from "./planKit";
import type { ClassSubject, LessonPlan, SyllabusDetail } from "./planTypes";

const base = "/api/v1/school/lesson-plans";

/**
 * SCR-103, live. New plan: POST /lesson-plans. ?id=: PUT /lesson-plans/{id},
 * plus submit, deliver and delete. There is no single-plan GET, so the plan
 * is found in the teacher's own list.
 */
export function LessonPlanForm() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const plans = useApi<LessonPlan[]>(id ? base : null);
  const syllabus = useApi<ClassSubject[]>("/api/v1/school/syllabus");
  const plan = id ? plans.data?.find((p) => String(p.id) === id) : undefined;
  // Only the teacher who wrote a plan can submit, mark taught or delete it
  // (the API refuses anyone else), so reviewers don't get those buttons.
  const myId = useSession()?.user.id;
  const mine = Boolean(plan && plan.teacher_user_id === myId);

  const [csId, setCsId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [unit, setUnit] = useState("");
  const [topicIds, setTopicIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taughtOn, setTaughtOn] = useState(todayIso());
  const [note, setNote] = useState("");
  const [loadedId, setLoadedId] = useState<number | null>(null);

  // Subjects this person may plan for; an existing plan's subject stays listed.
  const subjects = useMemo(() => (syllabus.data ?? []).filter((s) => s.can_edit || s.class_subject_id === plan?.class_subject_id), [syllabus.data, plan]);

  useEffect(() => {
    if (plan && loadedId !== plan.id) {
      setLoadedId(plan.id);
      setCsId(plan.class_subject_id);
      setSectionId(plan.section_id);
      setTopicIds(new Set(plan.topics.map((t) => t.id)));
    } else if (!id && csId === null && subjects.length) {
      setCsId(subjects[0].class_subject_id);
      setSectionId(subjects[0].sections[0]?.section_id ?? null);
    }
  }, [plan, loadedId, id, csId, subjects]);

  const detail = useApi<SyllabusDetail>(csId ? `/api/v1/school/syllabus/${csId}` : null);
  const cs = subjects.find((s) => s.class_subject_id === csId);
  const chapters = detail.data?.items ?? [];
  const shownChapters = unit ? chapters.filter((c) => String(c.id) === unit) : chapters;

  if (id && plans.loading && !plans.data) return <Loading what="Loading the lesson plan…" />;
  if (id && plans.data && !plan) return <ErrorNote>This lesson plan was not found among the plans you can see.</ErrorNote>;
  const locked = Boolean(plan?.delivered_on);

  async function run(fn: () => Promise<unknown>, done: string, then?: () => void) {
    setSaving(true);
    setError(null);
    try {
      await fn();
      notify(done);
      if (then) then();
      else plans.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    if (!csId || !sectionId) {
      setError("Choose a subject and a section.");
      return;
    }
    const body = {
      class_subject_id: csId,
      section_id: sectionId,
      plan_date: text("plan_date"),
      periods: Number(text("periods") ?? 1),
      title: text("title"),
      objectives: text("objectives"),
      activities: text("activities"),
      resources: text("resources"),
      assessment: text("assessment"),
      homework: text("homework"),
      topic_ids: Array.from(topicIds),
    };
    if (plan) {
      await run(() => api.put(`${base}/${plan.id}`, body), "Lesson plan updated.");
    } else {
      setSaving(true);
      setError(null);
      try {
        const created = await api.post<LessonPlan>(base, body);
        notify("Draft saved. Submit it for review when it is ready.");
        router.replace(`${routeOf(103)}?id=${created.id}`);
      } catch (err) {
        setError(errorText(err));
      } finally {
        setSaving(false);
      }
    }
  }

  const field = (labelText: string, control: JSX.Element, required = false, full = false) => (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {labelText}
        {required ? <span className="req">*</span> : null}
      </span>
      {control}
    </label>
  );

  const ready = !id || plan;
  return (
    <div className="two-col">
      <form id="lesson-plan-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? syllabus.error ?? plans.error}</ErrorNote>
          {!syllabus.loading && !subjects.length ? (
            <div className="tip warn" style={{ marginBottom: 16 }}>
              <Icon name="bell" className="sm" />
              <span>You are not assigned as a subject teacher yet, so there is nothing to plan for.</span>
            </div>
          ) : null}
          {locked ? (
            <div className="tip" style={{ marginBottom: 16 }}>
              <Icon name="check" className="sm" />
              <span>{`Taught on ${date(plan?.delivered_on)}. A taught plan can no longer be changed.`}</span>
            </div>
          ) : null}
          {ready ? (
            <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}>
              <div className="form-sections">
                <section>
                  <div className="form-section-title">
                    <span className="number">01</span>
                    <h3>Lesson details</h3>
                  </div>
                  <div className="form-grid">
                    {field("Lesson title", <input type="text" name="title" required minLength={2} defaultValue={plan?.title} placeholder="Enter lesson title" />, true)}
                    {field(
                      "Subject",
                      <select
                        required
                        value={csId ?? ""}
                        onChange={(e) => {
                          const next = subjects.find((s) => String(s.class_subject_id) === e.target.value);
                          setCsId(next?.class_subject_id ?? null);
                          setSectionId(next?.sections[0]?.section_id ?? null);
                          setUnit("");
                          setTopicIds(new Set());
                        }}
                      >
                        <option value="">{syllabus.loading ? "Loading subjects…" : "Choose a subject"}</option>
                        {subjects.map((s) => (
                          <option key={s.class_subject_id} value={s.class_subject_id}>
                            {`${s.subject_name} · ${s.class_name}`}
                          </option>
                        ))}
                      </select>,
                      true,
                    )}
                    {field(
                      "Class",
                      <select required value={sectionId ?? ""} onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}>
                        <option value="">Choose a section</option>
                        {(cs?.sections ?? []).map((s) => (
                          <option key={s.section_id} value={s.section_id}>
                            {s.section_label}
                          </option>
                        ))}
                      </select>,
                      true,
                    )}
                    {field(
                      "Unit",
                      <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                        <option value="">{chapters.length ? "All units" : detail.loading ? "Loading units…" : "No units in this syllabus yet"}</option>
                        {chapters.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>,
                    )}
                    {shownChapters.some((c) => c.topics.length) ? (
                      <div className="field full">
                        <span>{`Topics covered · ${topicIds.size} chosen`}</span>
                        <div className="checklist" style={{ maxHeight: 220, overflow: "auto" }}>
                          {shownChapters.map((c) =>
                            c.topics.map((t) => (
                              <div className="check-item" key={t.id}>
                                <input
                                  type="checkbox"
                                  id={`topic-${t.id}`}
                                  checked={topicIds.has(t.id)}
                                  onChange={(e) => {
                                    const n = new Set(topicIds);
                                    if (e.target.checked) n.add(t.id);
                                    else n.delete(t.id);
                                    setTopicIds(n);
                                  }}
                                />
                                <label htmlFor={`topic-${t.id}`}>
                                  {t.title}
                                  <small>{c.title}</small>
                                </label>
                              </div>
                            )),
                          )}
                        </div>
                      </div>
                    ) : null}
                    {field("Learning objectives", <textarea name="objectives" defaultValue={plan?.objectives ?? ""} placeholder="Enter learning objectives" />, false, true)}
                    {field("Teaching method", <textarea name="activities" defaultValue={plan?.activities ?? ""} placeholder="Activities and how the lesson will run" />, false, true)}
                  </div>
                </section>
                <section>
                  <div className="form-section-title">
                    <span className="number">02</span>
                    <h3>Resources, assessment & schedule</h3>
                  </div>
                  <div className="form-grid">
                    {field("Resources", <input type="text" name="resources" defaultValue={plan?.resources ?? ""} placeholder="Textbook pages, worksheets, links" />)}
                    {field("Assessment", <input type="text" name="assessment" defaultValue={plan?.assessment ?? ""} placeholder="Enter assessment" />)}
                    {field("Planned date", <input type="date" name="plan_date" required defaultValue={plan?.plan_date ?? todayIso()} />, true)}
                    {field("Periods", <input type="number" name="periods" min={1} max={20} required defaultValue={plan?.periods ?? 1} placeholder="Enter periods" />, true)}
                    {field("Homework", <input type="text" name="homework" defaultValue={plan?.homework ?? ""} placeholder="Homework to set after the lesson" />, false, true)}
                  </div>
                </section>
              </div>
            </fieldset>
          ) : null}
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="button" className="btn" onClick={() => router.push(routeOf(102))}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving || locked || !subjects.length}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save lesson plan"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <Panel title="Publishing">
          <dl className="kv">
            <div>
              <dt>Class</dt>
              <dd>{cs?.class_name ?? "—"}</dd>
            </div>
            <div>
              <dt>Section</dt>
              <dd>{cs?.sections.find((s) => s.section_id === sectionId)?.section_label ?? "—"}</dd>
            </div>
            <div>
              <dt>Subject</dt>
              <dd>{cs?.subject_name ?? "—"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{plan ? <Badge>{planStatusText(plan)}</Badge> : "New draft"}</dd>
            </div>
          </dl>
          {plan?.review_comment ? (
            <p className="muted" style={{ marginTop: 12 }}>{`${plan.reviewed_by_name ?? "Reviewer"}: ${plan.review_comment}`}</p>
          ) : null}
        </Panel>
        {plan && mine && !plan.delivered_on ? (
          <Panel title="Next steps">
            <div className="stack">
              {plan.status === "draft" || plan.status === "returned" ? (
                <button type="button" className="btn primary" disabled={saving} onClick={() => run(() => api.post(`${base}/${plan.id}/submit`), "Submitted for review.")}>
                  <Icon name="arrow" className="sm" />
                  Submit for review
                </button>
              ) : null}
              {plan.status !== "returned" ? (
                <>
                  <label className="field">
                    <span>Taught on</span>
                    <input type="date" value={taughtOn} onChange={(e) => setTaughtOn(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>How did it go?</span>
                    <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
                  </label>
                  <button
                    type="button"
                    className="btn"
                    disabled={saving || !taughtOn}
                    onClick={() => run(() => api.post(`${base}/${plan.id}/deliver`, { delivered_on: taughtOn, note: note.trim() || null }), "Recorded. Its topics are now marked as taught.")}
                  >
                    <Icon name="check" className="sm" />
                    Mark taught
                  </button>
                </>
              ) : null}
              <button
                type="button"
                className="btn"
                disabled={saving}
                onClick={() => window.confirm("Delete this lesson plan?") && run(() => api.delete(`${base}/${plan.id}`), "Lesson plan deleted.", () => router.push(routeOf(102)))}
              >
                Delete plan
              </button>
            </div>
          </Panel>
        ) : null}
      </aside>
    </div>
  );
}
