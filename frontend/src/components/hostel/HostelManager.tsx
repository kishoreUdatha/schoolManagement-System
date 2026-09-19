"use client";

import { FormEvent, useEffect, useState } from "react";

import { PickedStudent, StudentPicker } from "@/components/StudentPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, Textarea, humanize, inr, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Hostel = {
  id: number;
  name: string;
  kind: string;
  warden_user_id: number | null;
  warden_name: string | null;
  address: string | null;
  monthly_fee: string;
  curfew: string | null;
  is_active: boolean;
  rooms: number;
  beds: number;
  occupied: number;
};
type Bed = { id: number; label: string; student_id: number | null; student_name: string | null; section_label: string | null; allocation_id: number | null; since: string | null };
type Room = { id: number; room_no: string; floor: string | null; room_type: string | null; effective_fee: string; is_active: boolean; beds: Bed[] };
type Resident = { student_id: number; student_name: string; admission_no: string; section_label: string | null; room_no: string; bed_label: string; today: Record<string, string>; out_now: boolean };
type Outing = { id: number; student_name: string; kind: string; leave_at: string; return_by: string; reason: string; escort_name: string | null; status: string; requested_by_parent: boolean; overdue: boolean; late_by_minutes: number | null };
type Complaint = { id: number; student_name: string | null; category: string; description: string; status: string; raised_by_name: string | null; created_at: string };
type Slot = { day_of_week: number; meal: string; items: string };

