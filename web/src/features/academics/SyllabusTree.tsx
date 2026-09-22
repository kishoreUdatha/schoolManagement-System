"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Dialog, DialogActions, Field, Kv, YearSelect, usePageAction, useYears } from "./setupKit";
import type { Chapter, ClassSubjectSummary, CopySource, SyllabusDetail, Topic } from "./types";

import { ask, askText } from "@/lib/dialog";
const BASE = "/api/v1/school/syllabus";

type ChapterDraft = { id: number | null; chapter?: Chapter };

/**
 * SCR-099 Curriculum Details (mode "view") and SCR-100 Units / Chapters /
 * Topics (mode "edit"), live on the syllabus of one class-subject (?id=).
 * GET /syllabus?academic_year_id, GET /syllabus/{cs_id}; coverage with
 * PUT /syllabus/topics/{id}/coverage; topics with POST /chapters/{id}/topics.
 * Edit mode adds POST /{cs_id}/chapters, PUT/DELETE /chapters/{id},
 * PUT /{cs_id}/chapter-order, PUT /chapters/{id}/topic-order,
 * PUT/DELETE /topics/{id}, GET /{cs_id}/copy-sources and POST /{cs_id}/copy.
 */
export function SyllabusTree({ mode }: { mode: "view" | "edit" }) {
  const router = useRouter();
  const pathname = usePathname();
  const idParam = useSearchParams().get("id");
  const { years, yearId, setYearId, error: yearsError } = useYears();
  const list = useApi<ClassSubjectSummary[]>(yearId ? BASE : null, { academic_year_id: yearId });
  const [classId, setClassId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [chapterForm, setChapterForm] = useState<ChapterDraft | null>(null);
  const [topicForm, setTopicForm] = useState<number | "pick" | null>(null);
  const editing = mode === "edit";

  const all = useMemo(() => list.data ?? [], [list.data]);
  // The class-subject named in the URL, or the first one of the year.
  const csId = idParam ? Number(idParam) : (all[0]?.class_subject_id ?? null);
  const detail = useApi<SyllabusDetail>(csId ? `${BASE}/${csId}` : null);
  const sources = useApi<CopySource[]>(editing && csId ? `${BASE}/${csId}/copy-sources` : null);
  const d = detail.data;

  useEffect(() => {
    if (d) {
      setClassId(d.class_id);
      setSectionId((cur) => (cur && d.sections.some((s) => String(s.section_id) === cur) ? cur : d.sections[0] ? String(d.sections[0].section_id) : ""));
    }
  }, [d]);

  const choose = (id: number) => router.replace(`${pathname}?id=${id}`);
  const classes = useMemo(() => {
    const m = new Map<number, string>();
    all.forEach((c) => m.set(c.class_id, c.class_name));
    return [...m];
  }, [all]);
  const subjectsOfClass = all.filter((c) => c.class_id === classId);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setError(null);
    try {
      await fn();
      if (done) notify(done);
      detail.reload();
      list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  usePageAction("add-unit", useCallback(() => setChapterForm({ id: null }), []));

  const canEdit = Boolean(d?.can_edit);
  const progress = d?.sections.find((s) => String(s.section_id) === sectionId);
  const plannedPeriods = d?.items.reduce((n, ch) => n + (ch.planned_periods ?? ch.topics.reduce((m, t) => m + (t.planned_periods ?? 0), 0)), 0) ?? 0;

  const toggle = (t: Topic) => {
    if (!sectionId) return;
    const covered = Boolean(t.coverage[sectionId]);
    run(() => api.put(`${BASE}/topics/${t.id}/coverage`, { section_id: Number(sectionId), covered: !covered }), covered ? "Marked not covered." : "Marked covered.");
  };
  const moveChapter = (i: number, dir: -1 | 1) => {
    if (!d) return;
    const ids = d.items.map((c) => c.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    run(() => api.put(`${BASE}/${d.class_subject_id}/chapter-order`, { ids }));
  };
  const moveTopic = (ch: Chapter, i: number, dir: -1 | 1) => {
    const ids = ch.topics.map((t) => t.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    run(() => api.put(`${BASE}/chapters/${ch.id}/topic-order`, { ids }));
  };

  const small = { padding: "4px 10px", minHeight: 0, fontSize: 12 } as const;

  return (
    <>
      <div className="filterbar">
        <select
          aria-label="Filter by class"
          value={classId ?? ""}
          onChange={(e) => {
            const first = all.find((c) => c.class_id === Number(e.target.value));
            if (first) choose(first.class_subject_id);
          }}
        >
          {!classes.length ? <option value="">{list.loading ? "Loading classes…" : "No classes"}</option> : null}
          {classes.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select aria-label="Subject" value={csId ?? ""} onChange={(e) => choose(Number(e.target.value))}>
          {subjectsOfClass.map((c) => (
            <option key={c.class_subject_id} value={c.class_subject_id}>
              {c.subject_name}
            </option>
          ))}
        </select>
        <select aria-label="Section progress" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          {d?.sections.map((s) => (
            <option key={s.section_id} value={s.section_id}>
              {s.section_label}
            </option>
          ))}
        </select>
        <YearSelect
          years={years}
          yearId={yearId}
          onChange={(id) => {
            setYearId(id);
            router.replace(pathname);
          }}
        />
      </div>
      <ErrorNote>{error ?? yearsError ?? list.error ?? detail.error}</ErrorNote>
      {!csId && !list.loading ? (
        <section className="panel">
          <div className="panel-pad muted">No class has subjects assigned in this academic year yet. Assign them under Subjects.</div>
        </section>
      ) : null}
      {csId ? (
        <div className="two-col">
          <div>
            <Panel
              title={d ? `${d.class_name} · ${d.subject_name}` : "Loading…"}
              sub={d ? `${d.chapters} chapters · ${d.topics} topics${d.teacher_name ? ` · ${d.teacher_name}` : ""}` : undefined}
              action={
                canEdit && d?.items.length ? (
                  <button type="button" className="btn" onClick={() => setTopicForm("pick")}>
                    <Icon name="plus" className="sm" />
                    Add topic
                  </button>
                ) : undefined
              }
            >
              {d && !d.items.length ? (
                <div className="muted" style={{ padding: "6px 0" }}>
                  <p>No chapters yet.</p>
                  {editing && canEdit && sources.data?.length ? (
                    <div className="actions" style={{ marginTop: 10 }}>
                      {sources.data.map((s) => (
                        <button
                          key={s.class_subject_id}
                          type="button"
                          className="btn"
                          onClick={() => run(() => api.post(`${BASE}/${d.class_subject_id}/copy`, { source_class_subject_id: s.class_subject_id }), `Copied from ${s.class_name}.`)}
                        >
                          {`Copy from ${s.class_name} (${s.chapters} chapters)`}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {!editing && canEdit ? (
                    <Link href={`${routeOf(100)}?id=${d.class_subject_id}`} className="btn" style={{ marginTop: 10 }}>
                      <Icon name="plus" className="sm" />
                      Add chapters
                    </Link>
                  ) : null}
                </div>
              ) : null}
              {d?.items.map((ch, i) => (
                <div key={ch.id}>
                  <div className="tree-row spread">
                    <strong>
                      <Icon name="down" className="sm" />
                      {` Chapter ${i + 1} · ${ch.title}`}
                    </strong>
                    <span className="row" style={{ gap: 8 }}>
                      <span>
                        {`${ch.topics.length} topic${ch.topics.length === 1 ? "" : "s"}`}
                        {ch.planned_periods ? ` · ${ch.planned_periods} periods` : ""}
                        {ch.planned_start || ch.planned_end ? ` · ${date(ch.planned_start)} – ${date(ch.planned_end)}` : ""}
                      </span>
                      {editing && canEdit ? (
                        <>
                          <button type="button" className="btn" style={small} disabled={i === 0} onClick={() => moveChapter(i, -1)} aria-label="Move chapter up">
                            ↑
                          </button>
                          <button type="button" className="btn" style={small} disabled={i === d.items.length - 1} onClick={() => moveChapter(i, 1)} aria-label="Move chapter down">
                            ↓
                          </button>
                          <button type="button" className="btn" style={small} onClick={() => setChapterForm({ id: ch.id, chapter: ch })}>
                            Edit
                          </button>
                          <button type="button" className="btn" style={small} onClick={() => setTopicForm(ch.id)}>
                            Add topics
                          </button>
                          <button
                            type="button"
                            className="btn danger"
                            style={small}
                            onClick={async () => (await ask(`Delete chapter "${ch.title}"?`)) && run(() => api.delete(`${BASE}/chapters/${ch.id}`), "Chapter deleted.")}
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </span>
                  </div>
                  {ch.topics.map((t, j) => {
                    const cov = sectionId ? t.coverage[sectionId] : undefined;
                    return (
                      <div key={t.id} className="tree-row leaf spread">
                        <span>
                          {`${t.title} `}
                          {t.planned_periods ? <span className="muted">{`· ${t.planned_periods} periods`}</span> : null}
                        </span>
                        <span className="row" style={{ gap: 8 }}>
                          <span>{cov ? `Completed · ${date(cov.covered_on)}` : "Not covered"}</span>
                          {canEdit && sectionId ? (
                            <button type="button" className="btn" style={small} onClick={() => toggle(t)}>
                              {cov ? "Undo" : "Mark covered"}
                            </button>
                          ) : null}
                          {editing && canEdit ? (
                            <>
                              <button type="button" className="btn" style={small} disabled={j === 0} onClick={() => moveTopic(ch, j, -1)} aria-label="Move topic up">
                                ↑
                              </button>
                              <button type="button" className="btn" style={small} disabled={j === ch.topics.length - 1} onClick={() => moveTopic(ch, j, 1)} aria-label="Move topic down">
                                ↓
                              </button>
                              <button
                                type="button"
                                className="btn"
                                style={small}
                                onClick={async () => {
                                  const title = (await askText("Topic title", t.title));
                                  if (title && title.trim()) run(() => api.put(`${BASE}/topics/${t.id}`, { title: title.trim(), planned_periods: t.planned_periods }));
                                }}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                className="btn danger"
                                style={small}
                                onClick={async () => (await ask(`Delete "${t.title}"?`)) && run(() => api.delete(`${BASE}/topics/${t.id}`), "Topic deleted.")}
                              >
                                Delete
                              </button>
                            </>
                          ) : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </Panel>
          </div>
          <aside className="stack">
            <Panel title="Curriculum overview">
              <Kv
                rows={[
                  ["Subject", d?.subject_name ?? "…"],
                  ["Class", d?.class_name ?? "…"],
                  ["Teacher", d ? d.teacher_name ?? "Not assigned" : "…"],
                  ["Planned periods", d ? (plannedPeriods ? String(plannedPeriods) : "—") : "…"],
                ]}
              />
            </Panel>
            <Panel title="Progress" sub={progress ? `${progress.section_label} · ${progress.covered} of ${progress.total} topics` : undefined}>
              <div className="donut" style={{ background: `conic-gradient(var(--blue) 0 ${progress?.percent ?? 0}%, #e9eff9 ${progress?.percent ?? 0}% 100%)` }}>
                <div>
                  {progress ? `${progress.percent}%` : "—"}
                  <small>Topics complete</small>
                </div>
              </div>
              {progress && progress.behind > 0 ? <p className="muted">{`${progress.behind} topic(s) behind plan`}</p> : null}
            </Panel>
          </aside>
        </div>
      ) : null}
      {chapterForm && d ? <ChapterForm csId={d.class_subject_id} draft={chapterForm} onClose={() => setChapterForm(null)} onSaved={() => run(async () => {})} /> : null}
      {topicForm !== null && d ? <TopicForm chapters={d.items} chapterId={topicForm} onClose={() => setTopicForm(null)} onSaved={() => run(async () => {})} /> : null}
    </>
  );
}

function ChapterForm({ csId, draft, onClose, onSaved }: { csId: number; draft: ChapterDraft; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ch = draft.chapter;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const body = {
      title: text("title"),
      description: text("description") || null,
      planned_start: text("planned_start") || null,
      planned_end: text("planned_end") || null,
      planned_periods: text("planned_periods") ? Number(text("planned_periods")) : null,
      topics: text("topics")
        .split("\n")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    setSaving(true);
    setError(null);
    try {
      if (draft.id) await api.put(`${BASE}/chapters/${draft.id}`, body);
      else await api.post(`${BASE}/${csId}/chapters`, body);
      notify(draft.id ? "Chapter updated." : "Chapter added.");
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title={ch ? `Edit ${ch.title}` : "Add unit"} onClose={onClose} error={error}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Title" required full>
            <input name="title" required defaultValue={ch?.title} placeholder="e.g. Rational numbers" />
          </Field>
          <Field label="Planned start">
            <input type="date" name="planned_start" defaultValue={ch?.planned_start ?? ""} />
          </Field>
          <Field label="Planned end">
            <input type="date" name="planned_end" defaultValue={ch?.planned_end ?? ""} />
          </Field>
          <Field label="Planned periods">
            <input type="number" min={0} name="planned_periods" defaultValue={ch?.planned_periods ?? ""} />
          </Field>
          <Field label="Description" full>
            <textarea name="description" defaultValue={ch?.description ?? ""} />
          </Field>
          {!ch ? (
            <Field label="Topics (one per line)" full>
              <textarea name="topics" placeholder={"Operations on rational numbers\nProperties and applications"} />
            </Field>
          ) : null}
        </div>
        <DialogActions onCancel={onClose} saving={saving} submit={ch ? "Save changes" : "Add unit"} />
      </form>
    </Dialog>
  );
}

function TopicForm({ chapters, chapterId, onClose, onSaved }: { chapters: Chapter[]; chapterId: number | "pick"; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const titles = String(f.get("titles") ?? "")
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean);
    if (!titles.length) {
      setError("Enter at least one topic.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.post(`${BASE}/chapters/${f.get("chapter")}/topics`, { titles });
      notify(titles.length === 1 ? "Topic added." : `${titles.length} topics added.`);
      onSaved();
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title="Add topic" onClose={onClose} error={error}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Chapter" required full>
            <select name="chapter" required defaultValue={chapterId === "pick" ? chapters[0]?.id : chapterId}>
              {chapters.map((c, i) => (
                <option key={c.id} value={c.id}>
                  {`Chapter ${i + 1} · ${c.title}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Topics (one per line)" required full>
            <textarea name="titles" required />
          </Field>
        </div>
        <DialogActions onCancel={onClose} saving={saving} submit="Add" />
      </form>
    </Dialog>
  );
}

/** SCR-099's "Edit curriculum": opens the same syllabus on SCR-100. */
export function EditSyllabusLink() {
  const id = useSearchParams().get("id");
  return (
    <Link href={id ? `${routeOf(100)}?id=${id}` : routeOf(100)} className="btn primary">
      <Icon name="arrow" className="sm" />
      Edit curriculum
    </Link>
  );
}
