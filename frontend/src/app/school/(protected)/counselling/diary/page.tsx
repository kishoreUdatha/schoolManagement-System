"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Lock } from "lucide-react";

import { StudentPicker, type PickedStudent } from "@/components/StudentPicker";
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
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { hhmm, longDate, toIso } from "@/lib/dates";

type Appointment = {
  id: number;
  case_id: number | null;
  student_id: number;
  student_name?: string | null;
  admission_no?: string | null;
  section_label?: string | null;
  scheduled_on: string;
  scheduled_at: string;
  duration_minutes: number;
  counsellor_user_id: number | null;
  counsellor_name: string | null;
  status: string;
  notes: string | null;
};

type Load = {
  counsellor_user_id: number | null;
  counsellor_name: string;
  booked: number;
  attended: number;
  missed: number;
  cancelled: number;
  total: number;
};

const STATUSES = ["booked", "attended", "missed", "cancelled"];

const tone = (s: string) =>
  s === "attended" ? "emerald" : s === "missed" ? "rose" : s === "cancelled" ? "neutral" : "brand";

/** The counsellor's diary.
 *
 *  A missed appointment is kept apart from a cancelled one: a run of misses
 *  is the signal a pastoral team is looking for, and a table of only what
 *  happened can never show it.
 */
export default function CounsellingDiaryPage() {
  const [from, setFrom] = useState(toIso());
  const [to, setTo] = useState(toIso(new Date(Date.now() + 14 * 86_400_000)));
  const [rows, setRows] = useState<Appointment[]>([]);
  const [load, setLoad] = useState<Load[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [booking, setBooking] = useState(false);
  const [child, setChild] = useState<PickedStudent | null>(null);
  const [form, setForm] = useState({
    scheduled_on: toIso(),
    scheduled_at: "09:30",
    duration_minutes: 30,
    notes: "",
  });

  const [editing, setEditing] = useState<Appointment | null>(null);
  const [outcome, setOutcome] = useState({ status: "attended", notes: "", private_notes: "" });
  const [ownNote, setOwnNote] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const params = { from, to };
    api
      .get<Appointment[]>("/api/v1/school/wellbeing/counselling/appointments", { params })
      .then((r) => setRows(r.data))
      .catch((e) => setError(apiError(e)));
    api
      .get<Load[]>("/api/v1/school/wellbeing/counselling/load", { params })
      .then((r) => setLoad(r.data))
      .catch(() => setLoad([]));
  }, [from, to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const book = async () => {
    if (!child) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.post("/api/v1/school/wellbeing/counselling/appointments", {
        student_id: child.id,
        scheduled_on: form.scheduled_on,
        scheduled_at: `${form.scheduled_at}:00`,
        duration_minutes: form.duration_minutes,
        notes: form.notes || null,
      });
      setSaved(`Booked for ${child.full_name}.`);
      setBooking(false);
      setChild(null);
      refresh();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const openOutcome = (a: Appointment) => {
    setEditing(a);
    setOutcome({ status: a.status, notes: a.notes ?? "", private_notes: "" });
    setOwnNote(null);
    setNoteError(null);
  };

  const loadOwnNote = async () => {
    if (!editing) return;
    setNoteError(null);
    try {
      const r = await api.get<{ private_notes: string | null }>(
        `/api/v1/school/wellbeing/counselling/appointments/${editing.id}/private-note`
      );
      setOwnNote(r.data.private_notes ?? "");
      setOutcome((o) => ({ ...o, private_notes: r.data.private_notes ?? "" }));
    } catch (e) {
      setNoteError(apiError(e));
    }
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await api.patch(
        `/api/v1/school/wellbeing/counselling/appointments/${editing.id}`,
        {
          status: outcome.status,
          notes: outcome.notes || null,
          // Only sent when the counsellor actually opened their own note —
          // otherwise a blank box would wipe what they wrote last time.
          ...(ownNote !== null ? { private_notes: outcome.private_notes || null } : {}),
        }
      );
      setSaved("Saved.");
      setEditing(null);
      refresh();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const byDay = rows.reduce<Record<string, Appointment[]>>((acc, a) => {
    (acc[a.scheduled_on] ||= []).push(a);
    return acc;
  }, {});
  const missed = rows.filter((a) => a.status === "missed").length;
  const booked = rows.filter((a) => a.status === "booked").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Counselling diary"
        subtitle="Who is booked in, who came, and who did not."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Button onClick={() => setBooking(true)}>
              <CalendarPlus className="mr-1.5 h-4 w-4" />
              Book a session
            </Button>
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Appointments" value={rows.length} />
        <StatCard label="Still to happen" value={booked} />
        <StatCard label="Missed" value={missed} accent={missed ? "rose" : "emerald"} />
        <StatCard label="Counsellors" value={load.length} />
      </div>

      {missed > 0 && (
        <WarnBox>
          {missed} appointment{missed === 1 ? " was" : "s were"} missed in this window. One
          is a forgotten morning; several in a row is usually the thing worth talking
          about.
        </WarnBox>
      )}

      {Object.keys(byDay).length === 0 && (
        <Card>
          <CardBody className="text-[13px] text-ink-subtle">
            Nothing is booked in this window yet.
          </CardBody>
        </Card>
      )}

      {Object.entries(byDay).map(([day, list]) => (
        <Card key={day}>
          <CardHeader>
            <CardTitle>{longDate(day)}</CardTitle>
            <span className="text-[12px] font-bold text-ink-muted">
              {list.length} session{list.length === 1 ? "" : "s"}
            </span>
          </CardHeader>
          <CardBody className="p-0">
            <Table head={["Time", "Child", "Counsellor", "Shared notes", "State", ""]}>
              {list.map((a) => (
                <tr key={a.id}>
                  <td className={tdStrong}>
                    {hhmm(a.scheduled_at)}
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      {a.duration_minutes} min
                    </span>
                  </td>
                  <td className={td}>
                    {a.student_name}
                    <span className="block text-[11px] text-ink-subtle">
                      {a.admission_no}
                      {a.section_label ? ` · ${a.section_label}` : ""}
                    </span>
                  </td>
                  <td className={td}>{a.counsellor_name ?? "Unassigned"}</td>
                  <td className={td}>{a.notes ?? "—"}</td>
                  <td className={td}>
                    <Badge tone={tone(a.status)}>{humanize(a.status)}</Badge>
                  </td>
                  <td className={td}>
                    <Button variant="secondary" onClick={() => openOutcome(a)}>
                      Record
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          </CardBody>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Per counsellor</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Counsellor", "Booked", "Attended", "Missed", "Cancelled", "Total"]}
            empty={load.length === 0 && "Nothing booked in this window."}
          >
            {load.map((l) => (
              <tr key={l.counsellor_user_id ?? "none"}>
                <td className={tdStrong}>{l.counsellor_name}</td>
                <td className={td}>{l.booked}</td>
                <td className={td}>{l.attended}</td>
                <td className={td}>
                  {l.missed > 0 ? <Badge tone="rose">{l.missed}</Badge> : "—"}
                </td>
                <td className={td}>{l.cancelled}</td>
                <td className={tdStrong}>{l.total}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Modal open={booking} onClose={() => setBooking(false)} title="Book a session">
        <div className="space-y-4">
          <StudentPicker value={child} onChange={setChild} />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Date"
              type="date"
              value={form.scheduled_on}
              onChange={(e) => setForm({ ...form, scheduled_on: e.target.value })}
            />
            <Input
              label="Time"
              type="time"
              value={form.scheduled_at}
              onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            />
            <Input
              label="Minutes"
              type="number"
              min={5}
              max={240}
              value={form.duration_minutes}
              onChange={(e) =>
                setForm({ ...form, duration_minutes: Number(e.target.value) })
              }
            />
          </div>
          <Textarea
            label="Notes the school may read"
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBooking(false)}>
              Cancel
            </Button>
            <Button onClick={book} loading={busy} disabled={!child}>
              Book it
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `${editing.student_name} — ${hhmm(editing.scheduled_at)}` : ""}
      >
        <div className="space-y-4">
          <Select
            label="What happened"
            value={outcome.status}
            onChange={(e) => setOutcome({ ...outcome, status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
          <Textarea
            label="Notes the school may read"
            rows={3}
            value={outcome.notes}
            onChange={(e) => setOutcome({ ...outcome, notes: e.target.value })}
          />

          <div className="rounded-lg border border-surface-border p-3">
            <div className="flex items-center gap-2 text-[12px] font-bold text-ink-muted">
              <Lock className="h-4 w-4" />
              Your own notes
            </div>
            <p className="mt-1 text-[12px] text-ink-subtle">
              These are not in the diary and nobody else can open them, including the
              head. They are not fetched until you ask for them.
            </p>
            <ErrorBox>{noteError}</ErrorBox>
            {ownNote === null ? (
              <Button variant="secondary" className="mt-2" onClick={loadOwnNote}>
                Open my notes
              </Button>
            ) : (
              <Textarea
                className="mt-2"
                rows={4}
                value={outcome.private_notes}
                onChange={(e) =>
                  setOutcome({ ...outcome, private_notes: e.target.value })
                }
              />
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
