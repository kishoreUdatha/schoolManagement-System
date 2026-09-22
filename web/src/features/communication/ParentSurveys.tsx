"use client";

/*
 * NEW-027 · Parent surveys. Feedback surveys the school sends to parents:
 * the list with responses so far (GET /api/v1/school/parent-services/surveys),
 * a builder for the title, audience (all parents or one class) and questions
 * (rating 1–5, a choice, or free text) (POST / PUT …/surveys/{id}), opening
 * and closing (POST …/{id}/status), and the results (GET …/{id}/results).
 * Parents answer in the parent app.
 */

import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { useYears } from "@/features/academics/setupKit";

import { ask } from "@/lib/dialog";
const S = "/api/v1/school/parent-services/surveys";

type Kind = "rating" | "choice" | "text";
type Question = { id: string; text: string; kind: Kind; options: string[]; required: boolean };
type SurveyStatus = "draft" | "open" | "closed";
type Survey = {
  id: number;
  title: string;
  description: string | null;
  audience: "all" | "class";
  class_id: number | null;
  class_name: string | null;
  questions: Question[];
  status: SurveyStatus;
  closes_on: string | null;
  created_at: string;
  response_count: number | null;
  audience_count: number | null;
};
type Results = {
  survey: Survey;
  questions: { id: string; text: string; kind: Kind; answered: number; average: number | null; counts: Record<string, number>; comments: string[] }[];
};
type SchoolClass = { id: number; name: string };

const STATUS: Record<SurveyStatus, string> = { draft: "Draft", open: "Open", closed: "Closed" };
const KINDS: [Kind, string][] = [
  ["rating", "Rating 1–5"],
  ["choice", "One choice"],
  ["text", "Free text"],
];

const blankQuestion = (n: number): Question => ({ id: `q${n}`, text: "", kind: "rating", options: [], required: true });

export function ParentSurveys() {
  const surveys = useApi<Survey[]>(S);
  const [editing, setEditing] = useState<Survey | "new" | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const list = surveys.data ?? [];

  async function setStatus(s: Survey, status: SurveyStatus) {
    setFailed(null);
    try {
      await api.post(`${S}/${s.id}/status`, { status });
      notify(status === "open" ? "Survey opened. Parents can answer it now." : status === "closed" ? "Survey closed." : "Moved back to draft.");
      surveys.reload();
    } catch (e) {
      setFailed(errorText(e));
    }
  }

  async function remove(s: Survey) {
    if (!(await ask(`Delete “${s.title}”?`))) return;
    setFailed(null);
    try {
      await api.delete(`${S}/${s.id}`);
      notify("Survey deleted.");
      surveys.reload();
    } catch (e) {
      setFailed(errorText(e));
    }
  }

  const num = (v: number) => (surveys.data ? String(v) : "…");
  const openNow = list.filter((s) => s.status === "open");
  const answered = list.reduce((t, s) => t + (s.response_count ?? 0), 0);
  const openAnswered = openNow.reduce((t, s) => t + (s.response_count ?? 0), 0);
  const openAudience = openNow.reduce((t, s) => t + (s.audience_count ?? 0), 0);
  const stats = [
    { label: "Open", value: num(openNow.length), note: "Parents can answer now" },
    { label: "Drafts", value: num(list.filter((s) => s.status === "draft").length), note: "Not sent to parents yet" },
    { label: "Responses", value: num(answered), note: "Across all surveys" },
    { label: "Response rate", value: surveys.data ? (openAudience ? `${Math.round((openAnswered / openAudience) * 100)}%` : "—") : "…", note: "Open surveys" },
  ];

  const rows: Row[] = list.map((s) => [
    { name: s.title, sub: `${s.questions.length} question${s.questions.length === 1 ? "" : "s"}` },
    s.audience === "class" ? `Parents of ${s.class_name ?? "a class"}` : "All parents",
    `${s.response_count ?? 0} of ${s.audience_count ?? 0}`,
    s.closes_on ? date(s.closes_on) : "—",
    STATUS[s.status],
  ]);

  return (
    <>
      <StatStrip items={stats} compact />
      <ErrorNote>{failed ?? surveys.error}</ErrorNote>
      {editing ? (
        <SurveyForm
          survey={editing === "new" ? null : editing}
          onDone={() => {
            setEditing(null);
            surveys.reload();
          }}
        />
      ) : null}
      <Panel
        title="Surveys"
        sub="Parents see open surveys in the parent app under Feedback survey."
        flush
        action={
          <button type="button" className="btn primary" onClick={() => setEditing("new")}>
            New survey
          </button>
        }
      >
        {surveys.loading && !surveys.data ? (
          <Loading what="Loading surveys…" />
        ) : (
          <DataTable
            columns={["Survey", "Audience", "Responses", "Closes", "Status"]}
            rows={rows}
            selectable={false}
            empty="No surveys yet. Create one to ask parents for feedback."
            actions={(i) => {
              const s = list[i];
              return (
                <>
                  <button type="button" className="btn" onClick={() => setViewing(s.id)}>
                    Results
                  </button>
                  {s.status !== "open" ? (
                    <button type="button" className="btn" onClick={() => setStatus(s, "open")}>
                      Open
                    </button>
                  ) : (
                    <button type="button" className="btn" onClick={() => setStatus(s, "closed")}>
                      Close
                    </button>
                  )}
                  <button type="button" className="btn" onClick={() => setEditing(s)}>
                    Edit
                  </button>
                  {!s.response_count ? (
                    <button type="button" className="btn" onClick={() => remove(s)}>
                      Delete
                    </button>
                  ) : null}
                </>
              );
            }}
          />
        )}
      </Panel>
      {viewing ? <SurveyResults key={viewing} id={viewing} /> : null}
    </>
  );
}

