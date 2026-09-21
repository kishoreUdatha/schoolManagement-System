"use client";

import { FormEvent, useEffect, useState } from "react";

import { hhmm } from "@/components/events/CalendarFeed";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select, Table, Textarea, humanize, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { CalendarCheck, ClipboardCheck, DoorClosed, Layers } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAcademicYear } from "@/components/AcademicYearProvider";
import { cn } from "@/lib/utils";

type Room = {
  id: number;
  name: string;
  code: string;
  kind: string;
  capacity: number | null;
  building: string | null;
  floor: string | null;
  branch_id: number | null;
  branch_name: string | null;
  section_id: number | null;
  section_label: string | null;
  notes: string | null;
  is_active: boolean;
};
type Lab = {
  id: number;
  name: string;
  code: string;
  room_id: number | null;
  room_name: string | null;
  subject_id: number | null;
  subject_name: string | null;
  in_charge_user_id: number | null;
  in_charge_name: string | null;
  capacity: number | null;
  equipment: string | null;
  safety_notes: string | null;
  is_active: boolean;
  upcoming_bookings: number;
};
type Slot = { lab_id: number; lab_name: string; free: boolean; booking_id: number | null; booked_for: string | null; booked_by: string | null };
type Availability = {
  date: string;
  is_holiday: boolean;
  holiday_name: string | null;
  labs: { id: number; name: string }[];
  periods: { period_id: number; period_number: number; start_time: string; end_time: string; labs: Slot[] }[];
};
type Booking = {
  id: number;
  lab_name: string;
  booking_date: string;
  period_number: number;
  start_time: string | null;
  section_label: string | null;
  subject_name: string | null;
  teacher_name: string | null;
  purpose: string | null;
  status: string;
};
type Staff = { user_id: number; full_name: string };
type Subject = { id: number; name: string };
type ClassRow = { id: number; name: string; sections: { id: number; name: string }[] };

const base = "/api/v1/school";
const ROOM_KINDS = ["classroom", "lab", "computer_lab", "library", "hall", "sports", "staff_room", "office", "other"];
const today = () => new Date().toISOString().slice(0, 10);

