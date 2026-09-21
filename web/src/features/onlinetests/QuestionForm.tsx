"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { BLOOMS, DIFFICULTIES, Field, KINDS, cap } from "./kit";
import type { Bloom, Difficulty, Kind, Question } from "./types";

const KEYS = ["A", "B", "C", "D", "E", "F", "G", "H"];

type Subject = { id: number; name: string; classes: string[]; writable: boolean };

/**
 * Add or edit one bank question: POST /school/questions or PUT
 * /school/questions/{id}. The answer's shape follows the type — option keys
 * for choice and true/false, a value ± tolerance for numeric, an optional
 * model answer for short answers (marked by the teacher).
 */
export function QuestionForm({
  question,
  subjects,
  defaultSubject,
  onClose,
  onSaved,
}: {
  question: Question | null;
  subjects: Subject[];
  defaultSubject?: number | null;
  onClose: () => void;
  onSaved: (again: boolean) => void;
}) {
  const q = question;
  const writable = subjects.filter((s) => s.writable || s.id === q?.subject_id);
  const [subjectId, setSubjectId] = useState<string>(q ? String(q.subject_id) : defaultSubject ? String(defaultSubject) : "");
  const [kind, setKind] = useState<Kind>(q?.kind ?? "single");
  const [options, setOptions] = useState<string[]>(q && (q.kind === "single" || q.kind === "multiple") ? q.options.map((o) => o.text) : ["", "", "", ""]);
  const [correct, setCorrect] = useState<Set<string>>(new Set(q?.answer.keys ?? []));
  const [again, setAgain] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [round, setRound] = useState(0);

  const choice = kind === "single" || kind === "multiple";
  const subject = subjects.find((s) => String(s.id) === subjectId);

  function toggle(key: string) {
    if (kind === "multiple") {
      const n = new Set(correct);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      setCorrect(n);
    } else setCorrect(new Set([key]));
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const f = new FormData(form);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const opts = options.map((t, i) => ({ key: KEYS[i], text: t.trim() })).filter((o) => o.text);
    if (choice && opts.length < 2) return setError("Add at least two options.");
    if ((choice || kind === "true_false") && !correct.size) return setError("Mark the correct answer.");
    if (choice && [...correct].some((k) => !opts.some((o) => o.key === k))) return setError("A ticked option is empty.");
    const answer =
      kind === "numeric"
        ? { value: Number(text("value")), tolerance: text("tolerance") === "" ? 0 : Number(text("tolerance")) }
        : kind === "short"
          ? text("model_answer")
            ? { model_answer: text("model_answer") }
            : {}
          : { keys: [...correct] };
    const body = {
      subject_id: Number(subjectId),
      class_level: text("class_level") || null,
      chapter_id: q?.chapter_id ?? null,
      topic: text("topic") || null,
      kind,
      text: text("text"),
      options: choice ? opts : [],
      answer,
      explanation: text("explanation") || null,
      marks: text("marks") || "1",
      bloom_level: text("bloom_level") as Bloom,
      difficulty: text("difficulty") as Difficulty,
    };
    setSaving(true);
    setError(null);
    try {
      if (q) await api.put(`/api/v1/school/questions/${q.id}`, body);
      else await api.post("/api/v1/school/questions", body);
      onSaved(again && !q);
      if (again && !q) {
        // Keep subject, type and levels; clear the question itself.
        setOptions(["", "", "", ""]);
        setCorrect(new Set());
        setRound((r) => r + 1);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title={q ? "Edit question" : "New question"}
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          {!q ? (
            <label className="row small muted" style={{ marginRight: "auto", gap: 6 }}>
              <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} /> Add another after saving
            </label>
          ) : null}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : "Save question"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      {q && q.used_in_tests > 0 ? (
        <div className="tip warn">
          <span>{`Used in ${q.used_in_tests} test${q.used_in_tests === 1 ? "" : "s"}. Once a test is published its answers cannot change.`}</span>
        </div>
      ) : null}
      <div className="form-grid" key={round}>
        <Field label="Subject" required>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} required>
            <option value="">Choose a subject…</option>
            {writable.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Class level">
          <select name="class_level" defaultValue={q?.class_level ?? ""} key={subjectId}>
            <option value="">Any class</option>
            {q?.class_level && !subject?.classes.includes(q.class_level) ? <option value={q.class_level}>{q.class_level}</option> : null}
            {(subject?.classes ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type" required>
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind);
              setCorrect(new Set());
            }}
          >
            {KINDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Topic">
          <input name="topic" maxLength={200} defaultValue={q?.topic ?? ""} placeholder="e.g. Fractions" />
        </Field>
        <Field label="Bloom's level" required>
          <select name="bloom_level" defaultValue={q?.bloom_level ?? "remember"}>
            {BLOOMS.map((b) => (
              <option key={b} value={b}>
                {cap(b)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Difficulty">
          <select name="difficulty" defaultValue={q?.difficulty ?? "medium"}>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {cap(d)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Marks" required>
          <input name="marks" type="number" min={0.25} max={100} step={0.25} required defaultValue={q ? Number(q.marks) : 1} />
        </Field>
        <Field label="Question" required full>
          <textarea name="text" rows={3} required minLength={2} maxLength={5000} defaultValue={q?.text} placeholder="Type the question" />
        </Field>
      </div>

      {choice ? (
        <div className="stack" style={{ gap: 8 }}>
          <span className="small muted">{`Options — tick the correct ${kind === "multiple" ? "ones" : "one"}`}</span>
          {options.map((o, i) => (
            <div className="row" key={i} style={{ gap: 8 }}>
              <input
                type={kind === "multiple" ? "checkbox" : "radio"}
                name="correct"
                checked={correct.has(KEYS[i])}
                onChange={() => toggle(KEYS[i])}
                aria-label={`Option ${KEYS[i]} is correct`}
              />
              <strong style={{ width: 16 }}>{KEYS[i]}</strong>
              <input
                style={{ flex: 1 }}
                value={o}
                maxLength={1000}
                onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={i < 2 ? "Required" : "Optional"}
                aria-label={`Option ${KEYS[i]}`}
              />
              {options.length > 2 ? (
                <button
                  type="button"
                  className="btn text"
                  aria-label={`Remove option ${KEYS[i]}`}
                  onClick={() => {
                    setOptions(options.filter((_, j) => j !== i));
                    setCorrect(new Set());
                  }}
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
          {options.length < KEYS.length ? (
            <div>
              <button type="button" className="btn text" onClick={() => setOptions([...options, ""])}>
                + Add option
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {kind === "true_false" ? (
        <div className="row" style={{ gap: 20 }}>
          {[
            ["T", "True"],
            ["F", "False"],
          ].map(([k, l]) => (
            <label key={k} className="row" style={{ gap: 6 }}>
              <input type="radio" name="tf" checked={correct.has(k)} onChange={() => setCorrect(new Set([k]))} />
              {`${l} is correct`}
            </label>
          ))}
        </div>
      ) : null}

      {kind === "numeric" ? (
        <div className="form-grid" key={`n${round}`}>
          <Field label="Correct value" required>
            <input name="value" type="number" step="any" required defaultValue={q?.answer.value ?? ""} />
          </Field>
          <Field label="Allowed ± tolerance">
            <input name="tolerance" type="number" step="any" min={0} defaultValue={q?.answer.tolerance || ""} placeholder="0" />
          </Field>
        </div>
      ) : null}

      {kind === "short" ? (
        <Field label="Model answer (shown to the marker)" full>
          <textarea name="model_answer" rows={2} maxLength={5000} defaultValue={q?.answer.model_answer ?? ""} key={`m${round}`} />
        </Field>
      ) : null}

      <Field label="Explanation (shown with results)" full>
        <textarea name="explanation" rows={2} maxLength={5000} defaultValue={q?.explanation ?? ""} key={`e${round}`} />
      </Field>
    </Dialog>
  );
}