function SurveyForm({ survey, onDone }: { survey: Survey | null; onDone: () => void }) {
  const { yearId } = useYears();
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const [f, setF] = useState({
    title: survey?.title ?? "",
    description: survey?.description ?? "",
    audience: survey?.audience ?? "all",
    class_id: survey?.class_id ? String(survey.class_id) : "",
    closes_on: survey?.closes_on ?? "",
    status: survey?.status ?? ("draft" as SurveyStatus),
  });
  const [qs, setQs] = useState<Question[]>(survey?.questions ?? [blankQuestion(1)]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const answered = Boolean(survey?.response_count);

  const setQ = (i: number, patch: Partial<Question>) => setQs(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const nextId = () => {
    const used = new Set(qs.map((q) => q.id));
    let n = qs.length + 1;
    while (used.has(`q${n}`)) n += 1;
    return n;
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(null);
    const body = {
      title: f.title.trim(),
      description: f.description.trim() || null,
      audience: f.audience,
      class_id: f.audience === "class" && f.class_id ? Number(f.class_id) : null,
      closes_on: f.closes_on || null,
      status: f.status,
      questions: qs.map((q) => ({ ...q, text: q.text.trim(), options: q.kind === "choice" ? q.options.map((o) => o.trim()).filter(Boolean) : [] })),
    };
    try {
      if (survey) await api.put(`${S}/${survey.id}`, body);
      else await api.post(S, body);
      notify(survey ? "Survey saved." : f.status === "open" ? "Survey created and opened." : "Survey saved as a draft.");
      onDone();
    } catch (err) {
      setFailed(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Panel title={survey ? `Edit “${survey.title}”` : "New survey"} sub={answered ? "Parents have answered this survey, so its questions are fixed." : "Up to 30 questions."}>
      <ErrorNote>{failed ?? classes.error}</ErrorNote>
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            <span>
              Title<span className="req">*</span>
            </span>
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={3} maxLength={200} />
          </label>
          <label className="field">
            <span>Audience</span>
            <select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value as "all" | "class" })}>
              <option value="all">All parents</option>
              <option value="class">Parents of one class</option>
            </select>
          </label>
          {f.audience === "class" ? (
            <label className="field">
              <span>
                Class<span className="req">*</span>
              </span>
              <select value={f.class_id} onChange={(e) => setF({ ...f, class_id: e.target.value })} required>
                <option value="">Select class</option>
                {(classes.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="field">
            <span>Closes on</span>
            <input type="date" value={f.closes_on} onChange={(e) => setF({ ...f, closes_on: e.target.value })} />
          </label>
          <label className="field">
            <span>Status</span>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as SurveyStatus })}>
              <option value="draft">Draft (parents don’t see it)</option>
              <option value="open">Open for answers</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label className="field full">
            <span>Introduction</span>
            <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} />
          </label>
        </div>
        <h3 style={{ margin: "18px 0 8px" }}>Questions</h3>
        {qs.map((q, i) => (
          <div key={q.id} className="form-grid" style={{ borderTop: "1px solid #e5e7eb", paddingTop: 12, marginTop: 12 }}>
            <label className="field full">
              <span>{`Question ${i + 1}`}</span>
              <input value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} required minLength={2} maxLength={300} disabled={answered} />
            </label>
            <label className="field">
              <span>Answer type</span>
              <select value={q.kind} onChange={(e) => setQ(i, { kind: e.target.value as Kind })} disabled={answered}>
                {KINDS.map(([k, t]) => (
                  <option key={k} value={k}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Required</span>
              <select value={q.required ? "yes" : "no"} onChange={(e) => setQ(i, { required: e.target.value === "yes" })} disabled={answered}>
                <option value="yes">Required</option>
                <option value="no">Optional</option>
              </select>
            </label>
            {q.kind === "choice" ? (
              <label className="field full">
                <span>Options (one per line)</span>
                <textarea rows={3} value={q.options.join("\n")} onChange={(e) => setQ(i, { options: e.target.value.split("\n") })} disabled={answered} />
              </label>
            ) : null}
            {!answered && qs.length > 1 ? (
              <div>
                <button type="button" className="btn" onClick={() => setQs(qs.filter((_, j) => j !== i))}>
                  Remove question
                </button>
              </div>
            ) : null}
          </div>
        ))}
        <div className="gap" style={{ marginTop: 16 }}>
          {!answered && qs.length < 30 ? (
            <button type="button" className="btn" onClick={() => setQs([...qs, blankQuestion(nextId())])}>
              Add question
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onDone}>
            Cancel
          </button>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save survey"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

function SurveyResults({ id }: { id: number }) {
  const r = useApi<Results>(`${S}/${id}/results`);
  if (r.loading && !r.data) return <Loading what="Loading results…" />;
  if (!r.data) return <ErrorNote>{r.error ?? "Results not found."}</ErrorNote>;
  const { survey, questions } = r.data;
  return (
    <Panel title={`Results · ${survey.title}`} sub={`${survey.response_count ?? 0} of ${survey.audience_count ?? 0} parents answered`}>
      {questions.map((q, i) => (
        <div key={q.id} style={{ marginBottom: 18 }}>
          <h3>{`${i + 1}. ${q.text}`}</h3>
          <p className="muted small">
            {q.answered} answer{q.answered === 1 ? "" : "s"}
            {q.average !== null ? ` · average ${q.average.toFixed(1)} / 5` : ""}
          </p>
          {q.kind !== "text" ? (
            <div className="gap">
              {Object.entries(q.counts).map(([k, n]) => (
                <Badge key={k} tone={n ? "blue" : "neutral"}>{`${q.kind === "rating" ? `${k}★` : k}: ${n}`}</Badge>
              ))}
            </div>
          ) : q.comments.length ? (
            <ul>
              {q.comments.map((c, j) => (
                <li key={j}>{c}</li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No comments yet.</p>
          )}
        </div>
      ))}
    </Panel>
  );
}