/** A control sized for the filter bar: the same height as the search box,
 *  and no stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

export function Facilities({ canManage }: { canManage: boolean }) {
  // The class list on the lab-booking form follows the top bar's year.
  const yearId = useAcademicYear()?.yearId ?? null;
  const [rooms, setRooms] = useState<Room[]>([]);
  const [labs, setLabs] = useState<Lab[]>([]);
  const [day, setDay] = useState(today());
  const [av, setAv] = useState<Availability | null>(null);
  const [mine, setMine] = useState<Booking[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [roomForm, setRoomForm] = useState({ id: 0, name: "", code: "", kind: "classroom", capacity: "", building: "", floor: "" });
  const [labForm, setLabForm] = useState<{ id: number; name: string; code: string; room_id: string; subject_id: string; in_charge_user_id: string; capacity: string; equipment: string; safety_notes: string } | null>(null);
  const [booking, setBooking] = useState<{ lab: Slot; period_id: number; period_number: number } | null>(null);
  const [bf, setBf] = useState({ section_id: "", purpose: "", students: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRooms = () => api.get<Room[]>(`${base}/rooms`).then((r) => setRooms(r.data)).catch((e) => setError(apiError(e)));
  const loadLabs = () => api.get<Lab[]>(`${base}/labs`).then((r) => setLabs(r.data)).catch((e) => setError(apiError(e)));
  const loadAv = () =>
    api.get<Availability>(`${base}/lab-availability`, { params: { date: day } }).then((r) => setAv(r.data)).catch((e) => setError(apiError(e)));
  const loadMine = () =>
    api.get<Booking[]>(`${base}/lab-bookings`, { params: { mine: true } }).then((r) => setMine(r.data)).catch(() => setMine([]));

  useEffect(() => {
    loadRooms();
    loadLabs();
    loadMine();
    api.get<Staff[]>(`${base}/directory/staff`).then((r) => setStaff(r.data)).catch(() => setStaff([]));
    api.get<Subject[]>(`${base}/subjects`).then((r) => setSubjects(r.data)).catch(() => setSubjects([]));
    if (yearId) {
      api
        .get<ClassRow[]>(`${base}/classes`, { params: { academic_year_id: yearId } })
        .then((cs) => setClasses(cs.data))
        .catch(() => setClasses([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId]);

  useEffect(() => {
    loadAv();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      setNotice(done);
      setError(null);
      loadRooms();
      loadLabs();
      loadAv();
      loadMine();
      return true;
    } catch (e) {
      setError(apiError(e));
      return false;
    }
  }

  async function saveRoom(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: roomForm.name,
      code: roomForm.code.toUpperCase(),
      kind: roomForm.kind,
      capacity: roomForm.capacity ? Number(roomForm.capacity) : null,
      building: roomForm.building.trim() || null,
      floor: roomForm.floor.trim() || null,
      is_active: true,
    };
    const ok = await run(
      () => (roomForm.id ? api.put(`${base}/rooms/${roomForm.id}`, body) : api.post(`${base}/rooms`, body)),
      roomForm.id ? "Room updated." : "Room added."
    );
    if (ok) setRoomForm({ id: 0, name: "", code: "", kind: "classroom", capacity: "", building: "", floor: "" });
  }

  async function saveLab(e: FormEvent) {
    e.preventDefault();
    if (!labForm) return;
    const body = {
      name: labForm.name,
      code: labForm.code.toUpperCase(),
      room_id: labForm.room_id ? Number(labForm.room_id) : null,
      subject_id: labForm.subject_id ? Number(labForm.subject_id) : null,
      in_charge_user_id: labForm.in_charge_user_id ? Number(labForm.in_charge_user_id) : null,
      capacity: labForm.capacity ? Number(labForm.capacity) : null,
      equipment: labForm.equipment.trim() || null,
      safety_notes: labForm.safety_notes.trim() || null,
      is_active: true,
    };
    const ok = await run(
      () => (labForm.id ? api.put(`${base}/labs/${labForm.id}`, body) : api.post(`${base}/labs`, body)),
      labForm.id ? "Lab updated." : "Lab added."
    );
    if (ok) setLabForm(null);
  }

  async function makeBooking(e: FormEvent) {
    e.preventDefault();
    if (!booking) return;
    const ok = await run(
      () =>
        api.post(`${base}/lab-bookings`, {
          lab_id: booking.lab.lab_id,
          booking_date: day,
          period_id: booking.period_id,
          section_id: bf.section_id ? Number(bf.section_id) : null,
          purpose: bf.purpose.trim() || null,
          students: bf.students ? Number(bf.students) : null,
        }),
      "Lab booked."
    );
    if (ok) setBooking(null);
  }

  const slots = (av?.periods ?? []).flatMap((p) => p.labs);
  const freeSlots = slots.filter((s) => s.free).length;
  const dayLabel = new Date(day + "T00:00:00").toDateString();

  return (
    <div className="space-y-[18px]">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {/* Everything here is already on screen: the two lists that were
          loaded, and the availability grid for the day being looked at. */}
      <StatStrip
        stats={[
          { label: "Rooms", value: rooms.length || "—", note: `${rooms.filter((r) => r.is_active).length} in use`, icon: DoorClosed },
          { label: "Labs", value: labs.length || "—", note: `${labs.filter((l) => l.is_active).length} active`, icon: Layers },
          {
            label: "Free lab periods",
            value: av ? freeSlots : "—",
            note: av?.is_holiday ? `Holiday — ${av.holiday_name}` : av ? `of ${slots.length} on ${dayLabel}` : undefined,
            icon: CalendarCheck,
          },
          { label: "My bookings", value: mine.length || "—", note: "Labs you have booked", icon: ClipboardCheck },
        ]}
      />

      <FilterBar>
        <input
          type="date"
          aria-label="Day shown on the lab timetable"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className={cn(filterSelect, "min-w-[170px]")}
        />
      </FilterBar>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Lab timetable</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">{dayLabel} · pick a free period to book it.</p>
          </div>
        </CardHeader>
        <CardBody className="space-y-3 pt-0">
          {av?.is_holiday && <Badge tone="amber">holiday — {av.holiday_name}</Badge>}
          {av && av.labs.length === 0 && <p className="text-sm text-ink-subtle">No labs set up yet.</p>}
          {av && av.labs.length > 0 && av.periods.length === 0 && (
            <p className="text-sm text-ink-subtle">No teaching periods on this day.</p>
          )}
          {av && av.periods.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink-subtle">
                    <th className="px-2 py-1">Period</th>
                    {av.labs.map((l) => (
                      <th key={l.id} className="px-2 py-1">
                        {l.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {av.periods.map((p) => (
                    <tr key={p.period_id} className="border-t border-surface-border">
                      <td className="px-2 py-2 text-ink">
                        P{p.period_number}
                        <div className="text-xs text-ink-subtle">
                          {hhmm(p.start_time)}–{hhmm(p.end_time)}
                        </div>
                      </td>
                      {p.labs.map((s) => (
                        <td key={s.lab_id} className="px-2 py-2">
                          {s.free ? (
                            <button
                              type="button"
                              className="rounded-md border border-dashed border-surface-border px-2 py-1 text-xs text-ink-subtle hover:border-brand-500 hover:text-brand-500"
                              onClick={() => {
                                setBooking({ lab: s, period_id: p.period_id, period_number: p.period_number });
                                setBf({ section_id: "", purpose: "", students: "" });
                              }}
                            >
                              free — book
                            </button>
                          ) : (
                            <span className={cn("block rounded-md bg-brand-500/10 px-2 py-1 text-xs text-ink")}>
                              {s.booked_for ?? "booked"}
                              <span className="block text-ink-subtle">{s.booked_by}</span>
                              <button
                                type="button"
                                className="mt-1 text-danger hover:underline"
                                onClick={() => {
                                  const reason = window.prompt("Why cancel?", "") ?? "";
                                  run(() => api.post(`${base}/lab-bookings/${s.booking_id}/cancel?reason=${encodeURIComponent(reason)}`), "Booking cancelled.");
                                }}
                              >
                                cancel
                              </button>
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
        {av && av.periods.length > 0 && (
          <PanelFooter
            left={`${av.periods.length} period${av.periods.length === 1 ? "" : "s"} · ${av.labs.length} lab${av.labs.length === 1 ? "" : "s"}`}
            right={`${freeSlots} free of ${slots.length}`}
          />
        )}
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>My lab bookings</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">Every lab period booked in your name, whatever the day.</p>
          </div>
        </CardHeader>
        <Table head={["Date", "Period", "Lab", "Class", "Purpose", ""]} empty={mine.length === 0 && "You haven't booked a lab."}>
          {mine.map((b) => (
            <tr key={b.id}>
              <td className={td}>{b.booking_date}</td>
              <td className={td}>
                P{b.period_number}
                {b.start_time && <div className="text-xs text-ink-subtle">{hhmm(b.start_time)}</div>}
              </td>
              <td className={tdStrong}>{b.lab_name}</td>
              <td className={td}>{b.section_label ?? "—"}</td>
              <td className={td}>{b.purpose ?? "—"}</td>
              <td className="px-4 py-3 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const reason = window.prompt("Why cancel?", "") ?? "";
                    run(() => api.post(`${base}/lab-bookings/${b.id}/cancel?reason=${encodeURIComponent(reason)}`), "Booking cancelled.");
                  }}
                >
                  Cancel
                </Button>
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`${mine.length} booking${mine.length === 1 ? "" : "s"}`}
          right={mine.length > 0 ? "Cancel one and the period frees up straight away" : "Nothing booked"}
        />
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Labs</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">The rooms that take bookings, and who looks after each one.</p>
          </div>
          {canManage && (
            <Button onClick={() => setLabForm({ id: 0, name: "", code: "", room_id: "", subject_id: "", in_charge_user_id: "", capacity: "", equipment: "", safety_notes: "" })}>
              New lab
            </Button>
          )}
        </CardHeader>
        <Table head={["Lab", "Room", "Subject", "Looked after by", "Seats", ""]} empty={labs.length === 0 && "No labs yet."}>
          {labs.map((l) => (
            <tr key={l.id}>
              <td className={tdStrong}>
                {l.name} <span className="text-xs font-normal text-ink-subtle">{l.code}</span>
                {!l.is_active && <Badge tone="rose" className="ml-2">off</Badge>}
                {l.equipment && <div className="text-xs font-normal text-ink-subtle">{l.equipment}</div>}
              </td>
              <td className={td}>{l.room_name ?? "—"}</td>
              <td className={td}>{l.subject_name ?? "—"}</td>
              <td className={td}>{l.in_charge_name ?? "—"}</td>
              <td className={td}>{l.capacity ?? "—"}</td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {canManage && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        setLabForm({
                          id: l.id, name: l.name, code: l.code, room_id: l.room_id ? String(l.room_id) : "",
                          subject_id: l.subject_id ? String(l.subject_id) : "",
                          in_charge_user_id: l.in_charge_user_id ? String(l.in_charge_user_id) : "",
                          capacity: l.capacity ? String(l.capacity) : "", equipment: l.equipment ?? "",
                          safety_notes: l.safety_notes ?? "",
                        })
                      }
                    >
                      Edit
                    </Button>
                    {l.upcoming_bookings === 0 && (
                      <Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete ${l.name}?`) && run(() => api.delete(`${base}/labs/${l.id}`), "Lab deleted.")}>
                        Delete
                      </Button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`${labs.length} lab${labs.length === 1 ? "" : "s"}`}
          right={`${labs.reduce((n, l) => n + l.upcoming_bookings, 0)} upcoming booking(s)`}
        />
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Rooms</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">Every teaching and non-teaching space, and where to find it.</p>
          </div>
        </CardHeader>
        {canManage && (
          <CardBody className="pt-0">
            <form className="flex flex-wrap items-end gap-2" onSubmit={saveRoom}>
              <Input label="Name *" value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} required />
              <Input label="Code *" value={roomForm.code} onChange={(e) => setRoomForm({ ...roomForm, code: e.target.value })} required />
              <div className="w-40">
                <Select label="Kind" value={roomForm.kind} onChange={(e) => setRoomForm({ ...roomForm, kind: e.target.value })}>
                  {ROOM_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {humanize(k)}
                    </option>
                  ))}
                </Select>
              </div>
              <Input label="Seats" type="number" min={1} value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: e.target.value })} />
              <Input label="Building" value={roomForm.building} onChange={(e) => setRoomForm({ ...roomForm, building: e.target.value })} />
              <Input label="Floor" value={roomForm.floor} onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })} />
              <Button type="submit">{roomForm.id ? "Save" : "Add room"}</Button>
              {roomForm.id > 0 && (
                <Button type="button" variant="ghost" onClick={() => setRoomForm({ id: 0, name: "", code: "", kind: "classroom", capacity: "", building: "", floor: "" })}>
                  Cancel
                </Button>
              )}
            </form>
          </CardBody>
        )}
        <Table head={["Room", "Kind", "Where", "Seats", "Branch", ""]} empty={rooms.length === 0 && "No rooms yet."}>
            {rooms.map((r) => (
              <tr key={r.id}>
                <td className={tdStrong}>
                  {r.name} <span className="text-xs font-normal text-ink-subtle">{r.code}</span>
                </td>
                <td className={td}>{humanize(r.kind)}</td>
                <td className={td}>{[r.building, r.floor].filter(Boolean).join(" · ") || "—"}</td>
                <td className={td}>{r.capacity ?? "—"}</td>
                <td className={td}>{r.branch_name ?? "—"}</td>
                <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                  {canManage && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setRoomForm({
                            id: r.id, name: r.name, code: r.code, kind: r.kind,
                            capacity: r.capacity ? String(r.capacity) : "", building: r.building ?? "", floor: r.floor ?? "",
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete ${r.name}?`) && run(() => api.delete(`${base}/rooms/${r.id}`), "Room deleted.")}>
                        Delete
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
        </Table>
        <PanelFooter
          left={`${rooms.length} room${rooms.length === 1 ? "" : "s"}`}
          right={`${rooms.reduce((n, r) => n + (r.capacity ?? 0), 0)} seat(s) in total`}
        />
      </Card>

      <Modal open={!!labForm} onClose={() => setLabForm(null)} title={labForm?.id ? "Edit lab" : "New lab"}>
        {labForm && (
          <form onSubmit={saveLab} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Name *" value={labForm.name} onChange={(e) => setLabForm({ ...labForm, name: e.target.value })} required />
              <Input label="Code *" value={labForm.code} onChange={(e) => setLabForm({ ...labForm, code: e.target.value })} required />
              <Select label="Room" value={labForm.room_id} onChange={(e) => setLabForm({ ...labForm, room_id: e.target.value })}>
                <option value="">—</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
              <Select label="Subject" value={labForm.subject_id} onChange={(e) => setLabForm({ ...labForm, subject_id: e.target.value })}>
                <option value="">—</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <Select label="Looked after by" value={labForm.in_charge_user_id} onChange={(e) => setLabForm({ ...labForm, in_charge_user_id: e.target.value })}>
                <option value="">—</option>
                {staff.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.full_name}
                  </option>
                ))}
              </Select>
              <Input label="Seats" type="number" min={1} value={labForm.capacity} onChange={(e) => setLabForm({ ...labForm, capacity: e.target.value })} />
            </div>
            <Textarea label="Equipment" rows={2} value={labForm.equipment} onChange={(e) => setLabForm({ ...labForm, equipment: e.target.value })} />
            <Textarea label="Safety notes" rows={2} value={labForm.safety_notes} onChange={(e) => setLabForm({ ...labForm, safety_notes: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setLabForm(null)}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!booking} onClose={() => setBooking(null)} title={booking ? `Book ${booking.lab.lab_name}` : ""}>
        {booking && (
          <form onSubmit={makeBooking} className="space-y-3">
            <p className="text-sm text-ink-muted">
              {new Date(day + "T00:00:00").toDateString()} · period {booking.period_number}
            </p>
            <Select label="Class" value={bf.section_id} onChange={(e) => setBf({ ...bf, section_id: e.target.value })}>
              <option value="">—</option>
              {classes.flatMap((c) =>
                c.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {c.name} {s.name}
                  </option>
                ))
              )}
            </Select>
            <Input label="What for" value={bf.purpose} onChange={(e) => setBf({ ...bf, purpose: e.target.value })} placeholder="Practical: titration" />
            <Input label="How many students" type="number" min={1} value={bf.students} onChange={(e) => setBf({ ...bf, students: e.target.value })} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setBooking(null)}>
                Cancel
              </Button>
              <Button type="submit">Book</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
