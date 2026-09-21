"use client";

import { FormEvent, useEffect, useState } from "react";

import { BLOOMS, KINDS, cap, type Bloom, type Difficulty, type Kind, type Question } from "@/components/online-exam/types";
import { Button } from "@/components/ui/Button";
import { ErrorBox, Select, Textarea } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

export type SubjectOption = { id: number; name: string; classes: string[] };

const KEYS = ["A", "B", "C", "D", "E", "F"];

export function QuestionForm({
  open,
  question,
  subjects,
  defaultSubject,
  onClose,
  onSaved,
}: {
  open: boolean;
  question: Question | null;
  subjects: SubjectOption[];
  defaultSubject?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [classLevel, setClassLevel] = useState("");
  const [topic, setTopic] = useState("");
  const [kind, setKind] = useState<Kind>("single");
  const [text, setText] = useState("");
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correct, setCorrect] = useState<Set<string>>(new Set());
  const [value, setValue] = useState("");
  const [tolerance, setTolerance] = useState("");
  const [model, setModel] = useState("");
  const [explanation, setExplanation] = useState("");
  const [marks, setMarks] = useState("1");
  const [bloom, setBloom] = useState<Bloom>("remember");
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [error, setError] = useState<string | null>(null);
  const [keepOpen, setKeepOpen] = useState(false);

  const reset = (q: Question | null) => {
    setError(null);
    setSubjectId(q ? String(q.subject_id) : defaultSubject || (subjects[0] ? String(subjects[0].id) : ""));
    setClassLevel(q?.class_level ?? "");
    setTopic(q?.topic ?? "");
    setKind(q?.kind ?? "single");
    setText(q?.text ?? "");
    setOptions(q && (q.kind === "single" || q.kind === "multiple") ? q.options.map((o) => o.text) : ["", "", "", ""]);
    setCorrect(new Set(q?.answer.keys ?? []));
    setValue(q?.answer.value !== undefined ? String(q.answer.value) : "");
    setTolerance(q?.answer.tolerance ? String(q.answer.tolerance) : "");
    setModel(q?.answer.model_answer ?? "");
    setExplanation(q?.explanation ?? "");
    setMarks(q ? String(Number(q.marks)) : "1");
    setBloom(q?.bloom_level ?? "remember");
    setDifficulty(q?.difficulty ?? "easy");
  };

  useEffect(() => {
    if (open) reset(question);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, question]);

  const choice = kind === "single" || kind === "multiple";
  const subj = subjects.find((s) => String(s.id) === subjectId);

  function toggle(key: string) {
    const n = new Set(kind === "multiple" ? correct : []);
    if (correct.has(key) && kind === "multiple") n.delete(key);
    else n.add(key);
    setCorrect(n);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const opts = options.map((t, i) => ({ key: KEYS[i], text: t.trim() })).filter((o) => o.text);
    const body = {
      subject_id: Number(subjectId),
      class_level: classLevel || null,
      topic: topic.trim() || null,
      kind,
      text,
      options: choice ? opts : [],
      answer:
        kind === "numeric"
          ? { value: value === "" ? null : Number(value), tolerance: tolerance === "" ? 0 : Number(tolerance) }
          : kind === "short"
            ? { model_answer: model }
            : { keys: Array.from(correct) },
      explanation: explanation.trim() || null,
      marks,
      bloom_level: bloom,
      difficulty,
    };
    try {
      if (question) await api.put(`/api/v1/school/questions/${question.id}`, body);
      else await api.post("/api/v1/school/questions", body);
      onSaved();
      if (keepOpen && !question) {
        setText("");
        setOptions(["", "", "", ""]);
        setCorrect(new Set());
        setValue("");
        setModel("");
        setExplanation("");
        setError(null);
      } else onClose();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={question ? "Edit question" : "New question"} size="lg">
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox>{error}</ErrorBox>
        {question && question.used_in_tests > 0 && (
          <p className="text-xs text-warning">Used in {question.used_in_tests} test(s). If a test is published, the answer can&apos;t change.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Starts empty, so it needs an option that says so — without one
              the browser shows the first subject while the value is still ""
              and the save posts subject 0. */}
          <Select label="Subject *" required value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Choose a subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select label="Class level" value={classLevel} onChange={(e) => setClassLevel(e.target.value)}>
            <option value="">Any</option>
            {(subj?.classes ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Input label="Topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
          <Select label="Type" value={kind} onChange={(e) => {
            setKind(e.target.value as Kind);
            setCorrect(new Set());
          }}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
          <Select label="Bloom's level" value={bloom} onChange={(e) => setBloom(e.target.value as Bloom)}>
            {BLOOMS.map((b) => (
              <option key={b} value={b}>
                {cap(b)}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Select label="Difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </Select>
            <Input label="Marks" type="number" min={0.25} step={0.25} value={marks} onChange={(e) => setMarks(e.target.value)} required />
          </div>
        </div>
        <Textarea label="Question *" rows={3} value={text} onChange={(e) => setText(e.target.value)} required />

        {choice && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-ink">Options (tick the correct {kind === "multiple" ? "ones" : "one"})</div>
            {options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type={kind === "multiple" ? "checkbox" : "radio"}
                  name="correct"
                  checked={correct.has(KEYS[i])}
                  onChange={() => toggle(KEYS[i])}
                  aria-label={`Option ${KEYS[i]} is correct`}
                />
                <span className="w-4 text-sm text-ink-muted">{KEYS[i]}</span>
                <input
                  className="flex-1 rounded-md border border-surface-border bg-surface px-2 py-1 text-sm text-ink"
                  value={o}
                  onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
                  placeholder={i < 2 ? "Required" : "Optional"}
                />
              </div>
            ))}
            {options.length < KEYS.length && (
              <button type="button" className="text-xs text-brand-500 hover:underline" onClick={() => setOptions([...options, ""])}>
                + option
              </button>
            )}
          </div>
        )}
        {kind === "true_false" && (
          <div className="flex gap-4 text-sm text-ink">
            {[
              ["T", "True"],
              ["F", "False"],
            ].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2">
                <input type="radio" name="tf" checked={correct.has(k)} onChange={() => setCorrect(new Set([k]))} />
                {l} is correct
              </label>
            ))}
          </div>
        )}
        {kind === "numeric" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Correct value *" type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} required />
            <Input label="Allowed ± tolerance" type="number" step="any" min={0} value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
          </div>
        )}
        {kind === "short" && (
          <Textarea label="Model answer (shown to the marker)" rows={2} value={model} onChange={(e) => setModel(e.target.value)} />
        )}
        <Textarea label="Explanation (shown with results)" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} />
        <div className="flex flex-wrap items-center justify-end gap-3">
          {!question && (
            <label className="mr-auto flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={keepOpen} onChange={(e) => setKeepOpen(e.target.checked)} />
              Add another after saving
            </label>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
