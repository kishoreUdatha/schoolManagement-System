"use client";

import { useEffect, useState } from "react";
import { Plus, UserMinus } from "lucide-react";

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
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { hhmm, readableDate } from "@/lib/dates";

type Staff = { id: number; full_name: string };
type RosterRow = {
  member_id: number;
  student_id: number;
  student_name: string;
  admission_no: string;
  joined_on: string;
  left_on: string | null;
  role: string | null;
  is_current: boolean;
};
type Activity = {
  id: number;
  name: string;
  kind: string;
  description: string | null;
  in_charge_user_id: number | null;
  in_charge_name: string | null;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  venue: string | null;
  capacity: number | null;
  is_active: boolean;
  members: number;
  places_left: number | null;
  is_full: boolean;
  roster?: RosterRow[];
};

const base = "/api/v1/school/academics";
const DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const KINDS = ["club", "sport", "arts", "service", "other"];

/** Clubs, teams and everything that happens outside the timetable. */
export default function ActivitiesPage() {
  const [rows, setRows] = useState<Activity[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [open, setOpen] = useState<Activity | null>(null);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<Activity | null>(null);
  const [picked, setPicked] = useState<PickedStudent | null>(null);
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    name: "",
    kind: "club",
    description: "",
    in_charge_user_id: "",
    day_of_week: "",
    start_time: "",
    end_time: "",
    venue: "",
    capacity: "",
  });

  const load = () =>
    api
      .get<Activity[]>(`${base}/activities`)
      .then((r) => setRows(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    api
      .get<Staff[]>("/api/v1/school/staff")
      .then((r) => setStaff(r.data))
      .catch(() => setStaff([]));
  }, []);

  const openRoster = async (a: Activity) => {
    setError(null);
    try {
      const r = await api.get<Activity>(`${base}/activities/${a.id}`);
      setOpen(r.data);
    } catch (e) {
      setError(apiError(e));
    }
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`${base}/activities`, {
        name: form.name.trim(),
        kind: form.kind,
        description: form.description.trim() || null,
        in_charge_user_id: form.in_charge_user_id ? Number(form.in_charge_user_id) : null,
        day_of_week: form.day_of_week ? Number(form.day_of_week) : null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        venue: form.venue.trim() || null,
        capacity: form.capacity ? Number(form.capacity) : null,
      });
      setCreating(false);
      setForm({ ...form, name: "", description: "", venue: "", capacity: "" });
      setSaved("Activity created.");
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!joining || !picked) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Activity>(`${base}/activities/${joining.id}/members`, {
        student_id: picked.id,
        role: role.trim() || null,
      });
      setJoining(null);
      setPicked(null);
      setRole("");
      if (open?.id === r.data.id) setOpen(r.data);
      load();
    } catch (e) {
      // "full" and "already in" both come back as plain sentences worth showing.
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const leave = async (a: Activity, studentId: number, name: string) => {
    if (!window.confirm(`Take ${name} out of ${a.name}? The record of them stays.`)) return;
    setError(null);
    try {
      const r = await api.post<Activity>(`${base}/activities/${a.id}/members/leave`, {
        student_id: studentId,
      });
      setOpen(r.data);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const running = rows.filter((r) => r.is_active);
  const full = rows.filter((r) => r.is_full);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Activities and clubs"
        subtitle="What the school runs outside lessons, and who is in it."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New activity
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Activities" value={rows.length} />
        <StatCard label="Running" value={running.length} accent="emerald" />
        <StatCard label="Places taken" value={rows.reduce((n, r) => n + r.members, 0)} />
        <StatCard label="Full" value={full.length} accent={full.length ? "amber" : "neutral"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Everything on offer</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Activity", "Kind", "When", "Who runs it", "Members", ""]}
            empty={rows.length === 0 && "Nothing set up yet."}
          >
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={tdStrong}>
                  <button
                    type="button"
                    className="text-left hover:text-brand-600 hover:underline"
                    onClick={() => openRoster(a)}
                  >
                    {a.name}
                  </button>
                  {a.venue && (
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      {a.venue}
                    </span>
                  )}
                </td>
                <td className={td}>{humanize(a.kind)}</td>
                <td className={td}>
                  {a.day_of_week ? DAYS[a.day_of_week] : "No fixed day"}
                  {a.start_time && (
                    <span className="block text-[11px] text-ink-subtle">
                      {hhmm(a.start_time)}
                      {a.end_time ? ` – ${hhmm(a.end_time)}` : ""}
                    </span>
                  )}
                </td>
                <td className={td}>{a.in_charge_name ?? "Nobody named"}</td>
                <td className={td}>
                  {a.capacity ? (
                    <Badge tone={a.is_full ? "amber" : "neutral"}>
                      {a.members} of {a.capacity}
                    </Badge>
                  ) : (
                    <span>{a.members}</span>
                  )}
                </td>
                <td className={td}>
                  <Button
                    variant="secondary"
                    disabled={a.is_full || !a.is_active}
                    onClick={() => setJoining(a)}
                  >
                    Add a child
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      {open && (
        <Card>
          <CardHeader>
            <div className="min-w-0">
              <CardTitle>{open.name} — who is in it</CardTitle>
              {open.description && (
                <p className="mt-1 text-[13px] text-ink-muted">{open.description}</p>
              )}
            </div>
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Close
            </Button>
          </CardHeader>
          <CardBody className="p-0">
            <Table
              head={["Student", "Admission no", "Joined", "Role", "State", ""]}
              empty={(open.roster ?? []).length === 0 && "Nobody has joined yet."}
            >
              {(open.roster ?? []).map((m) => (
                <tr key={m.member_id}>
                  <td className={tdStrong}>{m.student_name}</td>
                  <td className={td}>{m.admission_no}</td>
                  <td className={td}>{readableDate(m.joined_on)}</td>
                  <td className={td}>{m.role ?? "—"}</td>
                  <td className={td}>
                    {m.is_current ? (
                      <Badge tone="emerald">In it</Badge>
                    ) : (
                      <Badge tone="neutral">Left {readableDate(m.left_on!)}</Badge>
                    )}
                  </td>
                  <td className={td}>
                    {m.is_current && (
                      <Button
                        variant="secondary"
                        aria-label={`Take ${m.student_name} out`}
                        onClick={() => leave(open, m.student_id, m.student_name)}
                      >
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </CardBody>
        </Card>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New activity">
        <div className="space-y-4">
          <Input
            label="Name"
            value={form.name}
            placeholder="Chess Club"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Select
            label="Kind"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {humanize(k)}
              </option>
            ))}
          </Select>
          <Select
            label="Who runs it"
            value={form.in_charge_user_id}
            onChange={(e) => setForm({ ...form, in_charge_user_id: e.target.value })}
          >
            <option value="">Nobody named yet</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </Select>
          <Select
            label="Day"
            value={form.day_of_week}
            onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}
          >
            <option value="">No fixed day</option>
            {DAYS.slice(1).map((d, i) => (
              <option key={d} value={i + 1}>
                {d}
              </option>
            ))}
          </Select>
          <div className="flex gap-3">
            <Input
              label="From"
              type="time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            />
            <Input
              label="To"
              type="time"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            />
          </div>
          <Input
            label="Where"
            value={form.venue}
            onChange={(e) => setForm({ ...form, venue: e.target.value })}
          />
          <Input
            label="Capacity (optional)"
            type="number"
            min={1}
            value={form.capacity}
            hint="Leave blank if there is no limit. Where set, joining is refused once it is full."
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          />
          <Textarea
            label="Description (optional)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button onClick={create} loading={busy} disabled={!form.name}>
              Create
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={joining !== null}
        onClose={() => setJoining(null)}
        title={joining ? `Add a child to ${joining.name}` : ""}
      >
        <div className="space-y-4">
          {joining?.capacity && (
            <p className="text-[13px] text-ink-muted">
              {joining.places_left} place(s) left of {joining.capacity}.
            </p>
          )}
          <StudentPicker value={picked} onChange={setPicked} />
          <Input
            label="Role (optional)"
            value={role}
            placeholder="Captain"
            onChange={(e) => setRole(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setJoining(null)}>
              Cancel
            </Button>
            <Button onClick={join} loading={busy} disabled={!picked}>
              Add
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
