"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, Textarea, humanize, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { AlertTriangle, CheckCircle2, CircleSlash, Clock } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";

type Topic = { id: number; title: string };
type Chapter = { id: number; title: string; topics: Topic[] };
type Detail = {
  class_subject_id: number;
  subject_name: string;
  class_name: string;
  can_edit: boolean;
  sections: { section_id: number; section_label: string }[];
  items: Chapter[];
};
type Outcome = {
  id: number;
  chapter_id: number | null;
  chapter_title: string | null;
  code: string;
  statement: string;
  bloom_level: string | null;
  sequence: number;
  is_active: boolean;
  topics: Topic[];
  topics_covered: number | null;
  status: "covered" | "in_progress" | "not_started" | null;
};
type Coverage = {
  section_label: string | null;
  total: number;
  covered: number;
  in_progress: number;
  not_started: number;
  unmapped: number;
  outcomes: Outcome[];
};
type Resource = {
  id: number;
  chapter_id: number | null;
  chapter_title: string | null;
  title: string;
  description: string | null;
  kind: string;
  url: string | null;
  file_name: string | null;
  size_bytes: number | null;
  has_file: boolean;
  visible_to_parents: boolean;
  downloads: number;
  uploaded_by_name: string | null;
  is_active: boolean;
};

const base = "/api/v1/school";
const BLOOM = ["remember", "understand", "apply", "analyze", "evaluate", "create"];
const KINDS = ["document", "worksheet", "presentation", "link", "video", "image", "other"];
/** A select sized for the filter bar: the same height as the search box, and
 *  no stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";
const TONE: Record<string, "emerald" | "amber" | "rose"> = {
  covered: "emerald",
  in_progress: "amber",
  not_started: "rose",
};
const size = (b: number | null) => (b ? `${Math.max(1, Math.round(b / 1024))} KB` : "—");

const blankOutcome = { code: "", statement: "", bloom_level: "", chapter_id: "", topic_ids: [] as number[] };
const blankResource = {
  title: "",
  description: "",
  kind: "document",
  url: "",
  chapter_id: "",
  topic_id: "",
  visible_to_parents: false,
};

/** What a class-subject is meant to teach (learning outcomes, and how far each
 *  section has met them) and the material kept against it. */
