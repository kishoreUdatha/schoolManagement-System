"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  Textarea,
  WarnBox,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { readableDate } from "@/lib/dates";

type Year = { id: number; name: string; is_current: boolean };
type SchoolClass = { id: number; name: string };
type Subject = { id: number; name: string; code: string; is_active: boolean };
type CurriculumSubject = {
  id: number;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  periods_per_week: number;
  is_core: boolean;
};
type Curriculum = {
  id: number;
  name: string;
  board: string | null;
  academic_year_id: number;
  academic_year_name: string | null;
  class_id: number | null;
  class_name: string | null;
  status: "draft" | "active" | "retired";
  effective_from: string | null;
  notes: string | null;
  subjects: CurriculumSubject[];
  subject_count: number;
  periods_per_week: number;
  retired?: { id: number; name: string }[];
};

const base = "/api/v1/school/academics";

const TONE: Record<Curriculum["status"], "emerald" | "amber" | "neutral"> = {
  active: "emerald",
  draft: "amber",
  retired: "neutral",
};

/** What a class is meant to be taught, as opposed to what the timetable does.
 *
 *  The two are allowed to disagree, and that disagreement is usually the
 *  useful fact — a curriculum asking six periods of maths against a timetable
 *  giving four is a conversation, not an error to reconcile away.
 */
