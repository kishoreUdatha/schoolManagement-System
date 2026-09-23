"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, Modal, ModalActions, Tip, orNull, useNewFlag, type Lab, type StaffRow } from "./common";

import { ask } from "@/lib/dialog";
type Room = { id: number; name: string; code: string };
type Subject = { id: number; name: string };

/** SCR-242, live: GET/POST /labs, PUT/DELETE /labs/{id}. */
export function LabRegister() {
  const list = useApi<Lab[]>("/api/v1/school/labs");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<Lab | null>(null);
  const [adding, closeAdd] = useNewFlag();

  const s = search.trim().toLowerCase();
  const all = list.data ?? [];
  const shown = all.filter(
    (l) =>
      (!s || [l.name, l.code, l.room_name, l.subject_name, l.in_charge_name].some((v) => v?.toLowerCase().includes(s))) &&
      (status === "active" ? l.is_active : status === "inactive" ? !l.is_active : true),
  );
  const rows: Row[] = shown.map((l) => [
    { name: l.name, sub: [l.code, l.subject_name].filter(Boolean).join(" · ") },
    l.room_name ?? "Not set",
    l.in_charge_name ?? "Nobody",
    l.capacity !== null ? String(l.capacity) : "—",
    l.equipment ?? "Nothing written down",
    l.is_active ? "Active" : "Inactive",
  ]);
  const noRoom = all.filter((l) => !l.room_id).length;
  const noHead = all.filter((l) => !l.in_charge_user_id).length;
  const n = (v: number, ready: unknown) => (ready ? v.toLocaleString("en-IN") : "…");
  const stats = [
    { label: "Labs", value: n(all.filter((l) => l.is_active).length, list.data), note: list.data ? `Active, of ${all.length}` : "Active" },
    { label: "Upcoming bookings", value: n(all.reduce((s, l) => s + (l.upcoming_bookings ?? 0), 0), list.data), note: "Across all labs" },
    { label: "No room", value: n(noRoom, list.data), note: "Room not set" },
    { label: "No one in charge", value: n(noHead, list.data), note: "In-charge not named" },
  ];
  const done = () => {
    setEditing(null);
    list.reload();
  };

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lab register…" aria-label="Search labs" />
        </div>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      {all.length && (noRoom || noHead) ? <Tip warn>{`${noRoom} lab(s) without a room and ${noHead} without someone in charge.`}</Tip> : null}
      <Panel
        
        action={
          <button type="button" className="btn" data-columns="">
            <Icon name="grid" className="sm" />
            Columns
          </button>
        }
        flush
      >
        <DataTable
          columns={["Lab", "Room", "In charge", "Capacity", "Equipment", "Status"]}
          rows={rows}
          onView={(i) => setEditing(shown[i])}
          empty={list.loading ? "Loading labs…" : s || status ? "No labs match these filters." : undefined}
          emptyState={{
            title: "No labs yet",
            note: "A lab record holds its room, subject and in-charge, and is what bookings and equipment notes are kept against.",
            action: (
              <Link href="/inventory-labs/lab-register?new=1" className="btn primary" scroll={false}>
                <Icon name="plus" className="sm" />
                Add lab
              </Link>
            ),
          }}
        />
      </Panel>
      {adding ? <LabDialog existing={null} onClose={closeAdd} onSaved={() => (closeAdd(), list.reload())} /> : null}
      {editing ? <LabDialog existing={editing} onClose={() => setEditing(null)} onSaved={done} /> : null}
    </>
  );
}

function LabDialog({ existing, onClose, onSaved }: { existing: Lab | null; onClose: () => void; onSaved: () => void }) {
  const rooms = useApi<Room[]>("/api/v1/school/rooms");
  const subjects = useApi<Subject[]>("/api/v1/school/subjects");
  const staff = useApi<StaffRow[]>("/api/v1/school/directory/staff");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const num = (v: FormDataEntryValue | null) => (orNull(v) ? Number(v) : null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: String(f.get("name") ?? "").trim(),
      code: String(f.get("code") ?? "").trim().toUpperCase(),
      room_id: num(f.get("room_id")),
      subject_id: num(f.get("subject_id")),
      in_charge_user_id: num(f.get("in_charge_user_id")),
      capacity: num(f.get("capacity")),
      equipment: orNull(f.get("equipment")),
      safety_notes: orNull(f.get("safety_notes")),
      is_active: existing ? f.get("is_active") === "on" : true,
    };
    setSaving(true);
    setError(null);
    try {
      if (existing) await api.put(`/api/v1/school/labs/${existing.id}`, body);
      else await api.post("/api/v1/school/labs", body);
      notify(existing ? "Lab updated." : "Lab added.");
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!existing || !(await ask(`Delete ${existing.name}?`))) return;
    try {
      await api.delete(`/api/v1/school/labs/${existing.id}`);
      notify("Lab deleted.");
      onSaved();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <Modal title={existing ? `Edit ${existing.name}` : "Add lab"} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorNote>{error ?? rooms.error ?? staff.error}</ErrorNote>
        <div className="form-grid">
          <Field label="Lab name" required>
            <input name="name" required defaultValue={existing?.name} placeholder="Chemistry lab" />
          </Field>
          <Field label="Code" required>
            <input name="code" required defaultValue={existing?.code} placeholder="CHEM-1" />
          </Field>
          <Field label="Room">
            <select name="room_id" defaultValue={existing?.room_id ?? ""}>
              <option value="">{rooms.data?.length === 0 ? "No rooms set up yet" : "Not set"}</option>
              {rooms.data?.map((r) => (
                <option key={r.id} value={r.id}>
                  {`${r.name} (${r.code})`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Subject">
            <select name="subject_id" defaultValue={existing?.subject_id ?? ""}>
              <option value="">Not set</option>
              {subjects.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="In charge">
            <select name="in_charge_user_id" defaultValue={existing?.in_charge_user_id ?? ""}>
              <option value="">Nobody</option>
              {staff.data?.map((x) => (
                <option key={x.user_id} value={x.user_id}>
                  {x.full_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Capacity">
            <input name="capacity" type="number" min={1} defaultValue={existing?.capacity ?? ""} />
          </Field>
          <Field label="Equipment" full>
            <textarea name="equipment" rows={2} defaultValue={existing?.equipment ?? ""} placeholder="A note, not a stock list: counted consumables belong in the store" />
          </Field>
          <Field label="Safety notes" full>
            <textarea name="safety_notes" rows={2} defaultValue={existing?.safety_notes ?? ""} />
          </Field>
          {existing ? (
            <label className="field full row" style={{ gap: 8 }}>
              <input type="checkbox" name="is_active" defaultChecked={existing.is_active} />
              <span>Active</span>
            </label>
          ) : null}
        </div>
        {existing && (existing.upcoming_bookings ?? 0) === 0 ? (
          <button type="button" className="btn" style={{ marginTop: 16 }} onClick={remove}>
            Delete lab
          </button>
        ) : null}
        <ModalActions saving={saving} label={existing ? "Save changes" : "Add lab"} onCancel={onClose} />
      </form>
    </Modal>
  );
}
