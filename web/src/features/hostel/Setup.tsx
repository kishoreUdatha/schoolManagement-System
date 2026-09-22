"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, Kv, Modal, ModalActions, SearchBox, StudentPicker, addDays, formNum, formText, today, type PickedStudent } from "@/features/transport/kit";
import type { Bed, Hostel, Resident, Room, Rota, StaffOption } from "./types";

import { ask } from "@/lib/dialog";
export const HOSTELS = "/api/v1/school/hostels";

/** ?new=1 opens the page's "add" dialog; the page-head button links to it. */
export function useAddDialog(screen: number) {
  const router = useRouter();
  const open = useSearchParams().get("new") === "1";
  return { open, close: () => router.replace(routeOf(screen)), show: () => router.replace(`${routeOf(screen)}?new=1`) };
}

/** The school's hostels and the one being looked at (first by default). */
export function useHostel() {
  const hostels = useApi<Hostel[]>(HOSTELS);
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    if (hostels.data?.length && (id === null || !hostels.data.some((h) => h.id === id))) setId(hostels.data[0].id);
  }, [hostels.data, id]);
  const hostel = hostels.data?.find((h) => h.id === id) ?? null;
  const select = (
    <select aria-label="Hostel" value={id ?? ""} onChange={(e) => setId(Number(e.target.value))} disabled={!hostels.data?.length}>
      {hostels.data?.length ? null : <option value="">{hostels.loading ? "Loading hostels…" : "No hostels yet"}</option>}
      {hostels.data?.map((h) => (
        <option key={h.id} value={h.id}>
          {`${h.name} hostel`}
        </option>
      ))}
    </select>
  );
  return { hostels, hostel, select };
}

/** A figure for a stat strip: "…" until the first load lands. */
const fig = (loading: boolean, v: number) => (loading ? "…" : String(v));
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

/** Shown in place of a hostel screen when the school has no hostel yet. */
export function NoHostel({ loading }: { loading: boolean }) {
  return (
    <section className="panel">
      <div className="panel-pad muted">{loading ? "Loading hostels…" : "No hostels are set up yet. Add one under Hostels / Buildings."}</div>
    </section>
  );
}

const KINDS = { boys: "Boys", girls: "Girls", mixed: "Mixed" } as const;

