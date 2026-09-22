"use client";

import { useCallback, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { Dialog, usePageAction } from "./planKit";
import { ROOM_KINDS, type Room } from "./planTypes";

import { ask } from "@/lib/dialog";
const base = "/api/v1/school/rooms";

/** SCR-107, live: GET /api/v1/school/rooms (kind); add, edit and delete with POST / PUT / DELETE. */
export function Rooms() {
  const role = useSession()?.user.role;
  const canManage = role === "school_admin";
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Room | "new" | null>(null);
  const list = useApi<Room[]>(base, { kind });

  usePageAction(
    "rooms:add",
    useCallback(() => setEditing("new"), []),
  );

  const q = search.trim().toLowerCase();
  const rooms = (list.data ?? []).filter(
    (r) =>
      (!status || (status === "active" ? r.is_active : !r.is_active)) &&
      (!q || [r.name, r.code, r.building ?? "", r.section_label ?? ""].some((v) => v.toLowerCase().includes(q))),
  );
  const live = (list.data ?? []).filter((r) => r.is_active);
  const n = (v: number) => (list.loading && !list.data ? (list.loading ? "…" : "—") : String(v));
  const stats = [
    { label: "Rooms", value: n(live.length), note: `${(list.data?.length ?? 0) - live.length} inactive` },
    { label: "Seats", value: n(live.reduce((s, r) => s + (r.capacity ?? 0), 0)), note: "total capacity" },
    { label: "Home rooms", value: n(live.filter((r) => r.section_id).length), note: "assigned to a section" },
    { label: "Free rooms", value: n(live.filter((r) => !r.section_id).length), note: "no section based here" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search classroom or room management…" aria-label="Search rooms" />
        </div>
        <select aria-label="Filter by kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>
          {ROOM_KINDS.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      {rooms.length === 0 ? (
        <section className="panel">
          <div className="panel-pad muted">{list.loading ? "Loading rooms…" : list.data?.length ? "No rooms match these filters." : "No rooms recorded yet."}</div>
        </section>
      ) : null}
      <div className="room-grid">
        {rooms.map((r) => (
          <article className="room-card" key={r.id}>
            <div className="spread">
              <h3>{r.name}</h3>
              <Icon name="building" />
            </div>
            <p>{[r.code, r.building, r.floor ? `Floor ${r.floor}` : null].filter(Boolean).join(" · ")}</p>
            <div className="spread">
              <Badge>{r.is_active ? label(r.kind) : "Inactive"}</Badge>
              <span className="small muted">{r.capacity ? `${r.capacity} seats` : ""}</span>
            </div>
            {r.section_label ? <p className="small muted">{`Home of ${r.section_label}`}</p> : null}
            <div style={{ height: "12px" }} />
            <button type="button" className="btn" onClick={() => setEditing(r)}>
              View room
            </button>
          </article>
        ))}
      </div>
      <RoomDialog
        open={editing !== null}
        room={editing === "new" ? null : editing}
        canManage={canManage}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          list.reload();
        }}
      />
    </>
  );
}

function RoomDialog({ open, room, canManage, onClose, onSaved }: { open: boolean; room: Room | null; canManage: boolean; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      notify(done);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const body = {
      name: text("name"),
      code: (text("code") ?? "").toUpperCase(),
      kind: text("kind") ?? "classroom",
      capacity: text("capacity") ? Number(text("capacity")) : null,
      building: text("building"),
      floor: text("floor"),
      notes: text("notes"),
      is_active: f.get("is_active") === "on",
      // Keep what this screen does not edit.
      branch_id: room?.branch_id ?? null,
      section_id: room?.section_id ?? null,
    };
    run(() => (room ? api.put(`${base}/${room.id}`, body) : api.post(base, body)), room ? "Room updated." : "Room added.");
  }

  return (
    <Dialog title={room ? room.name : "Add room"} open={open} onClose={() => { setError(null); onClose(); }}>
      <form onSubmit={submit}>
        <ErrorNote>{error}</ErrorNote>
        <fieldset disabled={!canManage || busy} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-grid">
            <label className="field">
              <span>
                Name<span className="req">*</span>
              </span>
              <input name="name" required defaultValue={room?.name} placeholder="e.g. Room 201" />
            </label>
            <label className="field">
              <span>
                Code<span className="req">*</span>
              </span>
              <input name="code" required defaultValue={room?.code} placeholder="e.g. R201" />
            </label>
            <label className="field">
              <span>Kind</span>
              <select name="kind" defaultValue={room?.kind ?? "classroom"}>
                {ROOM_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {label(k)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Seats</span>
              <input name="capacity" type="number" min={1} defaultValue={room?.capacity ?? ""} />
            </label>
            <label className="field">
              <span>Building</span>
              <input name="building" defaultValue={room?.building ?? ""} placeholder="e.g. North Block" />
            </label>
            <label className="field">
              <span>Floor</span>
              <input name="floor" defaultValue={room?.floor ?? ""} placeholder="e.g. 2" />
            </label>
            <label className="field full">
              <span>Notes</span>
              <textarea name="notes" defaultValue={room?.notes ?? ""} />
            </label>
            <label className="field full" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="is_active" defaultChecked={room?.is_active ?? true} />
              <span>In use (active)</span>
            </label>
          </div>
        </fieldset>
        {room?.branch_name || room?.section_label ? <p className="small muted">{[room.branch_name, room.section_label ? `Home room of ${room.section_label}` : null].filter(Boolean).join(" · ")}</p> : null}
        <div className="actions row" style={{ gap: 8, justifyContent: "flex-end" }}>
          {room && canManage ? (
            <button type="button" className="btn" disabled={busy} onClick={async () => (await ask(`Delete ${room.name}?`)) && run(() => api.delete(`${base}/${room.id}`), "Room deleted.")}>
              Delete
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
          {canManage ? (
            <button type="submit" className="btn primary" disabled={busy}>
              <Icon name="check" className="sm" />
              {busy ? "Saving…" : room ? "Save room" : "Add room"}
            </button>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
