"use client";

/*
 * PM-054 · Feedback survey. Surveys the school has opened for this parent
 * (GET /parent/me/surveys: everyone, or the parents of one class), each
 * with its questions and whether this parent has answered. Answers go to
 * POST /parent/me/surveys/{id}/responses and can be changed while the
 * survey is open.
 */

import { useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { PmEmpty, PmError, PmLoading } from "./pm";
import { ME, type Survey } from "./services";

export function FeedbackSurvey() {
  const { go } = useParent();
  const surveys = useApi<Survey[]>(`${ME}/surveys`);
  const [openId, setOpenId] = useState<number | null>(null);

  if (surveys.loading && !surveys.data) return <PmLoading />;
  const list = surveys.data ?? [];
  const current = list.find((s) => s.id === openId) ?? null;

  if (current) {
    return (
      <SurveyForm
        survey={current}
        onDone={() => {
          setOpenId(null);
          surveys.reload();
        }}
      />
    );
  }

  const open = list.filter((s) => s.status === "open");
  return (
    <>
      <PmError>{surveys.error}</PmError>
      {list.length === 0 && !surveys.error ? (
        <PmEmpty title="No feedback surveys">There is no survey open for you right now. You can still share feedback with your child’s teachers.</PmEmpty>
      ) : null}
      {open.length ? <p className="lead">Your feedback helps the school improve. Answers go to the school office.</p> : null}
      {list.map((s) => (
        <button key={s.id} className="item" onClick={() => setOpenId(s.id)}>
          <span>
            <strong>{s.title}</strong>
            <small>
              {s.questions.length} question{s.questions.length === 1 ? "" : "s"}
              {s.class_name ? ` · ${s.class_name} parents` : ""}
              {s.closes_on ? ` · closes ${date(s.closes_on)}` : ""}
            </small>
          </span>
          <span className={s.submitted ? "value good" : s.status === "open" ? "value warning" : "value"}>
            {s.submitted ? "Submitted" : s.status === "open" ? "Answer" : "Closed"}
          </span>
        </button>
      ))}
      <button className="action secondary" onClick={() => go(45)}>
        Share feedback with a teacher
      </button>
    </>
  );
}

function SurveyForm({ survey: s, onDone }: { survey: Survey; onDone: () => void }) {
  const { notify } = useParent();
  const [answers, setAnswers] = useState<Record<string, string | number>>(s.my_answers ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const editable = s.status === "open";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post(`${ME}/surveys/${s.id}/responses`, { answers });
      notify(s.submitted ? "Your answers were updated." : "Thank you — your feedback was sent.");
      onDone();
    } catch (e2) {
      setErr(errorText(e2));
      setBusy(false);
    }
  }

  const set = (id: string, v: string | number) => setAnswers({ ...answers, [id]: v });

  return (
    <form onSubmit={submit}>
      <span className={s.submitted ? "status" : "status amber"}>{s.submitted ? `Submitted ${date(s.submitted_at)}` : editable ? "Open" : "Closed"}</span>
      <h2>{s.title}</h2>
      {s.description ? <p>{s.description}</p> : null}
      <PmError>{err}</PmError>
      {s.questions.map((q, i) => (
        <div key={q.id} className="panel soft">
          <span className="eyebrow">
            QUESTION {i + 1}
            {q.required ? "" : " · OPTIONAL"}
          </span>
          <h3>{q.text}</h3>
          {q.kind === "rating" ? (
            <div className="homework-tabs" role="radiogroup" aria-label={q.text}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={Number(answers[q.id]) === n}
                  className={Number(answers[q.id]) === n ? "selected" : undefined}
                  disabled={!editable}
                  onClick={() => set(q.id, n)}
                  style={{ width: "20%" }}
                >
                  {n}
                </button>
              ))}
            </div>
          ) : q.kind === "choice" ? (
            <label className="field">
              Your answer
              <select value={String(answers[q.id] ?? "")} onChange={(e) => set(q.id, e.target.value)} disabled={!editable} required={q.required}>
                <option value="">Choose…</option>
                {q.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className="field">
              Your answer
              <textarea rows={3} value={String(answers[q.id] ?? "")} onChange={(e) => set(q.id, e.target.value)} disabled={!editable} required={q.required} maxLength={2000} />
            </label>
          )}
          {q.kind === "rating" ? <small>1 = very unhappy · 5 = very happy</small> : null}
        </div>
      ))}
      {editable ? (
        <button className="action" type="submit" disabled={busy}>
          {busy ? "Sending…" : s.submitted ? "Update my answers" : "Submit feedback"}
        </button>
      ) : null}
      <button className="action secondary" type="button" onClick={onDone}>
        Back to surveys
      </button>
    </form>
  );
}