const API = "/api/v1/school/hostels";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEALS = ["breakfast", "lunch", "snacks", "dinner"];
const dt = (iso: string) => new Date(iso).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** manager = school admin / principal (setup, allocation, fees). Wardens get the day-to-day tabs. */
export function HostelManager({ manager }: { manager: boolean }) {
  const [hostels, setHostels] = useState<Hostel[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [tab, setTab] = useState<"rooms" | "roll" | "outings" | "menu" | "complaints">(manager ? "rooms" : "roll");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Hostel | "new" | null>(null);
  const [billing, setBilling] = useState(false);

  async function load() {
    try {
      const { data } = await api.get<Hostel[]>(API);
      setHostels(data);
      if (data.length && (current === null || !data.some((h) => h.id === current))) setCurrent(data[0].id);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const h = hostels.find((x) => x.id === current);
  const flash = (m: string) => {
    setNotice(m);
    setError(null);
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hostel"
        subtitle={manager ? "Rooms, residents, roll call, outings, mess menu and complaints." : "Your hostel: roll call, outings, menu and complaints."}
        actions={
          manager && (
            <>
              <Button variant="secondary" onClick={() => setBilling(true)}>
                Raise monthly fees
              </Button>
              <Button onClick={() => setEditing("new")}>+ New hostel</Button>
            </>
          )
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {hostels.length === 0 && <Card className="p-8 text-center text-sm text-ink-muted">{manager ? "No hostels yet." : "You aren't the warden of any hostel."}</Card>}

      {hostels.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {hostels.map((x) => (
            <button
              key={x.id}
              onClick={() => setCurrent(x.id)}
              className={`rounded-xl border px-4 py-3 text-left text-sm ${x.id === current ? "border-brand-500 bg-brand-500/10" : "border-surface-border bg-surface-raised/60"}`}
            >
              <div className="font-semibold text-ink">
                {x.name} {!x.is_active && <Badge>inactive</Badge>}
              </div>
              <div className="text-xs text-ink-muted">
                {humanize(x.kind)} · {x.occupied}/{x.beds} beds · warden {x.warden_name ?? "—"}
              </div>
            </button>
          ))}
        </div>
      )}

      {h && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <nav className="flex flex-wrap gap-1 border-b border-surface-border">
              {(["rooms", "roll", "outings", "menu", "complaints"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
                >
                  {{ rooms: "Rooms & beds", roll: "Residents & roll call", outings: "Outings", menu: "Mess menu", complaints: "Complaints" }[t]}
                </button>
              ))}
            </nav>
            {manager && (
              <Button size="sm" variant="secondary" onClick={() => setEditing(h)}>
                Edit hostel
              </Button>
            )}
          </div>
          {tab === "rooms" && <Rooms hostel={h} manager={manager} onChange={flash} onError={setError} />}
          {tab === "roll" && <RollCall hostel={h} onChange={flash} onError={setError} />}
          {tab === "outings" && <Outings hostel={h} onChange={flash} onError={setError} />}
          {tab === "menu" && <Menu hostel={h} onChange={flash} onError={setError} />}
          {tab === "complaints" && <Complaints hostel={h} onChange={flash} onError={setError} />}
        </>
      )}

      {editing && (
        <HostelModal
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(m) => {
            setEditing(null);
            flash(m);
          }}
        />
      )}
      {billing && (
        <FeeModal
          onClose={() => setBilling(false)}
          onDone={(m) => {
            setBilling(false);
            flash(m);
          }}
        />
      )}
    </div>
  );
}

type Handlers = { onChange: (m: string) => void; onError: (m: string) => void };

function Rooms({ hostel, manager, onChange, onError }: Handlers & { hostel: Hostel; manager: boolean }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [assigning, setAssigning] = useState<{ room: Room; bed: Bed } | null>(null);
  const [newRoom, setNewRoom] = useState({ room_no: "", floor: "", room_type: "", beds: "2", monthly_fee: "" });

  const load = () =>
    api
      .get<Room[]>(`${API}/${hostel.id}/rooms`)
      .then((r) => setRooms(r.data))
      .catch((e) => onError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostel.id]);

  async function addRoom(e: FormEvent) {
    e.preventDefault();
    try {
      const { data } = await api.post<Room[]>(`${API}/${hostel.id}/rooms`, {
        room_no: newRoom.room_no,
        floor: newRoom.floor || null,
        room_type: newRoom.room_type || null,
        beds: Number(newRoom.beds),
        monthly_fee: newRoom.monthly_fee || null,
      });
      setRooms(data);
      setNewRoom({ ...newRoom, room_no: "" });
      onChange(`Room ${newRoom.room_no.toUpperCase()} added.`);
    } catch (err) {
      onError(apiError(err));
    }
  }

  async function vacate(b: Bed) {
    if (!b.allocation_id || !window.confirm(`Move ${b.student_name} out of this bed today?`)) return;
    try {
      await api.post(`${API}/allocations/${b.allocation_id}/vacate`);
      onChange(`${b.student_name} vacated.`);
      load();
    } catch (e) {
      onError(apiError(e));
    }
  }

  return (
    <div className="space-y-4">
      {manager && (
        <Card>
          <CardBody>
            <form onSubmit={addRoom} className="grid items-end gap-3 sm:grid-cols-6">
              <Input label="Room no. *" value={newRoom.room_no} onChange={(e) => setNewRoom({ ...newRoom, room_no: e.target.value })} required />
              <Input label="Floor" value={newRoom.floor} onChange={(e) => setNewRoom({ ...newRoom, floor: e.target.value })} />
              <Input label="Type" placeholder="AC / non-AC" value={newRoom.room_type} onChange={(e) => setNewRoom({ ...newRoom, room_type: e.target.value })} />
              <Input label="Beds *" type="number" min="1" max="40" value={newRoom.beds} onChange={(e) => setNewRoom({ ...newRoom, beds: e.target.value })} />
              <Input label="Fee ₹/month" placeholder={`Hostel: ${hostel.monthly_fee}`} type="number" min="0" value={newRoom.monthly_fee} onChange={(e) => setNewRoom({ ...newRoom, monthly_fee: e.target.value })} />
              <Button type="submit">Add room</Button>
            </form>
          </CardBody>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rooms.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>
                Room {r.room_no} {!r.is_active && <Badge>inactive</Badge>}
              </CardTitle>
              <span className="text-xs text-ink-muted">
                {[r.floor && `Floor ${r.floor}`, r.room_type, `${inr(r.effective_fee)}/mo`].filter(Boolean).join(" · ")}
              </span>
            </CardHeader>
            <CardBody className="space-y-2">
              {r.beds.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="w-8 font-mono text-ink-subtle">{b.label}</span>
                  {b.student_id ? (
                    <span className="flex-1 text-ink">
                      {b.student_name} <span className="text-xs text-ink-subtle">{b.section_label}</span>
                    </span>
                  ) : (
                    <span className="flex-1 text-emerald-500">empty</span>
                  )}
                  {manager &&
                    (b.student_id ? (
                      <Button size="sm" variant="ghost" onClick={() => vacate(b)}>
                        Vacate
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => setAssigning({ room: r, bed: b })}>
                        Assign
                      </Button>
                    ))}
                </div>
              ))}
            </CardBody>
          </Card>
        ))}
      </div>
      {assigning && (
        <AssignModal
          room={assigning.room}
          bed={assigning.bed}
          onClose={() => setAssigning(null)}
          onSaved={(m) => {
            setAssigning(null);
            onChange(m);
            load();
          }}
        />
      )}
    </div>
  );
}

