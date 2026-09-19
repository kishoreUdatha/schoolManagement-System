"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { ProgressBar, type ClassSubjectSummary } from "@/components/syllabus/SyllabusList";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Textarea } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Coverage = { covered_on: string; note: string | null; lesson_plan_id: number | null };
type Topic = { id: number; title: string; sequence: number; planned_periods: number | null; coverage: Record<string, Coverage> };
type Chapter = {
  id: number;
  title: string;
  sequence: number;
  description: string | null;
  planned_start: string | null;
  planned_end: string | null;
  planned_periods: number | null;
  topics: Topic[];
};
type Detail = ClassSubjectSummary & { items: Chapter[] };

const blankChapter = { title: "", description: "", planned_start: "", planned_end: "", planned_periods: "", topics: "" };

export function SyllabusEditor({ csId, backHref }: { csId: string; backHref: string }) {
  const base = `/api/v1/school/syllabus`;
  const [d, setD] = useState<Detail | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [chForm, setChForm] = useState<{ id: number | null; f: typeof blankChapter } | null>(null);
  const [sources, setSources] = useState<{ class_subject_id: number; class_name: string; chapters: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api
      .get<Detail>(`${base}/${csId}`)
      .then((r) => {
        setD(r.data);
        setSectionId((cur) => cur || (r.data.sections[0] ? String(r.data.sections[0].section_id) : ""));
      })
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    api
      .get<typeof sources>(`${base}/${csId}/copy-sources`)
      .then((r) => setSources(r.data))
      .catch(() => setSources([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csId]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    try {
      await fn();
      setError(null);
      if (done) setNotice(done);
      await load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  if (!d) return <ErrorBox>{error}</ErrorBox>;
  const edit = d.can_edit;
  const today = new Date().toISOString().slice(0, 10);

  async function saveChapter(e: FormEvent) {
    e.preventDefault();
    if (!chForm) return;
    const f = chForm.f;
    const body = {
      title: f.title,
      description: f.description.trim() || null,
      planned_start: f.planned_start || null,
      planned_end: f.planned_end || null,
      planned_periods: f.planned_periods ? Number(f.planned_periods) : null,
      topics: f.topics.split("\n"),
    };
    await run(async () => {
      if (chForm.id) await api.put(`${base}/chapters/${chForm.id}`, body);
      else await api.post(`${base}/${csId}/chapters`, body);
      setChForm(null);
    }, chForm.id ? "Chapter updated." : "Chapter added.");
  }

  const moveChapter = (i: number, dir: -1 | 1) => {
    const ids = d.items.map((c) => c.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    run(() => api.put(`${base}/${csId}/chapter-order`, { ids }));
  };
  const moveTopic = (ch: Chapter, i: number, dir: -1 | 1) => {
    const ids = ch.topics.map((t) => t.id);
    [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
    run(() => api.put(`${base}/chapters/${ch.id}/topic-order`, { ids }));
  };

  const toggle = (t: Topic) => {
    const cov = t.coverage[sectionId];
    run(() => api.put(`${base}/topics/${t.id}/coverage`, { section_id: Number(sectionId), covered: !cov }));
  };

  return (
    <div className="space-y-6">
      <Link href={backHref} className="text-sm text-brand-500 hover:underline">
        ← All subjects
      </Link>
      <PageHeader
        title={`${d.subject_name} · ${d.class_name}`}
        subtitle={`${d.teacher_name ? `Teacher: ${d.teacher_name} · ` : ""}${d.chapters} chapters · ${d.topics} topics`}
        actions={
          edit && (
            <Button onClick={() => setChForm({ id: null, f: blankChapter })}>Add chapter</Button>
          )
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {d.topics > 0 && (
        <div className="flex flex-wrap gap-6">
          {d.sections.map((s) => (
            <ProgressBar key={s.section_id} p={s} />
          ))}
        </div>
      )}

      {edit && d.items.length === 0 && sources.length > 0 && (
        <Card>
          <CardBody className="flex flex-wrap items-center gap-2 text-sm text-ink">
            Start from another class&apos;s {d.subject_name} syllabus:
            {sources.map((s) => (
              <Button
                key={s.class_subject_id}
                size="sm"
                variant="secondary"
                onClick={() =>
                  run(() => api.post(`${base}/${csId}/copy`, { source_class_subject_id: s.class_subject_id }), `Copied from ${s.class_name}.`)
                }
              >
                {s.class_name} ({s.chapters} chapters)
              </Button>
            ))}
          </CardBody>
        </Card>
      )}

      {edit && d.sections.length > 0 && d.items.length > 0 && (
        <div className="max-w-xs">
          <Select label="Mark topics taught in" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
            {d.sections.map((s) => (
              <option key={s.section_id} value={s.section_id}>
                {s.section_label}
              </option>
            ))}
          </Select>
        </div>
      )}

      {d.items.length === 0 && <p className="text-sm text-ink-subtle">No chapters yet.</p>}
      {d.items.map((ch, i) => {
        const overdue = ch.planned_end && ch.planned_end < today;
        return (
          <Card key={ch.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle>
                    {i + 1}. {ch.title}
                  </CardTitle>
                  <div className="text-xs text-ink-subtle">
                    {ch.planned_start || ch.planned_end ? `Planned ${ch.planned_start ?? "…"} to ${ch.planned_end ?? "…"}` : "No dates planned"}
                    {ch.planned_periods ? ` · ${ch.planned_periods} periods` : ""}
                    {overdue && <span className="text-amber-500"> · should be finished</span>}
                  </div>
                  {ch.description && <p className="mt-1 text-sm text-ink-muted">{ch.description}</p>}
                </div>
                {edit && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => moveChapter(i, -1)} aria-label="Move up">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" disabled={i === d.items.length - 1} onClick={() => moveChapter(i, 1)} aria-label="Move down">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setChForm({
                          id: ch.id,
                          f: {
                            title: ch.title,
                            description: ch.description ?? "",
                            planned_start: ch.planned_start ?? "",
                            planned_end: ch.planned_end ?? "",
                            planned_periods: ch.planned_periods ? String(ch.planned_periods) : "",
                            topics: "",
                          },
                        })
                      }
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.confirm(`Delete chapter "${ch.title}"?`) && run(() => api.delete(`${base}/chapters/${ch.id}`), "Chapter deleted.")}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardBody className="pt-0">
              <ul className="divide-y divide-surface-border">
                {ch.topics.map((t, j) => {
                  const cov = t.coverage[sectionId];
                  const doneIn = d.sections.filter((s) => t.coverage[String(s.section_id)]);
                  return (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                      {edit && sectionId ? (
                        <input type="checkbox" checked={!!cov} onChange={() => toggle(t)} aria-label={`Taught: ${t.title}`} />
                      ) : null}
                      <span className={cov ? "text-ink" : "text-ink-muted"}>{t.title}</span>
                      {cov && <span className="text-xs text-emerald-500">taught {cov.covered_on}{cov.lesson_plan_id ? " (lesson plan)" : ""}</span>}
                      {!edit && doneIn.length > 0 && (
                        <span className="text-xs text-emerald-500">taught in {doneIn.map((s) => s.section_label).join(", ")}</span>
                      )}
                      {edit && (
                        <span className="ml-auto flex gap-2 text-xs">
                          <button type="button" disabled={j === 0} className="text-ink-subtle disabled:opacity-30" onClick={() => moveTopic(ch, j, -1)}>
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={j === ch.topics.length - 1}
                            className="text-ink-subtle disabled:opacity-30"
                            onClick={() => moveTopic(ch, j, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="text-brand-500 hover:underline"
                            onClick={() => {
                              const title = window.prompt("Topic", t.title);
                              if (title && title.trim()) run(() => api.put(`${base}/topics/${t.id}`, { title, planned_periods: t.planned_periods }));
                            }}
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            className="text-rose-400 hover:underline"
                            onClick={() => window.confirm(`Delete "${t.title}"?`) && run(() => api.delete(`${base}/topics/${t.id}`))}
                          >
                            Delete
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              {edit && (
                <button
                  type="button"
                  className="mt-2 text-sm text-brand-500 hover:underline"
                  onClick={() => {
                    const titles = window.prompt("New topics (separate with ;)");
                    if (titles && titles.trim()) run(() => api.post(`${base}/chapters/${ch.id}/topics`, { titles: titles.split(";") }));
                  }}
                >
                  + Add topics
                </button>
              )}
            </CardBody>
          </Card>
        );
      })}

      <Modal open={!!chForm} onClose={() => setChForm(null)} title={chForm?.id ? "Edit chapter" : "New chapter"}>
        {chForm && (
          <form onSubmit={saveChapter} className="space-y-3">
            <Input label="Title *" value={chForm.f.title} onChange={(e) => setChForm({ ...chForm, f: { ...chForm.f, title: e.target.value } })} required />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Planned start"
                type="date"
                value={chForm.f.planned_start}
                onChange={(e) => setChForm({ ...chForm, f: { ...chForm.f, planned_start: e.target.value } })}
              />
              <Input
                label="Planned end"
                type="date"
                value={chForm.f.planned_end}
                onChange={(e) => setChForm({ ...chForm, f: { ...chForm.f, planned_end: e.target.value } })}
              />
              <Input
                label="Periods"
                type="number"
                min={0}
                value={chForm.f.planned_periods}
                onChange={(e) => setChForm({ ...chForm, f: { ...chForm.f, planned_periods: e.target.value } })}
              />
            </div>
            <Textarea
              label="Description"
              rows={2}
              value={chForm.f.description}
              onChange={(e) => setChForm({ ...chForm, f: { ...chForm.f, description: e.target.value } })}
            />
            <Textarea
              label={chForm.id ? "Add more topics (one per line)" : "Topics (one per line)"}
              rows={5}
              value={chForm.f.topics}
              onChange={(e) => setChForm({ ...chForm, f: { ...chForm.f, topics: e.target.value } })}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setChForm(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
