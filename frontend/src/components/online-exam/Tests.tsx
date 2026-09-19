"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { useSubjects } from "@/components/online-exam/QuestionBank";
import type { TestRead } from "@/components/online-exam/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBox, Select, Table, Textarea, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

export const statusBadge = (t: TestRead) =>
  t.is_open ? <Badge tone="emerald">open now</Badge> : t.status === "draft" ? <Badge>draft</Badge> : t.status === "closed" ? <Badge tone="neutral">closed</Badge> : <Badge tone="brand">scheduled</Badge>;

export const fmt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

const localInput = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function TestForm({ open, test, onClose, onSaved }: { open: boolean; test: TestRead | null; onClose: () => void; onSaved: (t: TestRead) => void }) {
  const { classSubjects } = useSubjects();
  const writable = classSubjects.filter((c) => c.can_edit);
  const [sections, setSections] = useState<{ id: number; label: string }[]>([]);
  const blank = {
    class_subject_id: "",
    section_id: "",
    title: "",
    instructions: "",
    starts_at: localInput(),
    ends_at: localInput(new Date(Date.now() + 86400e3).toISOString()),
    duration_minutes: "30",
    shuffle_questions: true,
    shuffle_options: true,
    negative_marking: "0",
    result_visibility: "after_close",
  };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setF(
      test
        ? {
            class_subject_id: String(test.class_subject_id),
            section_id: test.section_id ? String(test.section_id) : "",
            title: test.title,
            instructions: test.instructions ?? "",
            starts_at: localInput(test.starts_at),
            ends_at: localInput(test.ends_at),
            duration_minutes: String(test.duration_minutes),
            shuffle_questions: test.shuffle_questions,
            shuffle_options: test.shuffle_options,
            negative_marking: String(Number(test.negative_marking)),
            result_visibility: test.result_visibility,
          }
        : { ...blank, class_subject_id: writable[0] ? String(writable[0].class_subject_id) : "" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, test, classSubjects.length]);

  // sections of the chosen class, from the syllabus summary (which carries sections)
  useEffect(() => {
    const cs = classSubjects.find((c) => String(c.class_subject_id) === f.class_subject_id);
    setSections((cs?.sections ?? []).map((s) => ({ id: s.section_id, label: s.section_label })));
  }, [f.class_subject_id, classSubjects]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      ...f,
      class_subject_id: Number(f.class_subject_id),
      section_id: f.section_id ? Number(f.section_id) : null,
      instructions: f.instructions.trim() || null,
      starts_at: new Date(f.starts_at).toISOString(),
      ends_at: new Date(f.ends_at).toISOString(),
      duration_minutes: Number(f.duration_minutes),
    };
    try {
      const r = test ? await api.put<TestRead>(`/api/v1/school/online-tests/${test.id}`, body) : await api.post<TestRead>("/api/v1/school/online-tests", body);
      onSaved(r.data);
    } catch (err) {
      setError(apiError(err));
    }
  }

  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal open={open} onClose={onClose} title={test ? "Edit test" : "New online test"} size="lg">
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox>{error}</ErrorBox>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Class & subject *" value={f.class_subject_id} onChange={(e) => setF({ ...f, class_subject_id: e.target.value, section_id: "" })}>
            {writable.map((c) => (
              <option key={c.class_subject_id} value={c.class_subject_id}>
                {c.class_name} · {c.subject_name}
              </option>
            ))}
          </Select>
          <Select label="Section" value={f.section_id} onChange={set("section_id")}>
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Input label="Title *" value={f.title} onChange={set("title")} required minLength={2} />
          <Input label="Duration (minutes) *" type="number" min={1} max={600} value={f.duration_minutes} onChange={set("duration_minutes")} required />
          <Input label="Opens *" type="datetime-local" value={f.starts_at} onChange={set("starts_at")} required />
          <Input label="Closes *" type="datetime-local" value={f.ends_at} onChange={set("ends_at")} required />
          <Select label="Negative marking" value={f.negative_marking} onChange={set("negative_marking")}>
            <option value="0">None</option>
            <option value="0.25">−¼ of the marks per wrong answer</option>
            <option value="0.33">−⅓ of the marks per wrong answer</option>
            <option value="0.5">−½ of the marks per wrong answer</option>
            <option value="1">−full marks per wrong answer</option>
          </Select>
          <Select label="Show results to parents" value={f.result_visibility} onChange={set("result_visibility")}>
            <option value="on_submit">Right after submitting</option>
            <option value="after_close">After the test closes</option>
            <option value="hidden">Don&apos;t show</option>
          </Select>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-ink">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.shuffle_questions} onChange={(e) => setF({ ...f, shuffle_questions: e.target.checked })} />
            Shuffle question order
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={f.shuffle_options} onChange={(e) => setF({ ...f, shuffle_options: e.target.checked })} />
            Shuffle options
          </label>
        </div>
        <Textarea label="Instructions" rows={2} value={f.instructions} onChange={set("instructions")} />
        <p className="text-xs text-ink-subtle">Each student gets the full duration from when they start, but never past the closing time.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!f.class_subject_id}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function TestsList({ base, canCreate = true }: { base: string; canCreate?: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState<TestRead[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<TestRead[]>("/api/v1/school/online-tests")
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      {canCreate && (
        <div>
          <Button onClick={() => setOpen(true)}>New test</Button>
        </div>
      )}
      <Card>
        <Table head={["Test", "For", "Window", "Questions", "Attempts", "Status"]} empty={items.length === 0 && "No tests yet."}>
          {items.map((t) => (
            <tr key={t.id}>
              <td className={tdStrong}>
                <Link href={`${base}/${t.id}`} className="text-brand-500 hover:underline">
                  {t.title}
                </Link>
                <div className="text-xs font-normal text-ink-subtle">
                  {t.subject_name} · {t.duration_minutes} min
                </div>
              </td>
              <td className={td}>{t.audience_label}</td>
              <td className={td}>
                {fmt(t.starts_at)}
                <div className="text-xs text-ink-subtle">to {fmt(t.ends_at)}</div>
              </td>
              <td className={td}>
                {t.question_count} · {Number(t.total_marks)} marks
              </td>
              <td className={td}>
                {t.attempts > 0 ? (
                  <Link href={`${base}/${t.id}/results`} className="text-brand-500 hover:underline">
                    {t.attempts}
                  </Link>
                ) : (
                  0
                )}
              </td>
              <td className={td}>{statusBadge(t)}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <TestForm open={open} test={null} onClose={() => setOpen(false)} onSaved={(t) => router.push(`${base}/${t.id}`)} />
    </div>
  );
}
