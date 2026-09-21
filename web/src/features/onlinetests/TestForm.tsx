"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { Field, localInput } from "./kit";
import type { ClassSubjectRow, TestDetail, TestRead } from "./types";

const NEGATIVE: [string, string][] = [
  ["0", "None"],
  ["0.25", "−¼ of the question's marks per wrong answer"],
  ["0.33", "−⅓ of the question's marks per wrong answer"],
  ["0.5", "−½ of the question's marks per wrong answer"],
  ["1", "−the full marks per wrong answer"],
];

/**
 * Create or edit an online test's details: POST /school/online-tests or
 * PUT /school/online-tests/{id} (TestIn). Times go with the browser's
 * timezone offset, which the API requires.
 */
export function TestForm({ test, classSubjects, onClose, onSaved }: { test: TestRead | null; classSubjects: ClassSubjectRow[]; onClose: () => void; onSaved: (t: TestDetail) => void }) {
  const t = test;
  const writable = classSubjects.filter((c) => c.can_edit || c.class_subject_id === t?.class_subject_id);
  const [csId, setCsId] = useState<string>(t ? String(t.class_subject_id) : writable[0] ? String(writable[0].class_subject_id) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sections = classSubjects.find((c) => String(c.class_subject_id) === csId)?.sections ?? [];
  const negative = t ? String(Number(t.negative_marking)) : "0";

  async function submit(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const starts = new Date(text("starts_at"));
    const ends = new Date(text("ends_at"));
    const minutes = Number(text("duration_minutes"));
    if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime())) return setError("Enter when the test opens and closes.");
    if (ends <= starts) return setError("The test must close after it opens.");
    if ((ends.getTime() - starts.getTime()) / 60000 < minutes) return setError("The window is shorter than the test's duration.");
    const body = {
      class_subject_id: Number(csId),
      section_id: text("section_id") ? Number(text("section_id")) : null,
      title: text("title"),
      instructions: text("instructions") || null,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      duration_minutes: minutes,
      shuffle_questions: f.get("shuffle_questions") === "on",
      shuffle_options: f.get("shuffle_options") === "on",
      negative_marking: text("negative_marking") || "0",
      result_visibility: text("result_visibility"),
    };
    setSaving(true);
    setError(null);
    try {
      const saved = t ? await api.put<TestDetail>(`/api/v1/school/online-tests/${t.id}`, body) : await api.post<TestDetail>("/api/v1/school/online-tests", body);
      onSaved(saved);
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
      title={t ? "Edit test details" : "New online test"}
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : t ? "Save test" : "Create test"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      {!writable.length ? <p className="muted">You do not teach any class-subject this year, so there is nothing to set a test for.</p> : null}
      <div className="form-grid">
        <Field label="Class & subject" required>
          <select value={csId} onChange={(e) => setCsId(e.target.value)} required disabled={Boolean(t && t.status !== "draft")}>
            <option value="">Choose a class and subject…</option>
            {writable.map((c) => (
              <option key={c.class_subject_id} value={c.class_subject_id}>
                {`${c.class_name} · ${c.subject_name}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Section">
          <select name="section_id" defaultValue={t?.section_id ?? ""} key={csId}>
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.section_id} value={s.section_id}>
                {s.section_label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title" required full>
          <input name="title" required minLength={2} maxLength={200} defaultValue={t?.title} placeholder="e.g. Fractions — quick check" />
        </Field>
        <Field label="Opens" required>
          <input name="starts_at" type="datetime-local" required defaultValue={localInput(t?.starts_at)} />
        </Field>
        <Field label="Closes" required>
          <input name="ends_at" type="datetime-local" required defaultValue={localInput(t?.ends_at ?? new Date(Date.now() + 86400e3).toISOString())} />
        </Field>
        <Field label="Duration (minutes)" required>
          <input name="duration_minutes" type="number" min={1} max={600} required defaultValue={t?.duration_minutes ?? 30} />
        </Field>
        <Field label="Negative marking">
          <select name="negative_marking" defaultValue={NEGATIVE.some(([v]) => v === negative) ? negative : "0"}>
            {!NEGATIVE.some(([v]) => v === negative) ? <option value={negative}>{`−${negative} × marks per wrong answer`}</option> : null}
            {NEGATIVE.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Show results to families">
          <select name="result_visibility" defaultValue={t?.result_visibility ?? "after_close"}>
            <option value="on_submit">As soon as the student submits</option>
            <option value="after_close">After the test closes</option>
            <option value="hidden">Not shown</option>
          </select>
        </Field>
        <Field label="Order">
          <span className="stack" style={{ gap: 6 }}>
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" name="shuffle_questions" defaultChecked={t ? t.shuffle_questions : true} /> Shuffle questions
            </label>
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" name="shuffle_options" defaultChecked={t ? t.shuffle_options : true} /> Shuffle options
            </label>
          </span>
        </Field>
        <Field label="Instructions" full>
          <textarea name="instructions" rows={3} maxLength={5000} defaultValue={t?.instructions ?? ""} placeholder="Shown to the student before they start" />
        </Field>
      </div>
    </Dialog>
  );
}