export function Curriculum({ csId, backHref }: { csId: string; backHref: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"outcomes" | "resources">("outcomes");
  const [sectionId, setSectionId] = useState("");
  const [cov, setCov] = useState<Coverage | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [oForm, setOForm] = useState<{ id: number | null; f: typeof blankOutcome } | null>(null);
  const [rForm, setRForm] = useState<typeof blankResource | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOutcomes = (sid: string) =>
    sid
      ? api
          .get<Coverage>(`${base}/learning-outcomes/coverage`, { params: { class_subject_id: csId, section_id: sid } })
          .then((r) => {
            setCov(r.data);
            setOutcomes(r.data.outcomes);
          })
      : api.get<Outcome[]>(`${base}/learning-outcomes`, { params: { class_subject_id: csId } }).then((r) => {
          setCov(null);
          setOutcomes(r.data);
        });

  const loadResources = () =>
    api
      .get<Resource[]>(`${base}/teaching-resources`, { params: { class_subject_id: csId, include_inactive: true } })
      .then((r) => setResources(r.data));

  useEffect(() => {
    api
      .get<Detail>(`${base}/syllabus/${csId}`)
      .then((r) => {
        setD(r.data);
        setSectionId((cur) => cur || (r.data.sections[0] ? String(r.data.sections[0].section_id) : ""));
      })
      .catch((e) => setError(apiError(e)));
    loadResources().catch((e) => setError(apiError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csId]);

  useEffect(() => {
    loadOutcomes(sectionId).catch((e) => setError(apiError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csId, sectionId]);

  const topicsByChapter = useMemo(() => {
    const m = new Map<string, Topic[]>();
    (d?.items ?? []).forEach((c) => m.set(String(c.id), c.topics));
    return m;
  }, [d]);

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      setError(null);
      setNotice(done);
      await Promise.all([loadOutcomes(sectionId), loadResources()]);
      return true;
    } catch (e) {
      setNotice(null);
      setError(apiError(e));
      return false;
    }
  }

  if (!d) return <ErrorBox>{error ?? "Loading…"}</ErrorBox>;
  const edit = d.can_edit;

  async function saveOutcome(e: FormEvent) {
    e.preventDefault();
    if (!oForm) return;
    const f = oForm.f;
    const body = {
      code: f.code,
      statement: f.statement,
      bloom_level: f.bloom_level || null,
      chapter_id: f.chapter_id ? Number(f.chapter_id) : null,
      topic_ids: f.topic_ids,
    };
    const ok = await run(
      () =>
        oForm.id
          ? api.patch(`${base}/learning-outcomes/${oForm.id}`, body)
          : api.post(`${base}/learning-outcomes`, { ...body, class_subject_id: Number(csId) }),
      oForm.id ? "Outcome updated." : "Outcome added."
    );
    if (ok) setOForm(null);
  }

  async function saveResource(e: FormEvent) {
    e.preventDefault();
    if (!rForm) return;
    const fd = new FormData();
    fd.append("class_subject_id", csId);
    fd.append("title", rForm.title);
    fd.append("kind", rForm.kind);
    if (rForm.description) fd.append("description", rForm.description);
    if (rForm.url) fd.append("url", rForm.url);
    if (rForm.chapter_id) fd.append("chapter_id", rForm.chapter_id);
    if (rForm.topic_id) fd.append("topic_id", rForm.topic_id);
    fd.append("visible_to_parents", String(rForm.visible_to_parents));
    if (file) fd.append("file", file);
    const ok = await run(() => api.post(`${base}/teaching-resources`, fd), "Resource added.");
    if (ok) {
      setRForm(null);
      setFile(null);
    }
  }

  return (
    <div className="space-y-[18px]">
      <Link href={backHref} className="text-sm text-brand-500 hover:underline">
        ← All subjects
      </Link>
      <PageHeader
        title={`${d.subject_name} · ${d.class_name}`}
        subtitle="What this subject is meant to teach, and the material kept against it."
        actions={
          edit && (
            <Button
              onClick={() =>
                tab === "outcomes" ? setOForm({ id: null, f: blankOutcome }) : setRForm({ ...blankResource })
              }
            >
              {tab === "outcomes" ? "Add outcome" : "Add resource"}
            </Button>
          )
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      <nav className="flex gap-1 border-b border-surface-border">
        {(["outcomes", "resources"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t === "outcomes" ? "Learning outcomes" : `Resources (${resources.length})`}
          </button>
        ))}
      </nav>

      {tab === "outcomes" && (
        <>
          {/* Only shown once a section is picked, because only then does the
              server return coverage figures to show. */}
          {cov && (
            <StatStrip
              stats={[
                { label: "Met", value: cov.covered, note: `of ${cov.total} outcome(s)`, icon: CheckCircle2 },
                { label: "Part taught", value: cov.in_progress, note: "Some topics still to teach", icon: Clock },
                { label: "Not started", value: cov.not_started, note: "No mapped topic taught yet", icon: CircleSlash },
                { label: "No topics mapped", value: cov.unmapped, note: "Coverage can't be worked out", icon: AlertTriangle },
              ]}
            />
          )}
          {d.sections.length > 0 && (
            <FilterBar>
              <select
                aria-label="Show progress for section"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className={filterSelect}
              >
                <option value="">No section</option>
                {d.sections.map((s) => (
                  <option key={s.section_id} value={s.section_id}>
                    {s.section_label}
                  </option>
                ))}
              </select>
            </FilterBar>
          )}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Outcomes</CardTitle>
                <p className="mt-[5px] text-[11px] text-ink-muted">
                  {cov?.section_label
                    ? `Progress for ${cov.section_label}`
                    : "What a child should be able to do by the end of this subject."}
                </p>
              </div>
            </CardHeader>
              <Table
                head={["Code", "Outcome", "Chapter", "Topics", cov ? "In section" : "Bloom", edit ? "" : ""]}
                empty={outcomes.length === 0 && "No outcomes written for this subject yet."}
              >
                {outcomes.map((o) => (
                  <tr key={o.id} className={o.is_active ? undefined : "opacity-60"}>
                    <td className={tdStrong}>{o.code}</td>
                    <td className={td}>
                      {o.statement}
                      {!o.is_active && <Badge tone="neutral">Retired</Badge>}
                    </td>
                    <td className={td}>{o.chapter_title ?? "—"}</td>
                    <td className={td}>
                      {o.topics.length === 0 ? (
                        <span className="text-warning">None mapped</span>
                      ) : (
                        o.topics.map((t) => t.title).join(", ")
                      )}
                    </td>
                    <td className={td}>
                      {cov && o.status ? (
                        <>
                          <Badge tone={TONE[o.status]}>{humanize(o.status)}</Badge>
                          {o.topics.length > 0 && (
                            <span className="block text-xs text-ink-subtle">
                              {o.topics_covered}/{o.topics.length} topics taught
                            </span>
                          )}
                        </>
                      ) : (
                        humanize(o.bloom_level)
                      )}
                    </td>
                    <td className={td}>
                      {edit && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setOForm({
                                id: o.id,
                                f: {
                                  code: o.code,
                                  statement: o.statement,
                                  bloom_level: o.bloom_level ?? "",
                                  chapter_id: o.chapter_id ? String(o.chapter_id) : "",
                                  topic_ids: o.topics.map((t) => t.id),
                                },
                              })
                            }
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              run(
                                () => api.patch(`${base}/learning-outcomes/${o.id}`, { is_active: !o.is_active }),
                                o.is_active ? `${o.code} retired.` : `${o.code} back in use.`
                              )
                            }
                          >
                            {o.is_active ? "Retire" : "Restore"}
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            <PanelFooter
              left={`${outcomes.length} outcome${outcomes.length === 1 ? "" : "s"}`}
              right={cov ? `${cov.covered} of ${cov.total} met in ${cov.section_label ?? "this section"}` : "Pick a section to see progress"}
            />
          </Card>
        </>
      )}

      {tab === "resources" && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Teaching resources</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">Worksheets, links and files kept against this subject.</p>
            </div>
          </CardHeader>
            <Table
              head={["Title", "Kind", "Chapter", "Shared with parents", "Uploaded by", ""]}
              empty={resources.length === 0 && "Nothing here yet — add a worksheet or a link."}
            >
              {resources.map((r) => (
                <tr key={r.id} className={r.is_active ? undefined : "opacity-60"}>
                  <td className={tdStrong}>
                    {r.title}
                    {r.description && <span className="block text-xs text-ink-subtle">{r.description}</span>}
                    {r.has_file && <span className="block text-xs text-ink-subtle">{r.file_name} · {size(r.size_bytes)} · {r.downloads} downloads</span>}
                  </td>
                  <td className={td}>{humanize(r.kind)}</td>
                  <td className={td}>{r.chapter_title ?? "—"}</td>
                  <td className={td}>
                    {r.visible_to_parents ? <Badge tone="emerald">Shared</Badge> : <Badge tone="neutral">Staff only</Badge>}
                  </td>
                  <td className={td}>{r.uploaded_by_name ?? "—"}</td>
                  <td className={td}>
                    <div className="flex gap-2">
                      {r.has_file ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openAuthed(`${base}/teaching-resources/${r.id}/file`)}
                        >
                          Download
                        </Button>
                      ) : (
                        r.url && (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="px-3 py-1.5 text-xs text-brand-500 hover:underline"
                          >
                            Open link
                          </a>
                        )
                      )}
                      {edit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            run(
                              () =>
                                api.patch(`${base}/teaching-resources/${r.id}`, {
                                  visible_to_parents: !r.visible_to_parents,
                                }),
                              r.visible_to_parents ? `${r.title} is staff-only again.` : `${r.title} shared with parents.`
                            )
                          }
                        >
                          {r.visible_to_parents ? "Unshare" : "Share"}
                        </Button>
                      )}
                      {edit && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => run(() => api.delete(`${base}/teaching-resources/${r.id}`), `${r.title} removed.`)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          <PanelFooter
            left={`${resources.length} resource${resources.length === 1 ? "" : "s"}`}
            right={`${resources.filter((r) => r.visible_to_parents).length} shared with parents`}
          />
        </Card>
      )}

      <Modal open={oForm !== null} onClose={() => setOForm(null)} title={oForm?.id ? "Edit outcome" : "Add outcome"} size="lg">
        {oForm && (
          <form className="space-y-3" onSubmit={saveOutcome}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Code"
                required
                placeholder="e.g. M7.3.1"
                value={oForm.f.code}
                onChange={(e) => setOForm({ ...oForm, f: { ...oForm.f, code: e.target.value } })}
              />
              <Select
                label="Bloom level"
                value={oForm.f.bloom_level}
                onChange={(e) => setOForm({ ...oForm, f: { ...oForm.f, bloom_level: e.target.value } })}
              >
                <option value="">—</option>
                {BLOOM.map((b) => (
                  <option key={b} value={b}>
                    {humanize(b)}
                  </option>
                ))}
              </Select>
              <Select
                label="Chapter"
                value={oForm.f.chapter_id}
                onChange={(e) => setOForm({ ...oForm, f: { ...oForm.f, chapter_id: e.target.value, topic_ids: [] } })}
              >
                <option value="">—</option>
                {d.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
            </div>
            <Textarea
              label="What the child should be able to do"
              required
              rows={3}
              value={oForm.f.statement}
              onChange={(e) => setOForm({ ...oForm, f: { ...oForm.f, statement: e.target.value } })}
            />
            <div>
              <span className="text-xs font-medium text-ink-muted">Topics that teach it</span>
              <div className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-surface-border p-2">
                {(oForm.f.chapter_id ? topicsByChapter.get(oForm.f.chapter_id) ?? [] : d.items.flatMap((c) => c.topics)).map(
                  (t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm text-ink-muted">
                      <input
                        type="checkbox"
                        checked={oForm.f.topic_ids.includes(t.id)}
                        onChange={(e) =>
                          setOForm({
                            ...oForm,
                            f: {
                              ...oForm.f,
                              topic_ids: e.target.checked
                                ? [...oForm.f.topic_ids, t.id]
                                : oForm.f.topic_ids.filter((x) => x !== t.id),
                            },
                          })
                        }
                      />
                      {t.title}
                    </label>
                  )
                )}
                {d.items.length === 0 && <p className="text-sm text-ink-subtle">Add chapters and topics first.</p>}
              </div>
              <p className="mt-1 text-xs text-ink-subtle">
                Coverage is worked out from these — an outcome counts as met once every mapped topic has been taught.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOForm(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={rForm !== null} onClose={() => setRForm(null)} title="Add resource" size="lg">
        {rForm && (
          <form className="space-y-3" onSubmit={saveResource}>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Title"
                required
                value={rForm.title}
                onChange={(e) => setRForm({ ...rForm, title: e.target.value })}
              />
              <Select label="Kind" value={rForm.kind} onChange={(e) => setRForm({ ...rForm, kind: e.target.value })}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {humanize(k)}
                  </option>
                ))}
              </Select>
              <Select
                label="Chapter"
                value={rForm.chapter_id}
                onChange={(e) => setRForm({ ...rForm, chapter_id: e.target.value, topic_id: "" })}
              >
                <option value="">—</option>
                {d.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </Select>
              <Select
                label="Topic"
                value={rForm.topic_id}
                disabled={!rForm.chapter_id}
                onChange={(e) => setRForm({ ...rForm, topic_id: e.target.value })}
              >
                <option value="">—</option>
                {(topicsByChapter.get(rForm.chapter_id) ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </div>
            <Textarea
              label="Description"
              value={rForm.description}
              onChange={(e) => setRForm({ ...rForm, description: e.target.value })}
            />
            <Input
              label="Link"
              placeholder="https://…"
              value={rForm.url}
              disabled={file !== null}
              onChange={(e) => setRForm({ ...rForm, url: e.target.value })}
            />
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-muted">…or a file (PDF, JPG, PNG, WEBP)</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                disabled={rForm.url !== ""}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm text-ink-muted"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={rForm.visible_to_parents}
                onChange={(e) => setRForm({ ...rForm, visible_to_parents: e.target.checked })}
              />
              Share with parents of this class
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setRForm(null)}>
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
