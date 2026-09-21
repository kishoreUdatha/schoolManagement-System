"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { StarRating } from "@/components/StarRating";
import { api, apiError } from "@/lib/api";

type PeriodKind = "weekly" | "monthly";

type Section = { section_id: number; section_label: string };

type Rating = {
  id: number;
  student_id: number;
  punctuality: number;
  participation: number;
  discipline: number;
  respect: number;
  average: number;
  teacher_note: string | null;
  period_kind: PeriodKind;
  period_key: string;
  rated_by_name: string | null;
};

type SectionViewRow = {
  student_id: number;
  admission_no: string;
  roll_no: number;
  full_name: string;
  rating: Rating | null;
};

type SectionView = {
  section_id: number;
  section_label: string | null;
  period_kind: PeriodKind;
  period_key: string;
  rows: SectionViewRow[];
};

function isoWeek(d = new Date()) {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(
    ((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return `${target.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function BehaviourPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState<number | "">("");
  const [periodKind, setPeriodKind] = useState<PeriodKind>("weekly");
  const [periodKey, setPeriodKey] = useState(isoWeek());
  const [view, setView] = useState<SectionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<SectionViewRow | null>(null);

  useEffect(() => {
    api
      .get<{ class_teacher_of: Section[] }>("/api/v1/teacher/my-classes")
      .then((r) => {
        setSections(r.data.class_teacher_of);
        if (r.data.class_teacher_of.length > 0) {
          setSectionId(r.data.class_teacher_of[0].section_id);
        }
      })
      .catch((e) => setError(apiError(e)));
  }, []);

  useEffect(() => {
    setPeriodKey(periodKind === "weekly" ? isoWeek() : currentMonth());
  }, [periodKind]);

  async function load() {
    if (!sectionId) return;
    try {
      const { data } = await api.get<SectionView>(
        `/api/v1/teacher/behaviour/section/${sectionId}?period_kind=${periodKind}&period_key=${periodKey}`
      );
      setView(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, periodKind, periodKey]);

  const completion = useMemo(() => {
    if (!view) return { rated: 0, total: 0 };
    let rated = 0;
    view.rows.forEach((r) => {
      if (r.rating) rated++;
    });
    return { rated, total: view.rows.length };
  }, [view]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Behaviour ratings</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Rate punctuality, participation, discipline, and respect for students in
          your section. History is per-period — re-rating the same week
          overwrites.
        </p>
      </div>

      {sections.length === 0 ? (
        <Card className="p-6 text-center text-ink-muted">
          You aren&apos;t a class teacher of any section.
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
              <span className="text-[12px] font-bold text-ink-muted">Section</span>
              <select
                value={sectionId}
                onChange={(e) =>
                  setSectionId(e.target.value ? Number(e.target.value) : "")
                }
                className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
              >
                {sections.map((s) => (
                  <option key={s.section_id} value={s.section_id}>
                    {s.section_label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
              <span className="text-[12px] font-bold text-ink-muted">Period</span>
              <select
                value={periodKind}
                onChange={(e) => setPeriodKind(e.target.value as PeriodKind)}
                className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
              <span className="text-[12px] font-bold text-ink-muted">
                {periodKind === "weekly" ? "Week (YYYY-Wnn)" : "Month (YYYY-MM)"}
              </span>
              <input
                value={periodKey}
                onChange={(e) => setPeriodKey(e.target.value)}
                placeholder={periodKind === "weekly" ? "2026-W23" : "2026-06"}
                className="rounded-lg border border-surface-border px-3 py-2 text-sm font-mono"
              />
            </label>
            <div className="text-sm text-ink-muted">
              {completion.rated}/{completion.total} rated
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
          )}
          {notice && (
            <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>
          )}

          <Card>
            <table className="min-w-full divide-y divide-surface-border text-[13px]">
              <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                <tr>
                  <th className="px-4 py-3 font-bold">Roll</th>
                  <th className="px-4 py-3 font-bold">Name</th>
                  <th className="px-4 py-3 font-bold">Punct.</th>
                  <th className="px-4 py-3 font-bold">Particip.</th>
                  <th className="px-4 py-3 font-bold">Discip.</th>
                  <th className="px-4 py-3 font-bold">Respect</th>
                  <th className="px-4 py-3 font-bold">Avg</th>
                  <th className="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {view?.rows.map((row) => (
                  <tr key={row.student_id} className="hover:bg-surface-subtle">
                    <td className="px-4 py-3 text-[12px] tabular-nums text-ink-muted">
                      {row.roll_no}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink">
                        {row.full_name}
                      </div>
                      <div className="text-xs text-ink-muted">
                        {row.admission_no}
                      </div>
                    </td>
                    {row.rating ? (
                      <>
                        <td className="px-4 py-3"><StarRating value={row.rating.punctuality} size="sm" readOnly /></td>
                        <td className="px-4 py-3"><StarRating value={row.rating.participation} size="sm" readOnly /></td>
                        <td className="px-4 py-3"><StarRating value={row.rating.discipline} size="sm" readOnly /></td>
                        <td className="px-4 py-3"><StarRating value={row.rating.respect} size="sm" readOnly /></td>
                        <td className="px-4 py-3 font-semibold">{row.rating.average}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3" colSpan={4}>
                          <Badge tone="neutral">unrated</Badge>
                        </td>
                        <td className="px-4 py-3">—</td>
                      </>
                    )}
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" onClick={() => setEditing(row)}>
                        {row.rating ? "Edit" : "Rate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {editing && (
        <RateModal
          row={editing}
          periodKind={periodKind}
          periodKey={periodKey}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice("Saved.");
            load();
          }}
        />
      )}
    </div>
  );
}

function RateModal({
  row,
  periodKind,
  periodKey,
  onClose,
  onSaved,
}: {
  row: SectionViewRow;
  periodKind: PeriodKind;
  periodKey: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [p, setP] = useState(row.rating?.punctuality ?? 3);
  const [pa, setPa] = useState(row.rating?.participation ?? 3);
  const [d, setD] = useState(row.rating?.discipline ?? 3);
  const [r, setR] = useState(row.rating?.respect ?? 3);
  const [note, setNote] = useState(row.rating?.teacher_note ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiRationale, setAiRationale] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function aiSuggest() {
    if (note.trim().length < 5) {
      setError("Write at least a sentence in the note before asking for AI suggestion.");
      return;
    }
    setAiBusy(true);
    setError(null);
    try {
      const { data } = await api.post("/api/v1/teacher/behaviour/ai-suggest", {
        student_id: row.student_id,
        note,
      });
      setP(data.punctuality);
      setPa(data.participation);
      setD(data.discipline);
      setR(data.respect);
      setAiRationale(data.rationale);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setAiBusy(false);
    }
  }

  async function save() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/teacher/behaviour", {
        student_id: row.student_id,
        period_kind: periodKind,
        period_key: periodKey,
        punctuality: p,
        participation: pa,
        discipline: d,
        respect: r,
        teacher_note: note || null,
      });
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Rate ${row.full_name}`} size="lg">
      <div className="space-y-4">
        <div className="text-xs text-ink-muted">
          Period: <strong>{periodKind}</strong> · <code>{periodKey}</code>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <RateRow label="Punctuality" value={p} onChange={setP} />
          <RateRow label="Participation" value={pa} onChange={setPa} />
          <RateRow label="Discipline" value={d} onChange={setD} />
          <RateRow label="Respect" value={r} onChange={setR} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Teacher note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="A line or two about the student this period…"
            className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={aiSuggest} loading={aiBusy}>
            ✨ AI suggest from note
          </Button>
          <span className="text-xs text-ink-muted self-center">
            (Heuristic stub. Story 3.10 wires real Claude API.)
          </span>
        </div>
        {aiRationale && (
          <div className="rounded-md bg-surface-subtle px-3 py-2 text-xs text-ink-muted">
            {aiRationale}
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={submitting}>
            Save rating
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RateRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-surface-border px-3 py-2">
      <span className="text-[12px] font-bold text-ink-muted">{label}</span>
      <StarRating value={value} onChange={onChange} />
    </div>
  );
}
