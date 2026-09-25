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
        <h1 className="text-2xl font-bold text-slate-900">Behaviour ratings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Rate punctuality, participation, discipline, and respect for students in
          your section. History is per-period — re-rating the same week
          overwrites.
        </p>
      </div>

      {sections.length === 0 ? (
        <Card className="p-6 text-center text-slate-500">
          You aren&apos;t a class teacher of any section.
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Section</span>
              <select
                value={sectionId}
                onChange={(e) =>
                  setSectionId(e.target.value ? Number(e.target.value) : "")
                }
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {sections.map((s) => (
                  <option key={s.section_id} value={s.section_id}>
                    {s.section_label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">Period</span>
              <select
                value={periodKind}
                onChange={(e) => setPeriodKind(e.target.value as PeriodKind)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-slate-600">
                {periodKind === "weekly" ? "Week (YYYY-Wnn)" : "Month (YYYY-MM)"}
              </span>
              <input
                value={periodKey}
                onChange={(e) => setPeriodKey(e.target.value)}
                placeholder={periodKind === "weekly" ? "2026-W23" : "2026-06"}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
              />
            </label>
            <div className="text-sm text-slate-600">
              {completion.rated}/{completion.total} rated
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
          {notice && (
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>
          )}

          <Card>
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Roll</th>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Punct.</th>
                  <th className="px-4 py-2 font-medium">Particip.</th>
                  <th className="px-4 py-2 font-medium">Discip.</th>
                  <th className="px-4 py-2 font-medium">Respect</th>
                  <th className="px-4 py-2 font-medium">Avg</th>
                  <th className="px-4 py-2 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {view?.rows.map((row) => (
                  <tr key={row.student_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">
                      {row.roll_no}
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900">
                        {row.full_name}
                      </div>
                      <div className="text-xs text-slate-500">
                        {row.admission_no}
                      </div>
                    </td>
                    {row.rating ? (
                      <>
                        <td className="px-4 py-2"><StarRating value={row.rating.punctuality} size="sm" readOnly /></td>
                        <td className="px-4 py-2"><StarRating value={row.rating.participation} size="sm" readOnly /></td>
                        <td className="px-4 py-2"><StarRating value={row.rating.discipline} size="sm" readOnly /></td>
                        <td className="px-4 py-2"><StarRating value={row.rating.respect} size="sm" readOnly /></td>
                        <td className="px-4 py-2 font-semibold">{row.rating.average}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2" colSpan={4}>
                          <Badge tone="neutral">unrated</Badge>
                        </td>
                        <td className="px-4 py-2">—</td>
                      </>
                    )}
                    <td className="px-4 py-2 text-right">
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
        <div className="text-xs text-slate-500">
          Period: <strong>{periodKind}</strong> · <code>{periodKey}</code>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <RateRow label="Punctuality" value={p} onChange={setP} />
          <RateRow label="Participation" value={pa} onChange={setPa} />
          <RateRow label="Discipline" value={d} onChange={setD} />
          <RateRow label="Respect" value={r} onChange={setR} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Teacher note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="A line or two about the student this period…"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={aiSuggest} loading={aiBusy}>
            ✨ AI suggest from note
          </Button>
          <span className="text-xs text-slate-500 self-center">
            Suggestions only — review the ratings before saving.
          </span>
        </div>
        {aiRationale && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {aiRationale}
          </div>
        )}
        {error && (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
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
    <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <StarRating value={value} onChange={onChange} />
    </div>
  );
}