function AssignModal({ room, bed, onClose, onSaved }: { room: Room; bed: Bed; onClose: () => void; onSaved: (m: string) => void }) {
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title={`Assign bed ${room.room_no}-${bed.label}`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!student) return;
          try {
            await api.post(`${API}/allocations`, { student_id: student.id, bed_id: bed.id, start_date: start });
            onSaved(`${student.full_name} → ${room.room_no}-${bed.label}.`);
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <StudentPicker value={student} onChange={setStudent} />
        <Input label="From" type="date" value={start} onChange={(e) => setStart(e.target.value)} hint="If the student already has a bed, they move from this date." />
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!student}>
            Assign
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RollCall({ hostel, onChange, onError }: Handlers & { hostel: Hostel }) {
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [session, setSession] = useState<"morning" | "night">(new Date().getHours() < 14 ? "morning" : "night");
  const [residents, setResidents] = useState<Resident[]>([]);
  const [marks, setMarks] = useState<Record<number, string>>({});

  async function load() {
    try {
      const { data } = await api.get<Resident[]>(`${API}/${hostel.id}/residents`, { params: { on: day } });
      setResidents(data);
      setMarks(Object.fromEntries(data.map((r) => [r.student_id, r.today[session] ?? (r.out_now ? "on_leave" : "present")])));
    } catch (e) {
      onError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostel.id, day, session]);

  async function save() {
    try {
      const { data } = await api.post<{ marked: number }>(`${API}/${hostel.id}/roll-call`, {
        date: day,
        session,
        marks: Object.entries(marks).map(([student_id, status]) => ({ student_id: Number(student_id), status })),
      });
      const absent = Object.values(marks).filter((m) => m === "absent").length;
      onChange(`Roll call saved for ${data.marked} residents.${absent ? ` ${absent} absent — parents notified.` : ""}`);
      load();
    } catch (e) {
      onError(apiError(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Input label="Date" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        <Select label="Roll call" value={session} onChange={(e) => setSession(e.target.value as "morning" | "night")}>
          <option value="morning">Morning</option>
          <option value="night">Night</option>
        </Select>
        <Button onClick={save} disabled={residents.length === 0}>
          Save roll call
        </Button>
      </div>
      <Card>
        <Table head={["Room", "Student", "Class", "Status"]} empty={residents.length === 0 && "No residents."}>
          {residents.map((r) => (
            <tr key={r.student_id}>
              <td className={td}>
                {r.room_no}-{r.bed_label}
              </td>
              <td className={tdStrong}>
                {r.student_name} {r.out_now && <Badge tone="amber">out</Badge>}
              </td>
              <td className={td}>{r.section_label}</td>
              <td className="space-x-1 px-3 py-2">
                {(["present", "absent", "on_leave"] as const).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={marks[r.student_id] === s ? (s === "absent" ? "danger" : "primary") : "secondary"}
                    onClick={() => setMarks({ ...marks, [r.student_id]: s })}
                  >
                    {humanize(s)}
                  </Button>
                ))}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function Outings({ hostel, onChange, onError }: Handlers & { hostel: Hostel }) {
  const [items, setItems] = useState<Outing[]>([]);
  const [all, setAll] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = () =>
    api
      .get<Outing[]>(`${API}/${hostel.id}/outings`, { params: { active_only: !all } })
      .then((r) => setItems(r.data))
      .catch((e) => onError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostel.id, all]);

  async function act(o: Outing, path: string, body: object | undefined, msg: string) {
    try {
      await api.post(`${API}/outings/${o.id}/${path}`, body);
      onChange(msg);
      load();
    } catch (e) {
      onError(apiError(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Show past outings
        </label>
        <Button onClick={() => setCreating(true)}>+ Record outing</Button>
      </div>
      <Card>
        <Table head={["Student", "Type", "Leaves", "Back by", "Reason", "Status", ""]} empty={items.length === 0 && "No outings."}>
          {items.map((o) => (
            <tr key={o.id}>
              <td className={tdStrong}>
                {o.student_name}
                {o.requested_by_parent && <div className="text-xs font-normal text-ink-subtle">requested by parent</div>}
              </td>
              <td className={td}>{humanize(o.kind)}</td>
              <td className={td}>{dt(o.leave_at)}</td>
              <td className={`px-3 py-2 ${o.overdue ? "font-medium text-rose-400" : "text-ink-muted"}`}>
                {dt(o.return_by)}
                {o.overdue && <div className="text-xs">overdue</div>}
                {o.late_by_minutes ? <div className="text-xs text-amber-500">returned {o.late_by_minutes} min late</div> : null}
              </td>
              <td className={td}>
                {o.reason}
                {o.escort_name && <div className="text-xs text-ink-subtle">with {o.escort_name}</div>}
              </td>
              <td className="px-3 py-2">
                <Badge tone={o.status === "out" ? "amber" : o.status === "requested" ? "brand" : o.status === "returned" ? "emerald" : "neutral"}>{o.status}</Badge>
              </td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {o.status === "requested" && (
                  <>
                    <Button size="sm" onClick={() => act(o, "decide", { approve: true }, "Approved; parents notified.")}>
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const note = window.prompt("Reason for the parent?");
                        if (note) act(o, "decide", { approve: false, note }, "Rejected.");
                      }}
                    >
                      Reject
                    </Button>
                  </>
                )}
                {o.status === "approved" && (
                  <Button size="sm" onClick={() => act(o, "out", undefined, `${o.student_name} signed out.`)}>
                    Signed out
                  </Button>
                )}
                {o.status === "out" && (
                  <Button size="sm" onClick={() => act(o, "returned", undefined, `${o.student_name} is back.`)}>
                    Returned
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      {creating && (
        <OutingModal
          hostel={hostel}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            onChange("Outing recorded.");
            load();
          }}
        />
      )}
    </div>
  );
}

function OutingModal({ hostel, onClose, onSaved }: { hostel: Hostel; onClose: () => void; onSaved: () => void }) {
  const [residents, setResidents] = useState<Resident[]>([]);
  const [f, setF] = useState({ student_id: "", kind: "outing", leave_at: "", return_by: "", reason: "", escort_name: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<Resident[]>(`${API}/${hostel.id}/residents`).then((r) => setResidents(r.data)).catch(() => undefined);
  }, [hostel.id]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title="Record outing">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.post(`${API}/outings`, {
              student_id: Number(f.student_id),
              kind: f.kind,
              leave_at: new Date(f.leave_at).toISOString(),
              return_by: new Date(f.return_by).toISOString(),
              reason: f.reason,
              escort_name: f.escort_name || null,
            });
            onSaved();
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <Select label="Resident *" value={f.student_id} onChange={set("student_id")} required>
          <option value="">Select</option>
          {residents.map((r) => (
            <option key={r.student_id} value={r.student_id}>
              {r.student_name} ({r.room_no})
            </option>
          ))}
        </Select>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Type" value={f.kind} onChange={set("kind")}>
            <option value="outing">Outing (same day)</option>
            <option value="home_leave">Home leave</option>
          </Select>
          <Input label="With" value={f.escort_name} onChange={set("escort_name")} />
          <Input label="Leaves *" type="datetime-local" value={f.leave_at} onChange={set("leave_at")} required />
          <Input label="Back by *" type="datetime-local" value={f.return_by} onChange={set("return_by")} required />
        </div>
        <Input label="Reason *" value={f.reason} onChange={set("reason")} required />
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

function Menu({ hostel, onChange, onError }: Handlers & { hostel: Hostel }) {
  const [grid, setGrid] = useState<Record<string, string>>({});
  useEffect(() => {
    api
      .get<Slot[]>(`${API}/${hostel.id}/menu`)
      .then((r) => setGrid(Object.fromEntries(r.data.map((s) => [`${s.day_of_week}-${s.meal}`, s.items]))))
      .catch((e) => onError(apiError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostel.id]);

  async function save() {
    const slots = Object.entries(grid)
      .filter(([, v]) => v.trim())
      .map(([k, items]) => {
        const [d, meal] = k.split("-");
        return { day_of_week: Number(d), meal, items: items.trim() };
      });
    try {
      await api.put(`${API}/${hostel.id}/menu`, { slots });
      onChange("Menu saved.");
    } catch (e) {
      onError(apiError(e));
    }
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-subtle">
            <tr>
              <th className="px-3 py-2" />
              {MEALS.map((m) => (
                <th key={m} className="px-3 py-2 font-medium">
                  {humanize(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((d, i) => (
              <tr key={d}>
                <td className="px-3 py-1 font-medium text-ink">{d}</td>
                {MEALS.map((m) => (
                  <td key={m} className="px-1 py-1">
                    <Input value={grid[`${i}-${m}`] ?? ""} onChange={(e) => setGrid({ ...grid, [`${i}-${m}`]: e.target.value })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CardBody>
        <Button onClick={save}>Save menu</Button>
      </CardBody>
    </Card>
  );
}

function Complaints({ hostel, onChange, onError }: Handlers & { hostel: Hostel }) {
  const [items, setItems] = useState<Complaint[]>([]);
  const [all, setAll] = useState(false);
  const [f, setF] = useState({ category: "maintenance", description: "" });

  const load = () =>
    api
      .get<Complaint[]>(`${API}/${hostel.id}/complaints`, { params: { open_only: !all } })
      .then((r) => setItems(r.data))
      .catch((e) => onError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostel.id, all]);

  async function update(c: Complaint, status: string) {
    const resolution = status === "resolved" ? window.prompt("How was it resolved?") : null;
    if (status === "resolved" && !resolution) return;
    try {
      await api.patch(`${API}/complaints/${c.id}`, { status, resolution });
      onChange(status === "resolved" ? "Resolved." : "Updated.");
      load();
    } catch (e) {
      onError(apiError(e));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <form
            className="grid items-end gap-3 sm:grid-cols-5"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.post(`${API}/${hostel.id}/complaints`, f);
                setF({ ...f, description: "" });
                onChange("Complaint logged.");
                load();
              } catch (err) {
                onError(apiError(err));
              }
            }}
          >
            <Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {["maintenance", "food", "cleanliness", "security", "roommate", "other"].map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </Select>
            <div className="sm:col-span-3">
              <Textarea label="Issue" rows={1} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} required minLength={5} />
            </div>
            <Button type="submit">Log</Button>
          </form>
        </CardBody>
      </Card>
      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        Include resolved
      </label>
      <Card>
        <Table head={["Raised", "Category", "Issue", "Status", ""]} empty={items.length === 0 && "No complaints."}>
          {items.map((c) => (
            <tr key={c.id}>
              <td className={td}>
                {c.created_at.slice(0, 10)}
                <div className="text-xs text-ink-subtle">{c.raised_by_name}</div>
              </td>
              <td className={td}>{humanize(c.category)}</td>
              <td className={td}>
                {c.description}
                {c.student_name && <div className="text-xs text-ink-subtle">{c.student_name}</div>}
              </td>
              <td className="px-3 py-2">
                <Badge tone={c.status === "resolved" ? "emerald" : c.status === "in_progress" ? "brand" : "amber"}>{humanize(c.status)}</Badge>
              </td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {c.status === "open" && (
                  <Button size="sm" variant="secondary" onClick={() => update(c, "in_progress")}>
                    Working on it
                  </Button>
                )}
                {c.status !== "resolved" && (
                  <Button size="sm" onClick={() => update(c, "resolved")}>
                    Resolve
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function HostelModal({ existing, onClose, onSaved }: { existing: Hostel | null; onClose: () => void; onSaved: (m: string) => void }) {
  const [staff, setStaff] = useState<{ user_id: number; full_name: string }[]>([]);
  const [f, setF] = useState({
    name: existing?.name ?? "",
    kind: existing?.kind ?? "boys",
    warden_user_id: existing?.warden_user_id ? String(existing.warden_user_id) : "",
    address: existing?.address ?? "",
    monthly_fee: existing?.monthly_fee ?? "0",
    curfew: existing?.curfew ?? "",
    is_active: existing?.is_active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<{ user_id: number; full_name: string }[]>("/api/v1/school/front-desk/hosts").then((r) => setStaff(r.data)).catch(() => undefined);
  }, []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open onClose={onClose} title={existing ? `Edit ${existing.name}` : "New hostel"}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const payload = { ...f, warden_user_id: f.warden_user_id ? Number(f.warden_user_id) : null, address: f.address || null, curfew: f.curfew || null };
          try {
            if (existing) await api.put(`${API}/${existing.id}`, payload);
            else await api.post(API, payload);
            onSaved(existing ? "Hostel updated." : "Hostel created.");
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name *" value={f.name} onChange={set("name")} required />
          <Select label="For" value={f.kind} onChange={set("kind")}>
            <option value="boys">Boys</option>
            <option value="girls">Girls</option>
            <option value="mixed">Mixed</option>
          </Select>
          <Select label="Warden" value={f.warden_user_id} onChange={set("warden_user_id")}>
            <option value="">None</option>
            {staff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name}
              </option>
            ))}
          </Select>
          <Input label="Fee ₹/month" type="number" min="0" value={f.monthly_fee} onChange={set("monthly_fee")} />
          <Input label="Curfew" type="time" value={f.curfew} onChange={set("curfew")} />
          <Input label="Address" value={f.address} onChange={set("address")} />
        </div>
        {existing && (
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
            Active
          </label>
        )}
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

function FeeModal({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [heads, setHeads] = useState<{ id: number; name: string; code: string }[]>([]);
  const [headId, setHeadId] = useState("");
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<{ id: number; name: string; code: string }[]>("/api/v1/school/fees/heads")
      .then((r) => {
        setHeads(r.data);
        const g = r.data.find((h) => /hostel|board/i.test(`${h.name} ${h.code}`));
        if (g) setHeadId(String(g.id));
      })
      .catch(() => undefined);
  }, []);
  return (
    <Modal open onClose={onClose} title="Raise monthly hostel fees">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            const { data } = await api.post<{ created: number; skipped: number; total_amount: string }>(`${API}/fees/generate`, {
              fee_head_id: Number(headId),
              period,
            });
            onDone(`Raised ${data.created} hostel fee(s) for ${period} totalling ${inr(data.total_amount)}.`);
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <p className="text-sm text-ink-muted">One fee per resident at their room&apos;s rate. Residents already billed for the month are skipped.</p>
        <Select label="Fee head *" value={headId} onChange={(e) => setHeadId(e.target.value)} required>
          <option value="">Select</option>
          {heads.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} ({h.code})
            </option>
          ))}
        </Select>
        <Input label="Month" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!headId}>
            Raise fees
          </Button>
        </div>
      </form>
    </Modal>
  );
}
