"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { clock, ExamSelects, PaperSelect, useExamChoice, usePaperChoice } from "./common";
import type { Allocation, ExamRoom, Invigilators, SeatedStudent } from "./types";

import { ask } from "@/lib/dialog";
/**
 * SCR-142, live: GET /school/exam-ops/rooms, GET/POST/DELETE
 * /exam-ops/papers/{id}/allocation and POST …/allocation/move. Rooms fill in
 * the order they are ticked; the server refuses a set that cannot seat everyone.
 */
export function HallAllocation() {
  const c = useExamChoice();
  const pc = usePaperChoice(c.exam);
  const paperId = pc.paper?.id ?? null;
  const rooms = useApi<ExamRoom[]>("/api/v1/school/exam-ops/rooms");
  const loaded = useApi<Allocation>(paperId ? `/api/v1/school/exam-ops/papers/${paperId}/allocation` : null);
  const duty = useApi<Invigilators>(paperId ? `/api/v1/school/exam-ops/papers/${paperId}/invigilators` : null);
  const [alloc, setAlloc] = useState<Allocation | null>(null);
  const [chosen, setChosen] = useState<number[]>([]);
  const [roomId, setRoomId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAlloc(loaded.data && loaded.data.paper_id === paperId ? loaded.data : null);
  }, [loaded.data, paperId]);
  useEffect(() => {
    setChosen([]);
    setRoomId(null);
  }, [paperId]);

  const a = alloc;
  const room = a?.rooms.find((r) => r.room_id === roomId) ?? a?.rooms[0] ?? null;

  async function run(fn: () => Promise<Allocation>, done: string) {
    setBusy(true);
    setError(null);
    try {
      setAlloc(await fn());
      notify(done);
    } catch (err) {
      // The refusal names the shortfall, which is the whole use of it.
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    chosen.length
      ? run(() => api.post<Allocation>(`/api/v1/school/exam-ops/papers/${paperId}/allocation`, { room_ids: chosen }), "Seating saved.")
      : setError("Tick the rooms to seat this paper in, in the order they should fill.");
  const clear = async () => (await ask("Empty the seating plan for this paper?")) && run(() => api.delete<Allocation>(`/api/v1/school/exam-ops/papers/${paperId}/allocation`), "Seating cleared.");
  const move = (s: SeatedStudent, to: number) => run(() => api.post<Allocation>(`/api/v1/school/exam-ops/papers/${paperId}/allocation/move`, { student_id: s.student_id, room_id: to }), `${s.student_name} moved.`);
  const toggle = (id: number) => setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const stats = [
    { label: "Room capacity", value: room ? String(room.capacity) : "—", note: room?.room_name ?? "No room allocated" },
    { label: "Assigned", value: room ? String(room.seated) : "—", note: a ? `${a.seated} of ${a.candidates} seated in all` : "Choose a paper" },
    { label: "Available", value: room ? String(Math.max(room.capacity - room.seated, 0)) : "—", note: room?.over_capacity ? "Over capacity" : "Seats remaining" },
    { label: "Invigilators", value: room && duty.data ? String(duty.data.rooms.find((r) => r.room_id === room.room_id)?.staff.length ?? 0) : "—", note: a?.unplaced.length ? `${a.unplaced.length} candidates unplaced` : "Allocated to this room" },
  ];

  const seats = room ? Math.max(room.capacity, room.seated) : 0;
  const placed = [...(a?.rooms ?? [])];

  return (
    <>
      <div className="filterbar">
        <ExamSelects c={c} />
        <PaperSelect {...pc} />
        <select aria-label="Room" value={room?.room_id ?? ""} onChange={(e) => setRoomId(Number(e.target.value))} disabled={!a?.rooms.length}>
          {!a?.rooms.length ? <option value="">No rooms allocated</option> : null}
          {a?.rooms.map((r) => (
            <option key={r.room_id} value={r.room_id}>
              {`${r.room_name} · ${r.seated}/${r.capacity}`}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? c.error ?? loaded.error ?? rooms.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <div className="two-col">
        <div className="stack">
          <Panel title={room ? `${room.room_name} · Seating plan` : "Seating plan"} sub={a ? `${c.exam?.name ?? ""} · ${a.subject_name}${a.class_name ? ` · ${a.class_name}` : ""}` : "Choose a paper"}>
            {room ? (
              <>
                <div className="board-label">FRONT OF ROOM · INVIGILATOR</div>
                <div className="seats">
                  {Array.from({ length: seats }, (_, i) => {
                    const s = room.students[i];
                    return (
                      <span key={i} className={`seat ${s ? "" : "open"}`} title={s ? `${s.student_name} · ${s.admission_no}` : "Empty seat"}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="muted">{loaded.loading ? "Loading…" : "No room has been allocated for this paper yet. Tick rooms on the right and save."}</p>
            )}
          </Panel>
          {room?.students.length ? (
            <Panel title={`Seated in ${room.room_name}`} sub="Move a candidate to another allocated room" flush>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Seat</th>
                      <th>Student</th>
                      <th>Section</th>
                      <th className="right">Move to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {room.students.map((s, i) => (
                      <tr key={s.student_id}>
                        <td>{String(i + 1).padStart(2, "0")}</td>
                        <td>
                          <div className="person">
                            <div>
                              {s.student_name}
                              <small>{s.admission_no}</small>
                            </div>
                          </div>
                        </td>
                        <td>{s.section_name ?? "—"}</td>
                        <td className="right">
                          <select aria-label={`Move ${s.student_name}`} value="" disabled={busy} onChange={(e) => e.target.value && move(s, Number(e.target.value))}>
                            <option value="">Keep here</option>
                            {placed
                              .filter((r) => r.room_id !== room.room_id)
                              .map((r) => (
                                <option key={r.room_id} value={r.room_id}>
                                  {r.room_name}
                                </option>
                              ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : null}
        </div>
        <aside className="stack">
          <Panel title="Allocation details">
            <dl className="kv">
              <div>
                <dt>Exam</dt>
                <dd>{c.exam?.name ?? "—"}</dd>
              </div>
              <div>
                <dt>Class</dt>
                <dd>{a?.class_name ?? "—"}</dd>
              </div>
              <div>
                <dt>Room</dt>
                <dd>{room?.room_name ?? "—"}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{a ? date(a.exam_date) : "—"}</dd>
              </div>
              <div>
                <dt>Start time</dt>
                <dd>{clock(a?.start_time)}</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Rooms" sub="Tick in the order they should fill">
            {rooms.data?.length ? (
              <div className="checklist">
                {rooms.data.map((r) => {
                  const at = chosen.indexOf(r.id);
                  return (
                    <label className="check-item" key={r.id}>
                      <input type="checkbox" checked={at >= 0} onChange={() => toggle(r.id)} />
                      {`${at >= 0 ? `${at + 1}. ` : ""}${r.name} · seats ${r.capacity}${r.building ? ` · ${r.building}` : ""}`}
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="muted">{rooms.loading ? "Loading rooms…" : "No exam rooms are set up for the school."}</p>
            )}
            <div className="gap" />
            <div className="row">
              <button type="button" className="btn primary" onClick={save} disabled={busy || !paperId}>
                <Icon name="check" className="sm" />
                Save allocation
              </button>
              {a?.seated ? (
                <button type="button" className="btn" onClick={clear} disabled={busy}>
                  Clear
                </button>
              ) : null}
            </div>
          </Panel>
          {a?.unplaced.length ? (
            <Panel title="Unplaced candidates" sub={`${a.unplaced.length} without a seat`}>
              {a.unplaced.map((s) => (
                <div className="spread" key={s.student_id} style={{ padding: "6px 0" }}>
                  <span className="small">{`${s.student_name} · ${s.admission_no}`}</span>
                  <select aria-label={`Seat ${s.student_name}`} value="" disabled={busy || !placed.length} onChange={(e) => e.target.value && move(s, Number(e.target.value))}>
                    <option value="">Seat in…</option>
                    {placed.map((r) => (
                      <option key={r.room_id} value={r.room_id}>
                        {r.room_name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </Panel>
          ) : null}
          <Panel title="Legend">
            <span className="badge">Assigned</span> <span className="badge neutral">Available</span>
          </Panel>
        </aside>
      </div>
    </>
  );
}
