"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, UserMinus } from "lucide-react";

import { hhmm } from "@/components/events/CalendarFeed";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select, Table, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

/** A control sized for the filter bar: same height as the search box, and no
 *  stacked label, because the bar reads as one row of controls. */
const filterControl =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Slot = {
  timetable_entry_id: number;
  period_number: number;
  start_time: string;
  end_time: string;
  section_label: string;
  subject_name: string;
  absent_user_id: number | null;
  absent_name: string | null;
  reason: string;
  substitution_id: number | null;
  substitute_user_id: number | null;
  substitute_name: string | null;
  note: string | null;
};
type Day = {
  date: string;
  is_holiday: boolean;
  absent: { user_id: number; full_name: string; reason: string; periods: number }[];
  slots: Slot[];
  covered: number;
  uncovered: number;
};
type Candidate = {
  user_id: number;
  full_name: string;
  status: "free" | "busy_teaching" | "busy_covering" | "on_leave" | "unavailable";
  detail: string | null;
  teaches_this_class: boolean;
  covers_this_week: number;
  periods_today: number;
};
type Staff = { user_id: number; full_name: string; role: string };
type Block = { id: number; user_id: number; full_name: string; day_of_week: number; period_number: number | null; reason: string | null };

const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const reasonText: Record<string, string> = {
  leave: "on leave",
  pending_leave: "leave pending",
  marked_absent: "marked absent",
  manual: "cover arranged",
};
const statusTone = { free: "emerald", unavailable: "amber", busy_covering: "amber", busy_teaching: "rose", on_leave: "rose" } as const;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function CoverBoard() {
  const [date, setDate] = useState(today());
  const [extra, setExtra] = useState<number[]>([]);
  const [day, setDay] = useState<Day | null>(null);
  const [teachers, setTeachers] = useState<Staff[]>([]);
  const [pick, setPick] = useState<Slot | null>(null);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [note, setNote] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [blockForm, setBlockForm] = useState({ user_id: "", day_of_week: "1", period_number: "", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () =>
    api
      .get<Day>("/api/v1/school/cover/day", { params: { date, absent: extra.join(",") || undefined } })
      .then((r) => setDay(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, extra]);

  useEffect(() => {
    api
      .get<Staff[]>("/api/v1/school/directory/staff")
      .then((r) => setTeachers(r.data.filter((s) => s.role === "teacher" || s.role === "principal")))
      .catch(() => setTeachers([]));
    loadBlocks();
  }, []);

  const loadBlocks = () =>
    api
      .get<Block[]>("/api/v1/school/cover/unavailability")
      .then((r) => setBlocks(r.data))
      .catch(() => setBlocks([]));

  async function openPick(s: Slot) {
    setPick(s);
    setNote(s.note ?? "");
    setCands([]);
    try {
      const r = await api.get<Candidate[]>("/api/v1/school/cover/candidates", { params: { date, entry_id: s.timetable_entry_id } });
      setCands(r.data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function assign(userId: number | null, force = false) {
    if (!pick) return;
    try {
      await api.post("/api/v1/school/cover/assign", {
        sub_date: date,
        timetable_entry_id: pick.timetable_entry_id,
        substitute_user_id: userId,
        note: note.trim() || null,
        force,
      });
      setPick(null);
      setNotice(userId ? "Substitute assigned and notified." : "Saved as uncovered.");
      setError(null);
      load();
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } }).response?.status;
      if (status === 409 && !force && window.confirm(apiError(e))) return assign(userId, true);
      setError(apiError(e));
    }
  }

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      setNotice(done);
      setError(null);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  const absentIds = new Set(day?.absent.map((a) => a.user_id));

  return (
    <div className="space-y-[18px]">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {/* The day, and anyone else you know is away, narrow the board before
          the figures that describe it. */}
      <FilterBar>
        <input
          type="date"
          aria-label="Date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={filterControl}
        />
        <select
          aria-label="Also absent today"
          value=""
          onChange={(e) => e.target.value && setExtra([...extra, Number(e.target.value)])}
          className={`${filterControl} min-w-[200px]`}
        >
          <option value="">Add a teacher who is also away…</option>
          {teachers
            .filter((t) => !absentIds.has(t.user_id))
            .map((t) => (
              <option key={t.user_id} value={t.user_id}>
                {t.full_name}
              </option>
            ))}
        </select>
      </FilterBar>

      {/* Straight off the day the server returned: who is away, how many
          slots that leaves, and the covered/uncovered split it counted. */}
      <StatStrip
        stats={[
          {
            label: "Away today",
            value: day ? day.absent.length : "—",
            note: day ? (day.is_holiday ? "holiday" : `on ${day.date}`) : undefined,
            icon: UserMinus,
          },
          {
            label: "Slots to cover",
            value: day ? day.slots.length : "—",
            note: day ? "periods left by absent teachers" : undefined,
            icon: CalendarClock,
          },
          {
            label: "Covered",
            value: day ? day.covered : "—",
            note: day ? "a substitute is named" : undefined,
            icon: CheckCircle2,
          },
          {
            label: "Still open",
            value: day ? day.uncovered : "—",
            note: day
              ? day.uncovered
                ? "nobody is taking these classes"
                : "every slot has somebody"
              : undefined,
            icon: AlertTriangle,
          },
        ]}
      />

      {day?.is_holiday && <Badge tone="amber">holiday</Badge>}
      {day && (
        <div className="flex flex-wrap gap-2">
          {day.absent.length === 0 && <span className="text-sm text-ink-subtle">Nobody is away on {DAYS[new Date(date + "T00:00:00").getDay() || 7]} {date}.</span>}
          {day.absent.map((a) => (
            <span key={a.user_id} className="flex items-center gap-1 rounded-full border border-surface-border px-3 py-1 text-sm text-ink">
              {a.full_name}
              <span className="text-xs text-ink-subtle">
                {reasonText[a.reason] ?? a.reason} · {a.periods} period{a.periods === 1 ? "" : "s"}
              </span>
              {a.reason === "marked_absent" && (
                <button type="button" className="text-ink-subtle hover:text-danger" onClick={() => setExtra(extra.filter((x) => x !== a.user_id))} aria-label="Remove">
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Cover needed</CardTitle>
            {day && (
              <p className="mt-[5px] text-[11px] text-ink-muted">
                {day.covered} covered · {day.uncovered} open
              </p>
            )}
          </div>
          {day && day.uncovered > 0 && (
            <Button onClick={() => run(async () => {
              const r = await api.post<{ assigned: number }>("/api/v1/school/cover/auto-assign", { date, absent: extra });
              setNotice(`${r.data.assigned} slot(s) filled.`);
            }, "")}>
              Auto-assign {day.uncovered} slot{day.uncovered === 1 ? "" : "s"}
            </Button>
          )}
        </CardHeader>
        <Table head={["Period", "Class", "Subject", "Regular teacher", "Covered by", ""]} empty={day?.slots.length === 0 && "No slots need cover."}>
          {day?.slots.map((s) => (
            <tr key={s.timetable_entry_id}>
              <td className={td}>
                P{s.period_number}
                <div className="text-xs text-ink-subtle">
                  {hhmm(s.start_time)}–{hhmm(s.end_time)}
                </div>
              </td>
              <td className={tdStrong}>{s.section_label}</td>
              <td className={td}>{s.subject_name}</td>
              <td className={td}>
                {s.absent_name}
                <div className="text-xs text-ink-subtle">{reasonText[s.reason] ?? s.reason}</div>
              </td>
              <td className={td}>
                {s.substitute_name ? <Badge tone="emerald">{s.substitute_name}</Badge> : <Badge tone="rose">not covered</Badge>}
                {s.note && <div className="text-xs text-ink-subtle">{s.note}</div>}
              </td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                <Button size="sm" variant="secondary" onClick={() => openPick(s)}>
                  {s.substitute_user_id ? "Change" : "Assign"}
                </Button>
                {s.substitution_id && (
                  <Button size="sm" variant="ghost" onClick={() => run(() => api.delete(`/api/v1/school/cover/${s.substitution_id}`), "Cover removed.")}>
                    Clear
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
        {day && (
          <PanelFooter
            left={`Showing ${day.slots.length} slot(s) for ${date}`}
            right={`${day.covered} covered · ${day.uncovered} open`}
          />
        )}
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>When teachers can&apos;t cover</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Standing blocks the allocator will not ask past
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-48">
              <Select label="Teacher" value={blockForm.user_id} onChange={(e) => setBlockForm({ ...blockForm, user_id: e.target.value })}>
                <option value="">Choose…</option>
                {teachers.map((t) => (
                  <option key={t.user_id} value={t.user_id}>
                    {t.full_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-28">
              <Select label="Day" value={blockForm.day_of_week} onChange={(e) => setBlockForm({ ...blockForm, day_of_week: e.target.value })}>
                {DAYS.slice(1).map((d, i) => (
                  <option key={d} value={i + 1}>
                    {d}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-28">
              <Input label="Period (blank = all day)" type="number" min={1} max={20} value={blockForm.period_number} onChange={(e) => setBlockForm({ ...blockForm, period_number: e.target.value })} />
            </div>
            <Input label="Reason" value={blockForm.reason} onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })} />
            <Button
              disabled={!blockForm.user_id}
              onClick={async () => {
                try {
                  const r = await api.post<Block[]>("/api/v1/school/cover/unavailability", {
                    user_id: Number(blockForm.user_id),
                    day_of_week: Number(blockForm.day_of_week),
                    period_number: blockForm.period_number ? Number(blockForm.period_number) : null,
                    reason: blockForm.reason.trim() || null,
                  });
                  setBlocks(r.data);
                  setBlockForm({ ...blockForm, period_number: "", reason: "" });
                  setError(null);
                } catch (e) {
                  setError(apiError(e));
                }
              }}
            >
              Add
            </Button>
          </div>
          {blocks.length === 0 ? (
            <p className="text-sm text-ink-subtle">No blocks. Everyone free in a period can be asked to cover.</p>
          ) : (
            <ul className="divide-y divide-surface-border text-sm">
              {blocks.map((b) => (
                <li key={b.id} className="flex items-center gap-2 py-1.5">
                  <span className="text-ink">{b.full_name}</span>
                  <span className="text-ink-muted">
                    {DAYS[b.day_of_week]} {b.period_number ? `period ${b.period_number}` : "all day"}
                    {b.reason && ` · ${b.reason}`}
                  </span>
                  <button
                    type="button"
                    className="ml-auto text-xs text-danger hover:underline"
                    onClick={async () => {
                      const r = await api.delete<Block[]>(`/api/v1/school/cover/unavailability/${b.id}`);
                      setBlocks(r.data);
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal open={!!pick} onClose={() => setPick(null)} title={pick ? `Cover ${pick.section_label} · P${pick.period_number} ${pick.subject_name}` : ""} size="lg">
        {pick && (
          <div className="space-y-3">
            <Input label="Note for the substitute" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Revise chapter 3, worksheet on the desk" />
            <div className="max-h-[50vh] overflow-auto">
              <Table head={["Teacher", "Status", "Knows class", "Covers this week", "Periods today", ""]} empty={cands.length === 0 && "Loading…"}>
                {cands.map((c) => (
                  <tr key={c.user_id}>
                    <td className={tdStrong}>{c.full_name}</td>
                    <td className={td}>
                      <Badge tone={statusTone[c.status]}>{c.status.replace("_", " ")}</Badge>
                      {c.detail && <div className="text-xs text-ink-subtle">{c.detail}</div>}
                    </td>
                    <td className={td}>{c.teaches_this_class ? "yes" : ""}</td>
                    <td className={td}>{c.covers_this_week}</td>
                    <td className={td}>{c.periods_today}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant={c.status === "free" ? "primary" : "ghost"} disabled={c.status === "on_leave"} onClick={() => assign(c.user_id)}>
                        Assign
                      </Button>
                    </td>
                  </tr>
                ))}
              </Table>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => assign(null)}>
                Leave uncovered (note only)
              </Button>
              <Button variant="secondary" onClick={() => setPick(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
