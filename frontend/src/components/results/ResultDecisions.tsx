"use client";

import { FormEvent, useEffect, useState } from "react";

import { PickedStudent, StudentPicker } from "@/components/StudentPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, Textarea, humanize, td, tdStrong } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Status = "withheld" | "pass_by_grace" | "failed";
type Decision = {
  id: number;
  exam_id: number;
  exam_name: string | null;
  student_id: number;
  student_name: string | null;
  student_admission_no: string | null;
  result_status: Status;
  reason: string;
  parent_note: string | null;
  version_no: number;
  decided_by_name: string | null;
  decided_at: string | null;
};
type Exam = { id: number; name: string; is_published: boolean };

const base = "/api/v1/school/result-decisions";
const TONE: Record<Status, "rose" | "amber" | "neutral"> = {
  withheld: "amber",
  failed: "rose",
  pass_by_grace: "neutral",
};
const blank = { exam_id: "", student: null as PickedStudent | null, result_status: "withheld" as Status, reason: "", parent_note: "" };

/** Results the school has decided something about: withheld while fees are
 *  outstanding, passed by grace, or failed for malpractice. The marks are
 *  never touched — this sits on top of them. */
export function ResultDecisions() {
  const [items, setItems] = useState<Decision[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [examFilter, setExamFilter] = useState("");
  const [form, setForm] = useState<typeof blank | null>(null);
  const [edit, setEdit] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api
      .get<Decision[]>(base, { params: examFilter ? { exam_id: Number(examFilter) } : {} })
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examFilter]);

  useEffect(() => {
    api
      .get<Exam[]>("/api/v1/school/exams")
      .then((r) => setExams(r.data))
      .catch(() => setExams([]));
  }, []);

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      setError(null);
      setNotice(done);
      await load();
      return true;
    } catch (e) {
      setNotice(null);
      setError(apiError(e));
      return false;
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const child = form.student;
    if (!form.exam_id || !child) {
      setError("Pick the exam and the child.");
      return;
    }
    const ok = await run(
      () =>
        api.post(base, {
          exam_id: Number(form.exam_id),
          student_id: child.id,
          result_status: form.result_status,
          reason: form.reason,
          parent_note: form.parent_note || null,
        }),
      "Decision recorded."
    );
    if (ok) setForm(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!edit) return;
    const ok = await run(
      () =>
        api.patch(`${base}/${edit.id}`, {
          result_status: edit.result_status,
          reason: edit.reason,
          parent_note: edit.parent_note || null,
          expected_version: edit.version_no,
        }),
      "Decision updated."
    );
    if (ok) setEdit(null);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Result decisions"
        subtitle="Withhold a result, pass by grace or fail — without touching the marks."
        actions={<Button onClick={() => setForm({ ...blank })}>New decision</Button>}
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      <div className="max-w-xs">
        <Select label="Exam" value={examFilter} onChange={(e) => setExamFilter(e.target.value)}>
          <option value="">All exams</option>
          {exams.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Decisions</CardTitle>
        </CardHeader>
        <CardBody>
          <Table
            head={["Child", "Exam", "Decision", "Why", "Decided by", ""]}
            empty={items.length === 0 && "No decisions — every result is whatever the marks say."}
          >
            {items.map((d) => (
              <tr key={d.id}>
                <td className={tdStrong}>
                  {d.student_name}
                  <span className="block text-xs text-ink-subtle">{d.student_admission_no}</span>
                </td>
                <td className={td}>{d.exam_name ?? "—"}</td>
                <td className={td}>
                  <Badge tone={TONE[d.result_status]}>{humanize(d.result_status)}</Badge>
                  <span className="block text-xs text-ink-subtle">v{d.version_no}</span>
                </td>
                <td className={td}>
                  {d.reason}
                  {d.parent_note && <span className="block text-xs text-ink-subtle">Parents see: {d.parent_note}</span>}
                </td>
                <td className={td}>
                  {d.decided_by_name ?? "—"}
                  {d.decided_at && (
                    <span className="block text-xs text-ink-subtle">
                      {new Date(d.decided_at).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEdit({ ...d })}>
                      Change
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => run(() => api.delete(`${base}/${d.id}`), `${d.student_name}'s result is back to normal.`)}
                    >
                      Lift
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal open={form !== null} onClose={() => setForm(null)} title="New decision" size="lg">
        {form && (
          <form className="space-y-3" onSubmit={save}>
            <Select label="Exam" required value={form.exam_id} onChange={(e) => setForm({ ...form, exam_id: e.target.value })}>
              <option value="">Pick an exam</option>
              {exams.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            <StudentPicker value={form.student} onChange={(s) => setForm({ ...form, student: s })} />
            <Select
              label="Decision"
              value={form.result_status}
              onChange={(e) => setForm({ ...form, result_status: e.target.value as Status })}
            >
              <option value="withheld">Withhold the result</option>
              <option value="pass_by_grace">Pass by grace</option>
              <option value="failed">Fail</option>
            </Select>
            <Textarea
              label="Why (kept for the school's records)"
              required
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <Textarea
              label="What parents are told"
              value={form.parent_note}
              onChange={(e) => setForm({ ...form, parent_note: e.target.value })}
              placeholder="Shown instead of the marks while the result is withheld"
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={edit !== null} onClose={() => setEdit(null)} title={`Change — ${edit?.student_name ?? ""}`} size="lg">
        {edit && (
          <form className="space-y-3" onSubmit={saveEdit}>
            <Select
              label="Decision"
              value={edit.result_status}
              onChange={(e) => setEdit({ ...edit, result_status: e.target.value as Status })}
            >
              <option value="withheld">Withhold the result</option>
              <option value="pass_by_grace">Pass by grace</option>
              <option value="failed">Fail</option>
            </Select>
            <Textarea label="Why" required value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} />
            <Textarea
              label="What parents are told"
              value={edit.parent_note ?? ""}
              onChange={(e) => setEdit({ ...edit, parent_note: e.target.value })}
            />
            <p className="text-xs text-ink-subtle">
              Saving makes this version {edit.version_no + 1}. If someone else changed it meanwhile, you&apos;ll be asked to reload.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEdit(null)}>
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
