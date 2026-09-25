"use client";

import { CheckCircle2, Sparkles, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAiEnabled } from "@/lib/ai";
import { api, apiError } from "@/lib/api";

type Status = "absent" | "late" | "half_day";
type AttEntry = { student_id: number; student_name: string; status: Status; remark: string };
type Draft = {
  summary: string;
  attendance: {
    include: boolean;
    section_id: number;
    section_label?: string;
    date: string;
    entries: AttEntry[];
    mark_others_present: boolean;
    roster_size?: number;
  };
  homework: {
    class_subject_id: number;
    subject: string;
    class: string;
    title: string;
    description: string;
    due_date: string;
  }[];
  unmatched: string[];
  questions: string[];
};
type ClassCard = { section_id: number; section_label: string; is_current_year: boolean };

const EXAMPLE =
  "Ravi and Priya absent today, Priya has fever. Arun came 15 min late. Rest present.\n" +
  "Maths homework: exercise 5.2 questions 1 to 10, due Friday.";

const inputCls =
  "w-full rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink";

export default function SmartEntryPage() {
  const aiEnabled = useAiEnabled();
  const [text, setText] = useState("");
  const [sections, setSections] = useState<ClassCard[]>([]);
  const [sectionId, setSectionId] = useState<number | "">("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>([]);

  useEffect(() => {
    api
      .get<{ class_teacher_of: ClassCard[] }>("/api/v1/teacher/my-classes")
      .then((r) => {
        const cur = r.data.class_teacher_of.filter((c) => c.is_current_year);
        setSections(cur);
        if (cur[0]) setSectionId(cur[0].section_id);
      })
      .catch(() => undefined);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDraft(null);
    setSaved([]);
    try {
      const { data } = await api.post<Draft>(
        "/api/v1/ai/teacher/smart-entry",
        { text, section_id: sectionId || null },
        { timeout: 120_000 }
      );
      setDraft(data);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveAttendance() {
    if (!draft) return;
    const a = draft.attendance;
    setError(null);
    try {
      let entries: { student_id: number; status: string; remark: string | null }[] = a.entries.map((x) => ({
        student_id: x.student_id,
        status: x.status,
        remark: x.remark || null,
      }));
      if (a.mark_others_present) {
        const { data } = await api.get<{ rows: { student_id: number }[] }>("/api/v1/teacher/attendance", {
          params: { section_id: a.section_id, date: a.date },
        });
        const listed = new Set(entries.map((x) => x.student_id));
        entries = [
          ...entries,
          ...data.rows
            .filter((r) => !listed.has(r.student_id))
            .map((r) => ({ student_id: r.student_id, status: "present", remark: null })),
        ];
      }
      if (!entries.length) return;
      const { data } = await api.post<{ saved: number; absence_alerts_sent: number }>(
        "/api/v1/teacher/attendance/save",
        { section_id: a.section_id, date: a.date, entries }
      );
      setSaved((s) => [
        ...s,
        `Attendance saved for ${a.section_label} (${data.saved} students, ${data.absence_alerts_sent} parent alerts).`,
      ]);
      setDraft({ ...draft, attendance: { ...a, include: false } });
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function saveHomework(i: number, notify: boolean) {
    if (!draft) return;
    const h = draft.homework[i];
    setError(null);
    try {
      await api.post("/api/v1/teacher/homework", {
        class_subject_id: h.class_subject_id,
        title: h.title,
        description: h.description,
        due_date: h.due_date,
        notify_parents: notify,
      });
      setSaved((s) => [...s, `Homework "${h.title}" set for ${h.class}.`]);
      setDraft({ ...draft, homework: draft.homework.filter((_, j) => j !== i) });
    } catch (err) {
      setError(apiError(err));
    }
  }

  function patchEntry(i: number, patch: Partial<AttEntry>) {
    if (!draft) return;
    const entries = draft.attendance.entries.map((e, j) => (j === i ? { ...e, ...patch } : e));
    setDraft({ ...draft, attendance: { ...draft.attendance, entries } });
  }

  function patchHomework(i: number, patch: Partial<Draft["homework"][number]>) {
    if (!draft) return;
    setDraft({ ...draft, homework: draft.homework.map((h, j) => (j === i ? { ...h, ...patch } : h)) });
  }

  const a = draft?.attendance;
  const othersPresent = a && a.roster_size != null ? a.roster_size - a.entries.length : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <Sparkles className="h-6 w-6 text-brand-500" /> Smart entry
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Type what happened in class in your own words. AI fills in attendance and homework for you to
          check. Nothing is saved until you press Save.
        </p>
      </div>

      {!aiEnabled && (
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          AI is not configured on this server. Ask your administrator to set ANTHROPIC_API_KEY.
        </div>
      )}

      <Card>
        <CardBody>
          <form onSubmit={submit} className="space-y-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              maxLength={4000}
              placeholder={EXAMPLE}
              className={inputCls}
            />
            <div className="flex flex-wrap items-center gap-3">
              {sections.length > 1 && (
                <select
                  value={sectionId}
                  onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
                  className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-ink"
                >
                  {sections.map((s) => (
                    <option key={s.section_id} value={s.section_id}>
                      {s.section_label}
                    </option>
                  ))}
                </select>
              )}
              <Button type="submit" loading={busy} disabled={!aiEnabled || text.trim().length < 3} className="gap-2">
                <Sparkles className="h-4 w-4" /> Create draft
              </Button>
              {!text && (
                <button type="button" onClick={() => setText(EXAMPLE)} className="text-xs text-brand-600 hover:underline">
                  Use example
                </button>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

      {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      {saved.map((m, i) => (
        <div key={i} className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> {m}
        </div>
      ))}

      {draft && (
        <>
          {draft.summary && <p className="text-sm text-ink-muted">{draft.summary}</p>}

          {(draft.unmatched.length > 0 || draft.questions.length > 0) && (
            <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {draft.unmatched.length > 0 && (
                <p>
                  Couldn&apos;t match: <strong>{draft.unmatched.join(", ")}</strong>. Add them by hand if needed.
                </p>
              )}
              {draft.questions.map((q, i) => (
                <p key={i}>• {q}</p>
              ))}
            </div>
          )}

          {a?.include && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Attendance · {a.section_label} · {a.date}
                </CardTitle>
                <Button onClick={saveAttendance} disabled={!a.entries.length && !a.mark_others_present}>
                  Save attendance
                </Button>
              </CardHeader>
              <CardBody className="space-y-2">
                {a.entries.map((e, i) => (
                  <div key={e.student_id} className="flex flex-wrap items-center gap-2">
                    <span className="w-44 font-medium text-ink">{e.student_name}</span>
                    <select
                      value={e.status}
                      onChange={(ev) => patchEntry(i, { status: ev.target.value as Status })}
                      className="rounded-lg border border-surface-border bg-surface-raised px-2 py-1.5 text-sm text-ink"
                    >
                      <option value="absent">Absent</option>
                      <option value="late">Late</option>
                      <option value="half_day">Half day</option>
                    </select>
                    <input
                      value={e.remark}
                      onChange={(ev) => patchEntry(i, { remark: ev.target.value })}
                      placeholder="Remark"
                      maxLength={300}
                      className="min-w-[10rem] flex-1 rounded-lg border border-surface-border bg-surface-raised px-2 py-1.5 text-sm text-ink"
                    />
                    <button
                      onClick={() =>
                        setDraft({
                          ...draft,
                          attendance: { ...a, entries: a.entries.filter((_, j) => j !== i) },
                        })
                      }
                      aria-label="Remove"
                      className="text-ink-subtle hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <label className="flex items-center gap-2 pt-1 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={a.mark_others_present}
                    onChange={(ev) => setDraft({ ...draft, attendance: { ...a, mark_others_present: ev.target.checked } })}
                  />
                  Mark everyone else present{othersPresent != null ? ` (${othersPresent} students)` : ""}
                </label>
              </CardBody>
            </Card>
          )}

          {draft.homework.map((h, i) => (
            <HomeworkDraft
              key={i}
              h={h}
              onChange={(p) => patchHomework(i, p)}
              onSave={(notify) => saveHomework(i, notify)}
              onDiscard={() => setDraft({ ...draft, homework: draft.homework.filter((_, j) => j !== i) })}
            />
          ))}

          {!a?.include && draft.homework.length === 0 && saved.length === 0 && (
            <p className="text-sm text-ink-muted">Nothing to save from that message.</p>
          )}
        </>
      )}
    </div>
  );
}

function HomeworkDraft({
  h,
  onChange,
  onSave,
  onDiscard,
}: {
  h: Draft["homework"][number];
  onChange: (p: Partial<Draft["homework"][number]>) => void;
  onSave: (notify: boolean) => void;
  onDiscard: () => void;
}) {
  const [notify, setNotify] = useState(true);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Homework · {h.subject} · {h.class}
        </CardTitle>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDiscard}>
            Discard
          </Button>
          <Button onClick={() => onSave(notify)}>Save homework</Button>
        </div>
      </CardHeader>
      <CardBody className="space-y-2">
        <input value={h.title} onChange={(e) => onChange({ title: e.target.value })} maxLength={200} className={inputCls} />
        <textarea
          value={h.description}
          onChange={(e) => onChange({ description: e.target.value })}
          rows={3}
          className={inputCls}
        />
        <div className="flex flex-wrap items-center gap-4 text-sm text-ink">
          <label className="flex items-center gap-2">
            Due
            <input
              type="date"
              value={h.due_date}
              onChange={(e) => onChange({ due_date: e.target.value })}
              className="rounded-lg border border-surface-border bg-surface-raised px-2 py-1.5 text-sm text-ink"
            />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Notify parents
          </label>
        </div>
      </CardBody>
    </Card>
  );
}
