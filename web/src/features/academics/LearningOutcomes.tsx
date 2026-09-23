"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Dialog, downloadCsv, usePageAction } from "./planKit";
import { BLOOM, type ClassSubject, type Outcome, type OutcomeCoverage, type SyllabusDetail } from "./planTypes";

import { ask } from "@/lib/dialog";
const base = "/api/v1/school/learning-outcomes";
const STATUS = { covered: "Covered", in_progress: "In progress", not_started: "Not started" } as const;

/**
 * SCR-101, live: GET /learning-outcomes (class_subject_id) or, with a section
 * chosen, GET /learning-outcomes/coverage. Add, edit, retire and delete via
 * POST / PATCH / DELETE /learning-outcomes.
 */
export function LearningOutcomes() {
  const syllabus = useApi<ClassSubject[]>("/api/v1/school/syllabus");
  const [csId, setCsId] = useState<number | null>(null);
  const [sectionId, setSectionId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Outcome | "new" | null>(null);

  useEffect(() => {
    if (csId === null && syllabus.data?.length) setCsId(syllabus.data[0].class_subject_id);
  }, [syllabus.data, csId]);

  const cs = syllabus.data?.find((c) => c.class_subject_id === csId);
  const plain = useApi<Outcome[]>(csId && !sectionId ? base : null, { class_subject_id: csId });
  const cov = useApi<OutcomeCoverage>(csId && sectionId ? `${base}/coverage` : null, { class_subject_id: csId, section_id: sectionId });
  const detail = useApi<SyllabusDetail>(csId ? `/api/v1/school/syllabus/${csId}` : null);
  const reload = () => (sectionId ? cov.reload() : plain.reload());

  const outcomes = useMemo(() => (sectionId ? cov.data?.outcomes : plain.data) ?? [], [sectionId, cov.data, plain.data]);
  const q = search.trim().toLowerCase();
  const shown = outcomes.filter(
    (o) =>
      (!status || (sectionId ? o.status === status : status === "active" ? o.is_active : !o.is_active)) &&
      (!q || [o.code, o.statement, o.chapter_title ?? ""].some((v) => v.toLowerCase().includes(q))),
  );
  const statusText = (o: Outcome) => (sectionId ? (o.status ? STATUS[o.status] : o.topics.length ? "—" : "Not mapped") : o.is_active ? "Active" : "Retired");

  const rows: Row[] = shown.map((o) => [o.code, o.statement, cs?.subject_name ?? "—", cs?.class_name ?? "—", o.chapter_title ?? "—", label(o.bloom_level), statusText(o)]);

  const exportCsv = useCallback(
    () =>
      downloadCsv(
        "learning-outcomes.csv",
        ["Code", "Learning outcome", "Subject", "Class", "Unit", "Bloom level", "Status"],
        shown.map((o) => [o.code, o.statement, cs?.subject_name, cs?.class_name, o.chapter_title, o.bloom_level, statusText(o)]),
      ),
    [shown, cs],
  );
  usePageAction("outcomes:export", exportCsv);
  usePageAction(
    "outcomes:add",
    useCallback(() => setEditing("new"), []),
  );

  const loading = syllabus.loading || plain.loading || cov.loading;
  const error = syllabus.error ?? plain.error ?? cov.error;
  const c = cov.data;

  // With a section chosen the strip shows its coverage; otherwise the subject's outcome list.
  // "—" until a subject exists and is chosen; "…" only while it loads.
  const wait = sectionId ? cov.loading && !cov.data : plain.loading && !plain.data;
  const n = (v: number) => (!csId ? "—" : wait ? "…" : String(v));
  const live = outcomes.filter((o) => o.is_active);
  const stats = sectionId
    ? [
        { label: "Covered", value: n(c?.covered ?? 0), note: `of ${c?.total ?? 0} outcomes` },
        { label: "In progress", value: n(c?.in_progress ?? 0), note: "some topics taught" },
        { label: "Not started", value: n(c?.not_started ?? 0), note: "no topic taught yet" },
        { label: "Not mapped", value: n(c?.unmapped ?? 0), note: "linked to no topic" },
      ]
    : [
        { label: "Outcomes", value: n(live.length), note: cs ? `${cs.class_name} · ${cs.subject_name}` : "this subject" },
        { label: "Units covered", value: n(new Set(live.filter((o) => o.chapter_id).map((o) => o.chapter_id)).size), note: "chapters with outcomes" },
        { label: "Not mapped", value: n(live.filter((o) => !o.topics.length).length), note: "linked to no topic" },
        { label: "Retired", value: n(outcomes.length - live.length), note: "kept for history" },
      ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search learning outcomes…" aria-label="Search learning outcomes" />
        </div>
        <select
          aria-label="Subject and class"
          value={csId ?? ""}
          onChange={(e) => {
            setCsId(Number(e.target.value));
            setSectionId("");
            setStatus("");
          }}
        >
          {!syllabus.data?.length ? <option value="">{syllabus.loading ? "Loading subjects…" : "No subjects set up"}</option> : null}
          {syllabus.data?.map((s) => (
            <option key={s.class_subject_id} value={s.class_subject_id}>
              {`${s.class_name} · ${s.subject_name}`}
            </option>
          ))}
        </select>
        <select
          aria-label="Section for coverage"
          value={sectionId}
          onChange={(e) => {
            setSectionId(e.target.value);
            setStatus("");
          }}
        >
          <option value="">All sections</option>
          {cs?.sections.map((s) => (
            <option key={s.section_id} value={s.section_id}>
              {s.section_label}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {sectionId ? (
            Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))
          ) : (
            <>
              <option value="active">Active</option>
              <option value="retired">Retired</option>
            </>
          )}
        </select>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel flush>
        <DataTable
          columns={["Outcome code", "Learning outcome", "Subject", "Class", "Unit", "Bloom level", "Status"]}
          rows={rows}
          onView={(i) => setEditing(shown[i])}
          empty={loading ? "Loading learning outcomes…" : outcomes.length ? "No outcomes match these filters." : undefined}
          emptyState={{
            title: "No learning outcomes yet",
            note: "Learning outcomes describe what students should be able to do, and lessons and tests link back to them, so add some for this subject.",
            action: (
              <button type="button" className="btn primary" onClick={() => setEditing("new")}>
                Add outcome
              </button>
            ),
          }}
        />
      </Panel>
      <OutcomeDialog
        open={editing !== null}
        outcome={editing === "new" ? null : editing}
        cs={cs}
        detail={detail.data}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    </>
  );
}

function OutcomeDialog({
  open,
  outcome,
  cs,
  detail,
  onClose,
  onSaved,
}: {
  open: boolean;
  outcome: Outcome | null;
  cs: ClassSubject | undefined;
  detail: SyllabusDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [chapterId, setChapterId] = useState("");
  const [topicIds, setTopicIds] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setChapterId(outcome?.chapter_id ? String(outcome.chapter_id) : "");
    setTopicIds(new Set(outcome?.topics.map((t) => t.id) ?? []));
  }, [open, outcome]);

  const editable = Boolean(cs?.can_edit);
  const chapters = detail?.items ?? [];
  const topics = chapters.filter((c) => !chapterId || String(c.id) === chapterId).flatMap((c) => c.topics);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      notify(done);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cs) return;
    const f = new FormData(e.currentTarget);
    const body = {
      code: String(f.get("code") ?? "").trim(),
      statement: String(f.get("statement") ?? "").trim(),
      bloom_level: String(f.get("bloom_level") ?? "") || null,
      chapter_id: chapterId ? Number(chapterId) : null,
      topic_ids: Array.from(topicIds),
    };
    run(
      () => (outcome ? api.patch(`${base}/${outcome.id}`, body) : api.post(base, { ...body, class_subject_id: cs.class_subject_id })),
      outcome ? "Outcome updated." : "Outcome added.",
    );
  }

  return (
    <Dialog title={outcome ? `Outcome ${outcome.code}` : "Add outcome"} open={open} onClose={onClose} wide>
      <form onSubmit={submit}>
        <ErrorNote>{error ?? (!editable ? "Only the subject teacher or an administrator can change these outcomes." : null)}</ErrorNote>
        <fieldset disabled={!editable || busy} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-grid">
            <label className="field">
              <span>
                Outcome code<span className="req">*</span>
              </span>
              <input name="code" required maxLength={40} defaultValue={outcome?.code} placeholder="e.g. LO-MAT-001" />
            </label>
            <label className="field">
              <span>Bloom level</span>
              <select name="bloom_level" defaultValue={outcome?.bloom_level ?? ""}>
                <option value="">Not set</option>
                {BLOOM.map((b) => (
                  <option key={b} value={b}>
                    {label(b)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field full">
              <span>
                Learning outcome<span className="req">*</span>
              </span>
              <textarea name="statement" required minLength={2} defaultValue={outcome?.statement} placeholder="What the student will be able to do" />
            </label>
            <label className="field full">
              <span>Unit</span>
              <select value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
                <option value="">Whole subject</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            {topics.length ? (
              <div className="field full">
                <span>{`Topics that teach it · ${topicIds.size} chosen`}</span>
                <div className="checklist" style={{ maxHeight: 180, overflow: "auto" }}>
                  {topics.map((t) => (
                    <div className="check-item" key={t.id}>
                      <input
                        type="checkbox"
                        id={`lo-topic-${t.id}`}
                        checked={topicIds.has(t.id)}
                        onChange={(e) => {
                          const n = new Set(topicIds);
                          if (e.target.checked) n.add(t.id);
                          else n.delete(t.id);
                          setTopicIds(n);
                        }}
                      />
                      <label htmlFor={`lo-topic-${t.id}`}>{t.title}</label>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </fieldset>
        <div className="actions row" style={{ marginTop: 18, justifyContent: "flex-end", gap: 8 }}>
          {outcome && editable ? (
            <>
              <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.patch(`${base}/${outcome.id}`, { is_active: !outcome.is_active }), outcome.is_active ? "Outcome retired." : "Outcome restored.")}>
                {outcome.is_active ? "Retire" : "Restore"}
              </button>
              <button type="button" className="btn" disabled={busy} onClick={async () => (await ask(`Delete ${outcome.code}?`)) && run(() => api.delete(`${base}/${outcome.id}`), "Outcome deleted.")}>
                Delete
              </button>
            </>
          ) : null}
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          {editable ? (
            <button type="submit" className="btn primary" disabled={busy}>
              <Icon name="check" className="sm" />
              {busy ? "Saving…" : "Save outcome"}
            </button>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
