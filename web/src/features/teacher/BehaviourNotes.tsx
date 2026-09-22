"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, Note, isoDay } from "@/features/self/kit";
import type { MyClasses, PeriodKind, Rating, SectionView, Suggestion } from "./types";

const BASE = "/api/v1/teacher/behaviour";
const SCORES = ["punctuality", "participation", "discipline", "respect"] as const;
type Score = (typeof SCORES)[number];
type Scores = Record<Score, number>;
const SCORE_LABEL: Record<Score, string> = { punctuality: "Punctuality", participation: "Participation", discipline: "Discipline", respect: "Respect" };
const SCALE = ["", "1 · Needs attention", "2 · Below expectations", "3 · Meets expectations", "4 · Good", "5 · Excellent"];

/** This week as the server keys it ("2026-W39", ISO week), matching `<input type="week">`. */
function isoWeek(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - start.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** The period before or after `key`: a week either side for "2026-W39", a month for "2026-09". */
function shift(kind: PeriodKind, key: string, by: number): string {
  if (kind === "monthly") {
    const [y, m] = key.split("-").map(Number);
    return y && m ? isoDay(new Date(y, m - 1 + by, 1)).slice(0, 7) : key;
  }
  const [y, w] = key.split("-W").map(Number);
  if (!y || !w) return key;
  const jan4 = new Date(y, 0, 4);
  const monday = new Date(y, 0, 4 - ((jan4.getDay() + 6) % 7) + (w - 1) * 7 + by * 7);
  return isoWeek(monday);
}

const periodText =(kind: PeriodKind, key: string) => {
  if (kind === "weekly") return `Week ${key.split("-W")[1] ?? key}, ${key.slice(0, 4)}`;
  const [y, m] = key.split("-").map(Number);
  return y && m ? new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : key;
};

type Target = { student_id: number; full_name: string; admission_no: string; rating: Rating | null };

/**
 * NEW-094, live: GET /teacher/behaviour/section/{id} (?period_kind=&period_key=)
 * for the class teacher's roster with this period's ratings, POST
 * /teacher/behaviour to save one (it replaces the student's rating for that
 * period), GET /teacher/behaviour/student/{id} for a student's history, and
 * POST /teacher/behaviour/ai-suggest for suggested scores from the note,
 * which the teacher reviews before saving. Sections from /teacher/my-classes.
 */
export function BehaviourNotes() {
  const classes = useApi<MyClasses>("/api/v1/teacher/my-classes");
  const sections = useMemo(() => classes.data?.class_teacher_of ?? [], [classes.data]);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [kind, setKind] = useState<PeriodKind>("weekly");
  const [key, setKey] = useState(isoWeek());
  const [search, setSearch] = useState("");
  const [rating, setRating] = useState<Target | null>(null);
  const [history, setHistory] = useState<Target | null>(null);

  useEffect(() => {
    if (sectionId === null && sections.length) setSectionId((sections.find((s) => s.is_current_year) ?? sections[0]).section_id);
  }, [sections, sectionId]);

  const view = useApi<SectionView>(sectionId ? `${BASE}/section/${sectionId}` : null, { period_kind: kind, period_key: key || undefined });

  const changeKind = (k: PeriodKind) => {
    setKind(k);
    setKey(k === "weekly" ? isoWeek() : isoDay().slice(0, 7));
  };

  const all = useMemo(() => view.data?.rows ?? [], [view.data]);
  const q = search.trim().toLowerCase();
  const items = all.filter((r) => !q || `${r.full_name} ${r.admission_no}`.toLowerCase().includes(q));
  const rated = all.filter((r) => r.rating);
  const avg = rated.length ? rated.reduce((n, r) => n + (r.rating?.average ?? 0), 0) / rated.length : null;
  const low = rated.filter((r) => (r.rating?.average ?? 5) < 3).length;
  const ready = view.data !== null;
  const period = periodText(kind, view.data?.period_key ?? key);
  const stats = [
    { label: "Students", value: ready ? String(all.length) : "…", note: view.data?.section_label ?? "Your class" },
    { label: "Rated", value: ready ? String(rated.length) : "…", note: period },
    { label: "Class average", value: ready ? (avg === null ? "—" : `${avg.toFixed(1)} / 5`) : "…", note: "Across the four areas" },
    { label: "Need attention", value: ready ? String(low) : "…", note: "Average below 3" },
  ];

  const rows: Row[] = items.map((r) => [
    { name: r.full_name, sub: `${r.admission_no} · Roll ${r.roll_no}` },
    ...SCORES.map((s) => (r.rating ? String(r.rating[s]) : "—")),
    r.rating ? r.rating.average.toFixed(1) : "—",
    r.rating?.teacher_note ?? "—",
    r.rating ? "Rated" : "Not rated",
  ]);

  const saved = () => {
    setRating(null);
    view.reload();
  };

  if (classes.data && !sections.length) {
    return <Note>Behaviour is rated by a section&apos;s class teacher. You are not the class teacher of any section, so there is no class to rate here.</Note>;
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search students…" aria-label="Search students" />
        </div>
        <select aria-label="Section" value={sectionId ?? ""} onChange={(e) => setSectionId(Number(e.target.value))}>
          {sections.map((s) => (
            <option key={s.section_id} value={s.section_id}>
              {`${s.section_label} · ${s.academic_year_name}`}
            </option>
          ))}
        </select>
        <select aria-label="Period" value={kind} onChange={(e) => changeKind(e.target.value as PeriodKind)}>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
        <button type="button" className="btn" aria-label={`Previous ${kind === "weekly" ? "week" : "month"}`} onClick={() => setKey(shift(kind, key, -1))}>
          ‹
        </button>
        {kind === "weekly" ? (
          <input type="week" aria-label="Week" value={key} onChange={(e) => e.target.value && setKey(e.target.value)} />
        ) : (
          <input type="month" aria-label="Month" value={key} onChange={(e) => e.target.value && setKey(e.target.value)} />
        )}
        <button type="button" className="btn" aria-label={`Next ${kind === "weekly" ? "week" : "month"}`} onClick={() => setKey(shift(kind, key, 1))}>
          ›
        </button>
      </div>
      <ErrorNote>{classes.error ?? view.error}</ErrorNote>
      <Panel title={`Behaviour · ${view.data?.section_label ?? "Class"}`} sub={`${period} · scores 1 to 5${view.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Student", "Punctuality", "Participation", "Discipline", "Respect", "Average", "Observation", "Status"]}
          rows={rows}
          selectable={false}
          actions={(i) => {
            const r = items[i];
            const t = { student_id: r.student_id, full_name: r.full_name, admission_no: r.admission_no, rating: r.rating };
            return (
              <>
                <button type="button" className="btn" onClick={() => setHistory(t)}>
                  History
                </button>
                <button type="button" className={`btn ${r.rating ? "" : "primary"}`} onClick={() => setRating(t)}>
                  {r.rating ? "Edit" : "Rate"}
                </button>
              </>
            );
          }}
          empty={view.loading || classes.loading ? "Loading…" : all.length ? "No student matches the search." : "No active students in this section."}
        />
      </Panel>

      {rating ? <RateDialog target={rating} kind={kind} periodKey={view.data?.period_key ?? key} period={period} onClose={() => setRating(null)} onSaved={saved} /> : null}
      {history ? <HistoryDialog target={history} onClose={() => setHistory(null)} /> : null}
    </>
  );
}

/** Rate or re-rate one student for the period (POST /teacher/behaviour), with an optional suggestion from the note. */
function RateDialog({ target, kind, periodKey, period, onClose, onSaved }: { target: Target; kind: PeriodKind; periodKey: string; period: string; onClose: () => void; onSaved: () => void }) {
  const r = target.rating;
  const [scores, setScores] = useState<Scores>({ punctuality: r?.punctuality ?? 3, participation: r?.participation ?? 3, discipline: r?.discipline ?? 3, respect: r?.respect ?? 3 });
  const [note, setNote] = useState(r?.teacher_note ?? "");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suggest() {
    setAsking(true);
    setError(null);
    try {
      const s = await api.post<Suggestion>(`${BASE}/ai-suggest`, { student_id: target.student_id, note: note.trim() });
      setSuggestion(s);
      setScores({ punctuality: s.punctuality, participation: s.participation, discipline: s.discipline, respect: s.respect });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setAsking(false);
    }
  }

  async function save(_e: FormEvent<HTMLFormElement>) {
    setBusy(true);
    setError(null);
    try {
      await api.post<Rating>(BASE, { student_id: target.student_id, period_kind: kind, period_key: periodKey, ...scores, teacher_note: note.trim() || null });
      notify(`Behaviour saved for ${target.full_name}.`);
      onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const average = SCORES.reduce((n, s) => n + scores[s], 0) / 4;

  return (
    <Dialog
      open
      wide
      title={`${r ? "Edit" : "Rate"} behaviour · ${target.full_name}`}
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            <Icon name="check" className="sm" />
            {busy ? "Saving…" : "Save rating"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <p className="small muted" style={{ marginBottom: 14 }}>{`${target.admission_no} · ${period}. Saving replaces this period's rating for the student.`}</p>
      <div className="form-grid">
        <Field label="Observation" full>
          <textarea maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What you noticed this period, e.g. arrives on time, helps classmates, distracted in maths" />
        </Field>
        {SCORES.map((s) => (
          <Field key={s} label={SCORE_LABEL[s]} required>
            <select required value={scores[s]} onChange={(e) => setScores({ ...scores, [s]: Number(e.target.value) })}>
              {[5, 4, 3, 2, 1].map((n) => (
                <option key={n} value={n}>
                  {SCALE[n]}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      <div className="spread" style={{ marginTop: 14, gap: 12, alignItems: "center" }}>
        <span className="small muted">{`Average ${average.toFixed(2)} / 5`}</span>
        <button type="button" className="btn" disabled={asking || note.trim().length < 3} onClick={suggest} title="Suggest scores from the observation">
          <Icon name="chart" className="sm" />
          {asking ? "Suggesting…" : "Suggest scores from note"}
        </button>
      </div>
      {suggestion ? (
        <div className="tip" style={{ marginTop: 14, marginBottom: 0 }}>
          <Icon name="bell" className="sm" />
          {/* The server's stub counts positive and negative words; its rationale is written for developers, so say it plainly. */}
          <span>
            {suggestion.source === "stub"
              ? `Suggested from the positive and negative words in your note: ${SCORES.map((s) => `${SCORE_LABEL[s]} ${suggestion[s]}`).join(", ")}. Check each score before saving.`
              : `${suggestion.rationale} Check each score before saving.`}
          </span>
        </div>
      ) : null}
    </Dialog>
  );
}

/** A student's past ratings (GET /teacher/behaviour/student/{id}). */
function HistoryDialog({ target, onClose }: { target: Target; onClose: () => void }) {
  const list = useApi<Rating[]>(`${BASE}/student/${target.student_id}`);
  const items = list.data ?? [];
  const rows: Row[] = items.map((r) => [
    periodText(r.period_kind, r.period_key),
    `${r.punctuality} · ${r.participation} · ${r.discipline} · ${r.respect}`,
    r.average.toFixed(1),
    r.teacher_note ?? "—",
    r.rated_by_name ?? "—",
    dateTime(r.updated_at),
  ]);
  return (
    <Dialog
      open
      wide
      title={`Behaviour history · ${target.full_name}`}
      onClose={onClose}
      actions={
        <button type="button" className="btn primary" onClick={onClose}>
          Close
        </button>
      }
    >
      <ErrorNote>{list.error}</ErrorNote>
      <DataTable
        columns={["Period", "P · Pa · D · R", "Average", "Observation", "Rated by", "Updated"]}
        rows={rows}
        selectable={false}
        rowAction={false}
        empty={list.loading ? "Loading…" : "No ratings recorded for this student yet."}
      />
    </Dialog>
  );
}