export default function CurriculumPage() {
  const [rows, setRows] = useState<Curriculum[]>([]);
  const [years, setYears] = useState<Year[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [yearId, setYearId] = useState<number | "">("");
  const [creating, setCreating] = useState(false);
  const [addingTo, setAddingTo] = useState<Curriculum | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: "",
    board: "",
    academic_year_id: "",
    class_id: "",
    effective_from: "",
    notes: "",
  });
  const [pick, setPick] = useState({ subject_id: "", periods_per_week: "4", is_core: true });

  const load = (year: number | "" = yearId) =>
    api
      .get<Curriculum[]>(`${base}/curricula`, {
        params: { academic_year_id: year || undefined },
      })
      .then((r) => setRows(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    api
      .get<Year[]>("/api/v1/school/academic-years")
      .then((r) => {
        setYears(r.data);
        const current = r.data.find((y) => y.is_current);
        if (current) {
          setYearId(current.id);
          setForm((f) => ({ ...f, academic_year_id: String(current.id) }));
          load(current.id);
        } else {
          load("");
        }
      })
      .catch(() => load(""));
    api
      .get<Subject[]>("/api/v1/school/subjects")
      .then((r) => setSubjects(r.data.filter((s) => s.is_active)))
      .catch(() => setSubjects([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!yearId) return;
    api
      .get<SchoolClass[]>("/api/v1/school/classes", {
        params: { academic_year_id: yearId },
      })
      .then((r) => setClasses(r.data))
      .catch(() => setClasses([]));
  }, [yearId]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`${base}/curricula`, {
        name: form.name.trim(),
        board: form.board.trim() || null,
        academic_year_id: Number(form.academic_year_id),
        class_id: form.class_id ? Number(form.class_id) : null,
        effective_from: form.effective_from || null,
        notes: form.notes.trim() || null,
      });
      setCreating(false);
      setForm({ ...form, name: "", board: "", class_id: "", effective_from: "", notes: "" });
      setSaved("Programme drafted. It is not in force until you activate it.");
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const activate = async (c: Curriculum) => {
    setError(null);
    try {
      const r = await api.post<Curriculum>(`${base}/curricula/${c.id}/activate`);
      const retired = r.data.retired ?? [];
      setSaved(
        retired.length
          ? `${c.name} is in force. ${retired.map((x) => x.name).join(", ")} retired.`
          : `${c.name} is in force.`
      );
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const retire = async (c: Curriculum) => {
    setError(null);
    try {
      await api.post(`${base}/curricula/${c.id}/retire`);
      setSaved(`${c.name} is no longer in force. It stays readable.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const addSubject = async () => {
    if (!addingTo || !pick.subject_id) return;
    setBusy(true);
    setError(null);
    try {
      await api.put(`${base}/curricula/${addingTo.id}/subjects`, {
        subject_id: Number(pick.subject_id),
        periods_per_week: Number(pick.periods_per_week) || 0,
        is_core: pick.is_core,
      });
      setAddingTo(null);
      setPick({ subject_id: "", periods_per_week: "4", is_core: true });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const removeSubject = async (c: Curriculum, subjectId: number) => {
    setError(null);
    try {
      await api.delete(`${base}/curricula/${c.id}/subjects/${subjectId}`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const active = rows.filter((r) => r.status === "active");
  const drafts = rows.filter((r) => r.status === "draft");
  // A class with an active programme and nothing on it is the quiet failure:
  // it reads as done and teaches nobody anything.
  const emptyActive = active.filter((r) => r.subject_count === 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Curriculum"
        subtitle="What each class is meant to be taught this year, and which board it follows."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Select
              aria-label="Academic year"
              value={yearId}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : "";
                setYearId(v);
                load(v);
              }}
            >
              <option value="">Every year</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Select>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New programme
            </Button>
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Programmes" value={rows.length} />
        <StatCard label="In force" value={active.length} accent="emerald" />
        <StatCard label="Drafts" value={drafts.length} accent="amber" />
        <StatCard
          label="In force with no subjects"
          value={emptyActive.length}
          accent={emptyActive.length ? "rose" : "neutral"}
        />
      </div>

      {emptyActive.length > 0 && (
        <WarnBox>
          {emptyActive.map((c) => c.name).join(", ")}{" "}
          {emptyActive.length === 1 ? "is" : "are"} in force with nothing on{" "}
          {emptyActive.length === 1 ? "it" : "them"}. An empty programme reads as
          finished and says nothing about what anybody teaches.
        </WarnBox>
      )}

      {rows.length === 0 && (
        <Card>
          <CardBody className="text-[13px] text-ink-subtle">
            No programmes recorded for this year yet.
          </CardBody>
        </Card>
      )}

      {rows.map((c) => (
        <Card key={c.id}>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>{c.name}</CardTitle>
              <p className="mt-1 text-[13px] text-ink-muted">
                {c.class_name ?? "Whole school"} · {c.academic_year_name}
                {c.board ? ` · ${c.board}` : ""}
                {c.effective_from ? ` · from ${readableDate(c.effective_from)}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TONE[c.status]}>
                {c.status === "active"
                  ? "In force"
                  : c.status === "draft"
                    ? "Draft"
                    : "Retired"}
              </Badge>
              <Button variant="secondary" onClick={() => setAddingTo(c)}>
                <Plus className="mr-1.5 h-4 w-4" />
                Subject
              </Button>
              {c.status === "active" ? (
                <Button variant="secondary" onClick={() => retire(c)}>
                  Retire
                </Button>
              ) : (
                <Button onClick={() => activate(c)}>Put in force</Button>
              )}
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <Table
              head={["Subject", "Code", "Periods a week", "Part of", ""]}
              empty={c.subjects.length === 0 && "No subjects on this programme yet."}
            >
              {c.subjects.map((s) => (
                <tr key={s.id}>
                  <td className={tdStrong}>{s.subject_name}</td>
                  <td className={td}>
                    <span className="font-mono text-[12px]">{s.subject_code}</span>
                  </td>
                  <td className={td}>{s.periods_per_week || "Not set"}</td>
                  <td className={td}>
                    {s.is_core ? (
                      <Badge tone="neutral">Core</Badge>
                    ) : (
                      <Badge tone="amber">Optional</Badge>
                    )}
                  </td>
                  <td className={td}>
                    <Button
                      variant="secondary"
                      aria-label={`Drop ${s.subject_name}`}
                      onClick={() => removeSubject(c, s.subject_id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
            {c.subjects.length > 0 && (
              <div className="border-t border-surface-border px-5 py-3 text-[12px] text-ink-subtle">
                {c.periods_per_week} period(s) a week across {c.subject_count} subject(s).
                This is the intention — the timetable is what actually happens, and the
                two are allowed to differ.
              </div>
            )}
          </CardBody>
        </Card>
      ))}

      <Modal open={creating} onClose={() => setCreating(false)} title="New programme">
        <div className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            placeholder="Grade 1 — 2025/26"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            label="Board (optional)"
            value={form.board}
            placeholder="CBSE"
            hint="Free text — a school following a local syllabus has its own name for it."
            onChange={(e) => setForm({ ...form, board: e.target.value })}
          />
          <Select
            label="Academic year"
            value={form.academic_year_id}
            onChange={(e) => setForm({ ...form, academic_year_id: e.target.value })}
          >
            <option value="">Select…</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
          <Select
            label="Class"
            value={form.class_id}
            onChange={(e) => setForm({ ...form, class_id: e.target.value })}
          >
            <option value="">The whole school</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Input
            label="In force from (optional)"
            type="date"
            value={form.effective_from}
            onChange={(e) => setForm({ ...form, effective_from: e.target.value })}
          />
          <Textarea
            label="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              onClick={create}
              loading={busy}
              disabled={!form.name || !form.academic_year_id}
            >
              Create as draft
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={addingTo !== null}
        onClose={() => setAddingTo(null)}
        title={addingTo ? `Add a subject to ${addingTo.name}` : ""}
      >
        <div className="space-y-4">
          <Select
            label="Subject"
            value={pick.subject_id}
            onChange={(e) => setPick({ ...pick, subject_id: e.target.value })}
          >
            <option value="">Select…</option>
            {subjects
              .filter((s) => !addingTo?.subjects.some((x) => x.subject_id === s.id))
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
          </Select>
          <Input
            label="Periods a week"
            type="number"
            min={0}
            max={40}
            value={pick.periods_per_week}
            hint="What the programme asks for. The timetable aims at its own figure."
            onChange={(e) => setPick({ ...pick, periods_per_week: e.target.value })}
          />
          <label className="flex items-center gap-2 text-[13px] text-ink-muted">
            <input
              type="checkbox"
              checked={pick.is_core}
              onChange={(e) => setPick({ ...pick, is_core: e.target.checked })}
            />
            Everybody takes it
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddingTo(null)}>
              Cancel
            </Button>
            <Button onClick={addSubject} loading={busy} disabled={!pick.subject_id}>
              Add
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