/** SCR-208, live: GET/POST /hostels, PUT /hostels/{id}; wardens from /directory/staff. */
export function HostelList() {
  const hostels = useApi<Hostel[]>(HOSTELS);
  const staff = useApi<StaffOption[]>("/api/v1/school/directory/staff");
  const add = useAddDialog(208);
  const [editing, setEditing] = useState<Hostel | null>(null);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const all = hostels.data ?? [];
  const items = all.filter((h) => (!kind || h.kind === kind) && (!search.trim() || `${h.name} ${h.address ?? ""} ${h.warden_name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())));
  const rows: Row[] = items.map((h) => [h.name, h.address ?? "—", KINDS[h.kind], String(h.rooms), `${h.occupied} / ${h.beds}`, h.warden_name ?? "No warden", h.is_active ? "Active" : "Inactive"]);
  const open = add.open || editing !== null;
  const beds = all.reduce((s, x) => s + x.beds, 0);
  const taken = all.reduce((s, x) => s + x.occupied, 0);
  const n = (v: number) => fig(hostels.loading && !hostels.data, v);
  const stats = [
    { label: "Hostels", value: n(all.length), note: `${all.filter((x) => x.is_active).length} active` },
    { label: "Rooms", value: n(all.reduce((s, x) => s + x.rooms, 0)), note: `${beds} beds in all` },
    { label: "Beds taken", value: n(taken), note: `${pct(taken, beds)} occupied · ${beds - taken} free` },
    { label: "No warden", value: n(all.filter((x) => !x.warden_user_id).length), note: "Hostels without a resident warden" },
  ];
  const close = () => {
    setError(null);
    if (editing) setEditing(null);
    else add.close();
  };

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: formText(f, "name"),
      kind: formText(f, "kind"),
      warden_user_id: formNum(f, "warden_user_id"),
      address: formText(f, "address"),
      monthly_fee: formText(f, "monthly_fee") ?? "0",
      curfew: formText(f, "curfew"),
      is_active: f.get("status") !== "inactive",
    };
    setSaving(true);
    setError(null);
    try {
      if (editing) await api.put(`${HOSTELS}/${editing.id}`, body);
      else await api.post(HOSTELS, body);
      notify(editing ? "Hostel saved." : "Hostel added.");
      close();
      hostels.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const h = editing;
  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search hostels…" />
        <select aria-label="Filter by type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          {Object.entries(KINDS).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{hostels.error ?? (!open ? error : null)}</ErrorNote>
      <Panel title="Hostels" sub={hostels.data ? `${all.length} hostel(s) · ${all.reduce((s, x) => s + x.occupied, 0)} of ${all.reduce((s, x) => s + x.beds, 0)} beds taken` : "Loading…"} flush>
        <DataTable
          columns={["Hostel", "Building", "Type", "Rooms", "Beds", "Warden", "Status"]}
          rows={rows}
          onView={(i) => setEditing(items[i])}
          empty={hostels.loading ? "Loading hostels…" : all.length ? "No hostels match." : "No hostels yet. Add the first one."}
        />
      </Panel>
      {open ? (
        <Modal title={h ? `Edit ${h.name}` : "Add hostel"} onClose={close}>
          <form onSubmit={save}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <Field label="Name" required>
                <input name="name" required defaultValue={h?.name ?? ""} />
              </Field>
              <Field label="Type" required>
                <select name="kind" defaultValue={h?.kind ?? "boys"}>
                  {Object.entries(KINDS).map(([k, t]) => (
                    <option key={k} value={k}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Warden">
                <select name="warden_user_id" defaultValue={h?.warden_user_id ?? ""}>
                  <option value="">No warden</option>
                  {staff.data?.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {`${s.full_name} · ${label(s.role)}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Monthly fee (₹)">
                <input name="monthly_fee" type="number" min={0} step="0.01" defaultValue={h?.monthly_fee ?? ""} />
              </Field>
              <Field label="Curfew">
                <input name="curfew" defaultValue={h?.curfew ?? ""} placeholder="e.g. 21:00" />
              </Field>
              <Field label="Status">
                <select name="status" defaultValue={h?.is_active === false ? "inactive" : "active"}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
              <Field label="Building / address" full>
                <input name="address" defaultValue={h?.address ?? ""} />
              </Field>
            </div>
            <ModalActions onClose={close} saving={saving} label={h ? "Save hostel" : "Add hostel"} />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

/** SCR-209, live: GET/POST /hostels/{id}/rooms, PATCH /hostels/rooms/{id}. */
export function RoomsBeds() {
  const { hostels, hostel, select } = useHostel();
  const rooms = useApi<Room[]>(hostel ? `${HOSTELS}/${hostel.id}/rooms` : null);
  const add = useAddDialog(209);
  const [viewing, setViewing] = useState<Room | null>(null);
  const [search, setSearch] = useState("");
  const [free, setFree] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = (rooms.data ?? []).filter((r) => {
    const q = search.trim().toLowerCase();
    const freeBeds = r.beds.filter((b) => !b.student_id).length;
    return (!q || [r.room_no, r.floor, r.room_type, ...r.beds.map((b) => b.student_name)].some((x) => x?.toLowerCase().includes(q))) && (!free || (free === "free" ? freeBeds > 0 : freeBeds === 0));
  });
  // Figures for the hostel in view; active rooms only, as the allocation screen offers.
  const live = (rooms.data ?? []).filter((r) => r.is_active);
  const allBeds = live.flatMap((r) => r.beds);
  const usedBeds = allBeds.filter((b) => b.student_id).length;
  const n = (v: number) => fig((hostels.loading && !hostels.data) || (rooms.loading && !rooms.data), v);
  const stats = [
    { label: "Rooms", value: n(live.length), note: hostel ? `In ${hostel.name} · ${(rooms.data ?? []).length - live.length} inactive` : "No hostel chosen" },
    { label: "Beds", value: n(allBeds.length), note: `${pct(usedBeds, allBeds.length)} occupied` },
    { label: "Occupied", value: n(usedBeds), note: "Beds with a student" },
    { label: "Free beds", value: n(allBeds.length - usedBeds), note: `${live.filter((r) => r.beds.every((b) => b.student_id)).length} room(s) full` },
  ];
  const close = () => {
    setError(null);
    if (viewing) setViewing(null);
    else add.close();
  };

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      if (viewing) {
        await api.patch(`${HOSTELS}/rooms/${viewing.id}`, { floor: formText(f, "floor"), room_type: formText(f, "room_type"), beds: formNum(f, "beds"), monthly_fee: formText(f, "monthly_fee"), is_active: f.get("status") !== "inactive" });
        notify("Room saved.");
      } else {
        await api.post(`${HOSTELS}/${hostel!.id}/rooms`, { room_no: formText(f, "room_no"), floor: formText(f, "floor"), room_type: formText(f, "room_type"), beds: formNum(f, "beds") ?? 1, monthly_fee: formText(f, "monthly_fee") });
        notify("Room added.");
      }
      close();
      rooms.reload();
      hostels.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const r = viewing;
  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search rooms & beds…" />
        {select}
        <select aria-label="Filter by free beds" value={free} onChange={(e) => setFree(e.target.value)}>
          <option value="">All rooms</option>
          <option value="free">With a free bed</option>
          <option value="full">Full</option>
        </select>
      </div>
      <ErrorNote>{hostels.error ?? rooms.error ?? (!add.open && !viewing ? error : null)}</ErrorNote>
      {!hostel ? (
        <NoHostel loading={hostels.loading} />
      ) : items.length ? (
        <div className="room-grid">
          {items.map((room) => {
            const freeBeds = room.beds.filter((b) => !b.student_id).length;
            return (
              <article className="room-card" key={room.id}>
                <div className="spread">
                  <h3>{`Room ${room.room_no}`}</h3>
                  <Icon name="building" />
                </div>
                <p>{[hostel.name, room.floor ? `Floor ${room.floor}` : null, room.room_type].filter(Boolean).join(" · ")}</p>
                <div className="beds">
                  {room.beds.map((b) => (
                    <span key={b.id} className={`bed ${b.student_id ? "used" : ""}`} title={b.student_name ?? "Free"}>
                      {b.label}
                    </span>
                  ))}
                </div>
                <div className="spread">
                  <Badge>{!room.is_active ? "Inactive" : freeBeds ? `${freeBeds} bed${freeBeds > 1 ? "s" : ""} available` : "Full"}</Badge>
                </div>
                <div style={{ height: "12px" }} />
                <button type="button" className="btn" onClick={() => setViewing(room)}>
                  View room
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="panel">
          <div className="panel-pad muted">{rooms.loading ? "Loading rooms…" : "No rooms match. Add rooms to this hostel."}</div>
        </section>
      )}
      {(add.open && hostel) || r ? (
        <Modal title={r ? `Room ${r.room_no}` : `Add room to ${hostel?.name}`} onClose={close}>
          <form onSubmit={save}>
            <ErrorNote>{error}</ErrorNote>
            {r ? (
              <>
                <Kv rows={r.beds.map((b): [string, string] => [`Bed ${b.label}`, b.student_name ? `${b.student_name}${b.section_label ? ` · ${b.section_label}` : ""} · since ${date(b.since)}` : "Free"])} />
                <div className="gap" />
              </>
            ) : null}
            <div className="form-grid">
              {r ? null : (
                <Field label="Room no." required>
                  <input name="room_no" required />
                </Field>
              )}
              <Field label="Floor">
                <input name="floor" defaultValue={r?.floor ?? ""} />
              </Field>
              <Field label="Room type">
                <input name="room_type" defaultValue={r?.room_type ?? ""} placeholder="e.g. Dormitory, Twin" />
              </Field>
              <Field label="Beds" required>
                <input name="beds" type="number" min={1} max={50} required defaultValue={r?.beds.length ?? 2} />
              </Field>
              <Field label="Fee override (₹ / month)">
                <input name="monthly_fee" type="number" min={0} step="0.01" defaultValue={r?.monthly_fee ?? ""} placeholder={`Hostel fee ${money(hostel?.monthly_fee)}`} />
              </Field>
              {r ? (
                <Field label="Status">
                  <select name="status" defaultValue={r.is_active ? "active" : "inactive"}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
              ) : null}
            </div>
            <ModalActions onClose={close} saving={saving} label={r ? "Save room" : "Add room"} />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

const freeBedsOf = (rooms: Room[] | null) => (rooms ?? []).filter((r) => r.is_active).flatMap((r) => r.beds.filter((b) => !b.student_id).map((b) => ({ ...b, room: r })));

/** SCR-210, live: GET /hostels/{id}/residents, POST /hostels/allocations, …/transfer, …/vacate. */
export function HostelAllocation() {
  const { hostels, hostel, select } = useHostel();
  const residents = useApi<Resident[]>(hostel ? `${HOSTELS}/${hostel.id}/residents` : null);
  const rooms = useApi<Room[]>(hostel ? `${HOSTELS}/${hostel.id}/rooms` : null);
  const add = useAddDialog(210);
  const [moving, setMoving] = useState<Resident | null>(null);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = (residents.data ?? []).filter((r) => !search.trim() || `${r.student_name} ${r.admission_no} ${r.room_no}`.toLowerCase().includes(search.trim().toLowerCase()));
  const rows: Row[] = items.map((r) => [{ name: r.student_name, sub: r.admission_no }, r.section_label ?? "—", hostel?.name ?? "—", `Room ${r.room_no}`, `${r.room_no} / ${r.bed_label}`, date(r.since)]);
  const beds = freeBedsOf(rooms.data);
  const all = residents.data ?? [];
  const n = (v: number) => fig((hostels.loading && !hostels.data) || (residents.loading && !residents.data), v);
  const stats = [
    { label: "Residents", value: n(all.length), note: hostel ? `Allocated in ${hostel.name}` : "No hostel chosen" },
    { label: "Free beds", value: fig((hostels.loading && !hostels.data) || (rooms.loading && !rooms.data), beds.length), note: hostel ? `${pct(hostel.occupied, hostel.beds)} of ${hostel.beds} beds taken` : "—" },
    { label: "Out now", value: n(all.filter((r) => r.out_now).length), note: "On an outing or home leave" },
    { label: "New this month", value: n(all.filter((r) => r.since.slice(0, 7) === today().slice(0, 7)).length), note: "Allocated since the 1st" },
  ];
  const close = () => {
    setError(null);
    setStudent(null);
    if (moving) setMoving(null);
    else add.close();
  };
  const done = (msg: string) => {
    notify(msg);
    close();
    residents.reload();
    rooms.reload();
    hostels.reload();
  };

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      if (moving) {
        await api.post(`${HOSTELS}/allocations/${moving.allocation_id}/transfer`, { bed_id: Number(f.get("bed_id")), moved_on: formText(f, "on") });
        done(`${moving.student_name} moved.`);
      } else {
        if (!student) throw new Error("Choose a student.");
        await api.post(`${HOSTELS}/allocations`, { student_id: student.id, bed_id: Number(f.get("bed_id")), start_date: formText(f, "on") });
        done(`${student.full_name} allocated a bed.`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function vacate(r: Resident) {
    if (!(await ask(`${r.student_name} leaves the hostel today?`))) return;
    try {
      await api.post(`${HOSTELS}/allocations/${r.allocation_id}/vacate`, undefined, { end_date: today() });
      done(`${r.student_name} has vacated.`);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search student hostel allocation…" />
        {select}
      </div>
      <ErrorNote>{hostels.error ?? residents.error ?? (!add.open && !moving ? error : null)}</ErrorNote>
      {!hostel ? (
        <NoHostel loading={hostels.loading} />
      ) : (
        <Panel title="Allocation workspace" sub={`${hostel.occupied} of ${hostel.beds} beds taken · ${beds.length} free`} flush>
          <DataTable columns={["Student", "Class", "Hostel", "Room", "Bed", "From date"]} rows={rows} onView={(i) => setMoving(items[i])} empty={residents.loading ? "Loading residents…" : "No residents yet."} />
        </Panel>
      )}
      {(add.open && hostel) || moving ? (
        <Modal title={moving ? `${moving.student_name} · Room ${moving.room_no} / ${moving.bed_label}` : `Allocate a bed in ${hostel?.name}`} onClose={close}>
          <form onSubmit={save}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              {moving ? null : <StudentPicker value={student} onChange={setStudent} required />}
              <Field label={moving ? "Move to bed" : "Bed"} required>
                <select name="bed_id" required>
                  <option value="">{beds.length ? "Select a free bed" : "No free beds"}</option>
                  {beds.map((b: Bed & { room: Room }) => (
                    <option key={b.id} value={b.id}>
                      {`Room ${b.room.room_no} / ${b.label}`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={moving ? "Moved on" : "From date"}>
                {/* A move must fall after the stay began; someone placed today moves tomorrow at the earliest. */}
                <input type="date" name="on" defaultValue={moving && moving.since >= today() ? addDays(moving.since, 1) : today()} min={moving ? addDays(moving.since, 1) : undefined} />
              </Field>
            </div>
            {moving ? (
              <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn" onClick={() => vacate(moving)}>
                  Vacate bed
                </button>
              </div>
            ) : null}
            <ModalActions onClose={close} saving={saving} label={moving ? "Transfer" : "Allocate bed"} />
          </form>
        </Modal>
      ) : null}
    </>
  );
}

const SHIFTS = { day: "Day", night: "Night", weekend: "Weekend" } as const;

/** SCR-211, live: GET/POST /ops/warden-rota, DELETE /ops/warden-rota/{id}; hostels and their wardens from /hostels. */
export function WardenRota() {
  const [from, setFrom] = useState(today());
  const to = addDays(from, 13);
  const rota = useApi<Rota>("/api/v1/school/ops/warden-rota", { from, to });
  const hostels = useApi<Hostel[]>(HOSTELS);
  const staff = useApi<StaffOption[]>("/api/v1/school/directory/staff");
  const add = useAddDialog(211);
  const [hostelId, setHostelId] = useState("");
  const [viewing, setViewing] = useState<{ date: string; duty: Rota["days"][number]["duties"][number] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duties = (rota.data?.days ?? []).flatMap((d) => d.duties.map((duty) => ({ date: d.date, duty }))).filter((x) => !hostelId || String(x.duty.hostel_id) === hostelId);
  const uncovered = (rota.data?.uncovered ?? []).filter((u) => !hostelId || String(u.hostel_id) === hostelId);
  const n = (v: number) => fig(rota.loading && !rota.data, v);
  const stats = [
    { label: "Duties", value: n(duties.length), note: "Shifts on the rota, next 2 weeks" },
    { label: "Wardens", value: n(new Set(duties.map((x) => x.duty.user_id)).size), note: "Staff with a duty" },
    { label: "Uncovered nights", value: n(uncovered.length), note: "Hostel-nights with nobody" },
    { label: "No warden", value: fig(hostels.loading && !hostels.data, (hostels.data ?? []).filter((h) => !h.warden_user_id && (!hostelId || String(h.id) === hostelId)).length), note: "Hostels without a resident warden" },
  ];
  const rows: Row[] = duties.map(({ date: d, duty }) => [{ name: duty.warden_name, sub: duty.warden_phone ?? undefined }, duty.hostel_name, date(d), SHIFTS[duty.shift], duty.note ?? "—", "On duty"]);
  const close = () => {
    setError(null);
    if (viewing) setViewing(null);
    else add.close();
  };

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/v1/school/ops/warden-rota", { hostel_id: Number(f.get("hostel_id")), user_id: Number(f.get("user_id")), on_date: formText(f, "on_date"), shift: formText(f, "shift"), note: formText(f, "note") });
      notify("Duty added to the rota.");
      close();
      rota.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!viewing || !(await ask("Remove this duty from the rota?"))) return;
    try {
      await api.delete(`/api/v1/school/ops/warden-rota/${viewing.duty.duty_id}`);
      notify("Duty removed.");
      close();
      rota.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <select aria-label="Filter by hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
          <option value="">All hostels</option>
          {hostels.data?.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        <input type="date" aria-label="Rota from" value={from} onChange={(e) => setFrom(e.target.value || today())} />
      </div>
      <ErrorNote>{rota.error ?? hostels.error ?? (!add.open && !viewing ? error : null)}</ErrorNote>
      {uncovered.length ? (
        <div className="tip warn">
          <Icon name="bell" className="sm" />
          <span>{`${uncovered.length} hostel-night(s) have nobody on the rota in these two weeks: ${uncovered.slice(0, 6).map((u) => `${u.hostel_name} ${date(u.date)}`).join(", ")}${uncovered.length > 6 ? "…" : ""}`}</span>
        </div>
      ) : null}
      <Panel title="Warden rota" sub={`${date(from)} – ${date(to)} · resident wardens: ${(hostels.data ?? []).map((h) => `${h.name}: ${h.warden_name ? `${h.warden_name}${h.warden_phone ? ` (${h.warden_phone})` : ""}` : "none"}`).join(" · ") || "—"}`} flush>
        <DataTable columns={["Warden", "Hostel", "Date", "Shift", "Note", "Status"]} rows={rows} onView={(i) => setViewing(duties[i])} empty={rota.loading ? "Loading the rota…" : "Nobody is on the rota for these two weeks."} />
      </Panel>
      {add.open || viewing ? (
        <Modal title={viewing ? `${viewing.duty.warden_name} · ${date(viewing.date)}` : "Assign warden duty"} onClose={close}>
          {viewing ? (
            <>
              <ErrorNote>{error}</ErrorNote>
              <Kv rows={[["Hostel", viewing.duty.hostel_name], ["Phone", viewing.duty.warden_phone ?? "—"], ["Shift", SHIFTS[viewing.duty.shift]], ["Note", viewing.duty.note ?? "—"]]} />
              <div className="actions row">
                <button type="button" className="btn" onClick={remove}>
                  Remove duty
                </button>
                <button type="button" className="btn primary" onClick={close}>
                  Close
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={save}>
              <ErrorNote>{error}</ErrorNote>
              <div className="form-grid">
                <Field label="Hostel" required>
                  <select name="hostel_id" required defaultValue={hostelId}>
                    <option value="">Select hostel</option>
                    {hostels.data?.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Warden" required>
                  <select name="user_id" required>
                    <option value="">Select staff member</option>
                    {staff.data?.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {`${s.full_name} · ${label(s.role)}`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Date" required>
                  <input type="date" name="on_date" required defaultValue={today()} />
                </Field>
                <Field label="Shift" required>
                  <select name="shift" defaultValue="night">
                    {Object.entries(SHIFTS).map(([k, t]) => (
                      <option key={k} value={k}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Note" full>
                  <input name="note" />
                </Field>
              </div>
              <ModalActions onClose={close} saving={saving} label="Add to rota" />
            </form>
          )}
        </Modal>
      ) : null}
    </>
  );
}
