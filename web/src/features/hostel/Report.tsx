"use client";

/*
 * NEW-104, live: the hostel report. GET /hostels/report?month=YYYY-MM — for
 * each hostel the person sees (a warden: their own), beds filled room by
 * room, the month's morning and night roll calls, and outings.
 */

import { useState, type ReactNode } from "react";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { useApi } from "@/lib/useApi";
import { HOSTELS } from "./Setup";

type Session = { present: number; absent: number; on_leave: number; present_pct: number | null };
type HostelRow = {
  hostel_id: number; name: string; kind: string; beds: number; occupied: number; residents_in_month: number;
  rooms: { room_no: string; floor: string | null; beds: number; occupied: number }[];
  roll_call: Record<string, Session>;
  outings: { requested: number; taken: number; back_late: number; still_out: number; overdue_now: number };
};

const thisMonth = () => new Date().toISOString().slice(0, 7);

export function HostelReport() {
  const [month, setMonth] = useState(thisMonth());
  const r = useApi<{ month: string; hostels: HostelRow[] }>(`${HOSTELS}/report`, { month });
  const hs = r.data?.hostels ?? [];
  const beds = hs.reduce((t, h) => t + h.beds, 0);
  const used = hs.reduce((t, h) => t + h.occupied, 0);
  const night = hs.map((h) => h.roll_call.night).filter(Boolean) as Session[];
  const nPresent = night.reduce((t, s) => t + s.present, 0);
  const nMarked = night.reduce((t, s) => t + s.present + s.absent, 0);
  return (
    <>
      <div className="filterbar">
        <input type="month" aria-label="Month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>
      <ErrorNote>{r.error}</ErrorNote>
      {!r.data ? (
        <Loading what="Loading the report…" />
      ) : !hs.length ? (
        <Panel>
          <p className="muted">No hostel to report on. A warden sees the hostels they are named warden of.</p>
        </Panel>
      ) : (
        <>
          <StatStrip
            compact
            items={[
              { label: "Beds filled", value: `${used} / ${beds}`, note: beds ? `${Math.round((used / beds) * 100)}% today` : "No beds" },
              { label: "Night roll call", value: nMarked ? `${Math.round((nPresent / nMarked) * 100)}%` : "—", note: nMarked ? `${nMarked - nPresent} absences this month` : "Not marked this month" },
              { label: "Outings", value: String(hs.reduce((t, h) => t + h.outings.taken, 0)), note: `${hs.reduce((t, h) => t + h.outings.back_late, 0)} back late` },
              { label: "Out past their time", value: String(hs.reduce((t, h) => t + h.outings.overdue_now, 0)), note: "Right now" },
            ]}
          />
          {hs.map((h) => (
            <Panel key={h.hostel_id} title={h.name} sub={`${h.kind[0].toUpperCase()}${h.kind.slice(1)} · ${h.occupied} of ${h.beds} beds filled · ${h.residents_in_month} residents this month`}>
              <div className="fo-grid" style={{ marginTop: 0 }}>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Room</th>
                        <th>Floor</th>
                        <th className="num">Beds</th>
                        <th className="num">Filled</th>
                        <th>Use</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h.rooms.map((rm) => (
                        <tr key={rm.room_no}>
                          <td>{rm.room_no}</td>
                          <td>{rm.floor ?? "—"}</td>
                          <td className="num">{rm.beds}</td>
                          <td className="num">{rm.occupied}</td>
                          <td>
                            <div className="fo-bar">
                              <span style={{ width: `${rm.beds ? (rm.occupied / rm.beds) * 100 : 0}%` }} />
                            </div>
                          </td>
                        </tr>
                      ))}
                      {!h.rooms.length ? (
                        <tr>
                          <td colSpan={5} className="table-empty">No rooms yet.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                <dl className="bank-rec">
                  {(["morning", "night"] as const).map((s) => (
                    <Row key={s} k={`${s[0].toUpperCase()}${s.slice(1)} roll call`}>
                      {h.roll_call[s] ? `${h.roll_call[s].present_pct ?? "—"}% present · ${h.roll_call[s].absent} absent` : "Not marked"}
                    </Row>
                  ))}
                  <Row k="Outings asked for">{h.outings.requested}</Row>
                  <Row k="Taken">{h.outings.taken}</Row>
                  <Row k="Back late">{h.outings.back_late}</Row>
                  <Row k="Still out">{`${h.outings.still_out}${h.outings.overdue_now ? ` (${h.outings.overdue_now} past their time)` : ""}`}</Row>
                </dl>
              </div>
            </Panel>
          ))}
        </>
      )}
    </>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <>
      <dt>{k}</dt>
      <dd>{children}</dd>
    </>
  );
}
