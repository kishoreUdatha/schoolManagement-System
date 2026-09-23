"use client";

import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { clock, ExamSelects, PaperSelect, useExamChoice, usePaperChoice } from "./common";
import type { AvailableStaff, DutyRoster, Invigilators } from "./types";

import { ask } from "@/lib/dialog";
/**
 * SCR-143, live: GET /school/exam-ops/{id}/duty-roster for the whole exam;
 * per paper GET/POST …/papers/{id}/invigilators, GET …/invigilators/available
 * and DELETE …/invigilators/{invigilation_id}. Double-booking is refused by
 * the server, which names the clash.
 */
export function Invigilation() {
  const c = useExamChoice();
  const pc = usePaperChoice(c.exam);
  const paperId = pc.paper?.id ?? null;
  const roster = useApi<DutyRoster>(c.examId ? `/api/v1/school/exam-ops/${c.examId}/duty-roster` : null);
  const duty = useApi<Invigilators>(paperId ? `/api/v1/school/exam-ops/papers/${paperId}/invigilators` : null);
  const staff = useApi<AvailableStaff[]>(paperId ? `/api/v1/school/exam-ops/papers/${paperId}/invigilators/available` : null);
  const [search, setSearch] = useState("");
  const [room, setRoom] = useState("");
  const [roomId, setRoomId] = useState("");
  const [userId, setUserId] = useState("");
  const [chief, setChief] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const duties = useMemo(
    () =>
      (roster.data?.staff ?? [])
        .flatMap((p) => p.duties.map((d) => ({ ...d, name: p.name })))
        .sort((a, b) => `${a.exam_date}${a.start_time}`.localeCompare(`${b.exam_date}${b.start_time}`)),
    [roster.data],
  );
  const rooms = useMemo(() => Array.from(new Set(duties.map((d) => d.room_name))).sort(), [duties]);
  const shown = duties.filter((d) => (!room || d.room_name === room) && (!search || `${d.name} ${d.subject_name}`.toLowerCase().includes(search.trim().toLowerCase())));
  const rows: Row[] = shown.map((d) => [
    date(d.exam_date),
    clock(d.start_time),
    d.room_name,
    `${d.subject_name}${d.class_name ? ` · ${d.class_name}` : ""}`,
    d.name,
    d.is_chief ? "Chief invigilator" : "Assigned",
  ]);

  const paperRooms = [...(duty.data?.rooms ?? [])];
  const reloadAll = () => {
    duty.reload();
    staff.reload();
    roster.reload();
  };

  async function assign() {
    if (!roomId || !userId) {
      setError("Choose a room and a member of staff.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/exam-ops/papers/${paperId}/invigilators`, { room_id: Number(roomId), user_id: Number(userId), is_chief: chief });
      notify("Invigilator assigned.");
      setUserId("");
      setChief(false);
      reloadAll();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function unassign(id: number, name: string) {
    if (!(await ask(`Take ${name} off this duty?`))) return;
    setBusy(true);
    setError(null);
    try {
      await api.delete(`/api/v1/school/exam-ops/papers/${paperId}/invigilators/${id}`);
      notify("Duty removed.");
      reloadAll();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const unwatched = duty.data?.unwatched ?? [];
  // The exam's roster, and the rooms of the paper chosen below.
  const n = (v: number) => (!c.examId ? "—" : !roster.data ? (roster.error ? "—" : "…") : String(v));
  const stats = [
    { label: "Duties", value: n(roster.data?.total_duties ?? 0), note: "in this exam" },
    { label: "Staff on duty", value: n(roster.data?.staff.length ?? 0), note: "invigilators" },
    { label: "Papers covered", value: n(new Set(duties.map((d) => d.paper_id)).size), note: `of ${pc.papers.length} papers` },
    { label: "Unwatched rooms", value: !paperId ? "—" : !duty.data ? (duty.loading ? "…" : "—") : String(unwatched.length), note: pc.paper ? "for the chosen paper" : "choose a paper" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search invigilator or subject…" aria-label="Search records" />
        </div>
        <ExamSelects c={c} />
        <select aria-label="Filter room" value={room} onChange={(e) => setRoom(e.target.value)}>
          <option value="">All rooms</option>
          {rooms.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? c.error ?? roster.error ?? duty.error}</ErrorNote>
      <Panel title="Assign invigilator" sub={pc.paper ? `${pc.paper.subject_name ?? ""} · ${pc.paper.class_name ?? ""} · ${date(pc.paper.exam_date)}` : "Choose a paper"} action={<PaperSelect {...pc} />}>
        {unwatched.length ? (
          <div className="tip warn" style={{ marginBottom: 14 }}>
            <Icon name="bell" className="sm" />
            <span>{`No one is watching: ${unwatched.map((r) => `${r.room_name} (${r.seated} seated)`).join(", ")}.`}</span>
          </div>
        ) : null}
        {paperRooms.length ? (
          <>
            <div className="form-grid">
              <label className="field">
                <span>Room</span>
                <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                  <option value="">Select room</option>
                  {paperRooms.map((r) => (
                    <option key={r.room_id} value={r.room_id}>
                      {`${r.room_name} · ${r.seated} seated · ${r.staff.length} on duty`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Staff member</span>
                <select value={userId} onChange={(e) => setUserId(e.target.value)}>
                  <option value="">{staff.loading ? "Loading staff…" : "Select staff"}</option>
                  {staff.data?.map((s) => (
                    <option key={s.user_id} value={s.user_id} disabled={!s.available || s.assigned_here}>
                      {`${s.name} · ${label(s.role)}${s.assigned_here ? " — already on this paper" : s.clash ? ` — busy: ${s.clash}` : ""}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Role</span>
                <span className="row">
                  <input type="checkbox" checked={chief} onChange={(e) => setChief(e.target.checked)} /> Chief invigilator
                </span>
              </label>
            </div>
            <div className="gap" />
            <button type="button" className="btn primary" onClick={assign} disabled={busy}>
              <Icon name="check" className="sm" />
              Assign invigilator
            </button>
            <div className="gap" />
            {paperRooms.map((r) =>
              r.staff.map((s) => (
                <div className="spread" key={s.invigilation_id} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <span className="small">{`${r.room_name} · ${s.name}${s.is_chief ? " (chief)" : ""}`}</span>
                  <button type="button" className="btn" disabled={busy} onClick={() => unassign(s.invigilation_id, s.name)}>
                    Remove
                  </button>
                </div>
              )),
            )}
          </>
        ) : (
          <p className="muted">{duty.loading ? "Loading…" : pc.paper ? "Seat this paper in rooms first (Hall / Room Allocation); invigilators are assigned per room." : "This exam has no papers yet."}</p>
        )}
      </Panel>
      <div className="gap" />
      <Panel title="Duty roster" sub={roster.data ? `${roster.data.total_duties} duties across ${roster.data.staff.length} staff` : "Selected exam"} flush>
        <DataTable
          columns={["Date", "Session", "Room", "Exam", "Invigilator", "Status"]}
          rows={rows}
          rowAction={false}
          selectable={false}
          empty={roster.loading ? "Loading duties…" : undefined}
          emptyState={{
            title: "No invigilation duties yet",
            note: "Invigilators are assigned per room, once a paper has been seated in Hall / Room Allocation.",
          }}
        />
      </Panel>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>A member of staff cannot watch two rooms at once; the server refuses a clash and names it.</span>
      </div>
    </>
  );
}
