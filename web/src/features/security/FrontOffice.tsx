"use client";

/*
 * The front office's own registers:
 *   LateArrivals (NEW-105)  POST/GET /front-desk/late-arrivals — a latecomer marked late, the family told
 *   PostRegister (NEW-106)  GET/POST /front-desk/post, POST /post/{id}/handed — letters and parcels in and out
 */

import { useState, type FormEvent } from "react";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { askText } from "@/lib/dialog";
import { dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { StudentPicker, type PickedStudent } from "@/features/transport/kit";
import type { Host } from "./types";

const FD = "/api/v1/school/front-desk";
const nowHHMM = () => new Date().toTimeString().slice(0, 5);
const hhmm = (t: string | null) => {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

// ---------- late arrivals ----------

type Late = { student_id: number; student_name: string; admission_no: string; section_label: string | null; arrived_at: string | null; remark: string | null; recorded_by_name: string | null; times_in_window: number };

export function LateArrivals() {
  const list = useApi<Late[]>(`${FD}/late-arrivals`);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [at, setAt] = useState(nowHHMM());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = list.data ?? [];

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!student) return setError("Choose the student.");
    setBusy(true);
    setError(null);
    try {
      await api.post(`${FD}/late-arrivals`, { student_id: student.id, arrived_at: at, reason: reason.trim() || null });
      notify(`${student.full_name} marked late; the family has been told.`);
      setStudent(null);
      setReason("");
      setAt(nowHHMM());
      list.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <StatStrip
        compact
        items={[
          { label: "Late today", value: list.data ? String(rows.length) : "…", note: "Recorded at the gate or in class" },
          { label: "Latest", value: rows[0]?.arrived_at ? hhmm(rows[0].arrived_at) : "—", note: rows[0]?.student_name ?? "Nobody yet" },
        ]}
      />
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <Panel title="A child comes in late" sub="They are marked late on today's register and their family is told">
        <form className="filterbar" onSubmit={save} style={{ alignItems: "flex-end" }}>
          <div style={{ minWidth: 280, flex: 1 }}>
            <StudentPicker value={student} onChange={setStudent} required />
          </div>
          <label className="field">
            <span>Arrived</span>
            <input type="time" value={at} onChange={(e) => setAt(e.target.value)} required />
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Reason (optional)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Missed the bus, doctor's visit" />
          </label>
          <button type="submit" className="btn primary" disabled={busy || !student}>
            {busy ? "Saving…" : "Mark late"}
          </button>
        </form>
      </Panel>
      <Panel title="Late today" flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>Arrived</th>
                <th>Reason</th>
                <th>Recorded by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.student_id}>
                  <td>
                    {r.student_name}
                    <small className="muted" style={{ display: "block" }}>{r.admission_no}</small>
                  </td>
                  <td>{r.section_label ?? "—"}</td>
                  <td>{hhmm(r.arrived_at)}</td>
                  <td className="wrap">{r.remark ?? "—"}</td>
                  <td>{r.recorded_by_name ?? "Class register"}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={5} className="table-empty">{list.loading ? "Loading…" : "Nobody late today."}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

// ---------- post register ----------

type Post = { id: number; direction: "in" | "out"; kind: string; party: string; for_name: string | null; courier: string | null; tracking_no: string | null; note: string | null; logged_at: string; handed_at: string | null; handed_to: string | null };
const KIND: Record<string, string> = { letter: "Letter", parcel: "Parcel", document: "Document" };

export function PostRegister() {
  const [show, setShow] = useState<"open" | "in" | "out" | "all">("open");
  const list = useApi<Post[]>(`${FD}/post`, { open_only: show === "open" || undefined, direction: show === "in" || show === "out" ? show : undefined });
  const hosts = useApi<Host[]>(`${FD}/hosts`);
  const [dir, setDir] = useState<"in" | "out">("in");
  const [kind, setKind] = useState("letter");
  const [party, setParty] = useState("");
  const [forUser, setForUser] = useState("");
  const [forText, setForText] = useState("");
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = list.data ?? [];

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`${FD}/post`, {
        direction: dir, kind, party: party.trim(), for_user_id: forUser ? Number(forUser) : null, for_text: forUser ? null : forText.trim() || null,
        courier: courier.trim() || null, tracking_no: tracking.trim() || null,
      });
      notify(dir === "in" && forUser ? "Logged. They have been told it is waiting at reception." : "Logged.");
      setParty("");
      setForUser("");
      setForText("");
      setCourier("");
      setTracking("");
      list.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function handed(p: Post) {
    let to: string | null = "";
    if (p.direction === "in") {
      to = await askText(`Who collected it? (${KIND[p.kind] ?? "Post"} from ${p.party})`, { placeholder: p.for_name ?? "Name", required: true });
      if (!to) return;
    }
    try {
      await api.post(`${FD}/post/${p.id}/handed`, { to_name: to || null });
      notify(p.direction === "in" ? "Marked collected." : "Marked sent.");
      list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <Panel title="Log post" sub="Letters, parcels and documents coming in or going out">
        <form onSubmit={add}>
          <div className="filterbar" style={{ alignItems: "flex-end", flexWrap: "wrap" }}>
            <label className="field">
              <span>In or out</span>
              <select value={dir} onChange={(e) => setDir(e.target.value as "in" | "out")}>
                <option value="in">Received</option>
                <option value="out">Sent</option>
              </select>
            </label>
            <label className="field">
              <span>What</span>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="letter">Letter</option>
                <option value="parcel">Parcel</option>
                <option value="document">Document</option>
              </select>
            </label>
            <label className="field" style={{ flex: 1, minWidth: 180 }}>
              <span>{dir === "in" ? "From" : "To"}</span>
              <input value={party} onChange={(e) => setParty(e.target.value)} maxLength={160} required placeholder={dir === "in" ? "e.g. CBSE regional office" : "e.g. District education office"} />
            </label>
            <label className="field">
              <span>{dir === "in" ? "For (staff)" : "Sent by (staff)"}</span>
              <select value={forUser} onChange={(e) => setForUser(e.target.value)}>
                <option value="">— Someone else —</option>
                {(hosts.data ?? []).map((h) => (
                  <option key={h.user_id} value={h.user_id}>
                    {h.full_name}
                  </option>
                ))}
              </select>
            </label>
            {!forUser ? (
              <label className="field">
                <span>{dir === "in" ? "For" : "Sent by"}</span>
                <input value={forText} onChange={(e) => setForText(e.target.value)} maxLength={160} placeholder="Office, a student…" />
              </label>
            ) : null}
            <label className="field">
              <span>Courier</span>
              <input value={courier} onChange={(e) => setCourier(e.target.value)} maxLength={80} placeholder="India Post, Blue Dart…" />
            </label>
            <label className="field">
              <span>Tracking no.</span>
              <input value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={80} />
            </label>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Log it"}
            </button>
          </div>
        </form>
      </Panel>
      <Panel
        title="Register"
        flush
        action={
          <select aria-label="Show" value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
            <option value="open">Waiting (not collected / not sent)</option>
            <option value="in">Received</option>
            <option value="out">Sent</option>
            <option value="all">Everything</option>
          </select>
        }
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Logged</th>
                <th>What</th>
                <th>From / to</th>
                <th>For</th>
                <th>Courier</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>{dateTime(p.logged_at)}</td>
                  <td>{`${p.direction === "in" ? "In" : "Out"} · ${KIND[p.kind] ?? p.kind}`}</td>
                  <td className="wrap">{p.party}</td>
                  <td>{p.for_name ?? "—"}</td>
                  <td className="wrap">{[p.courier, p.tracking_no].filter(Boolean).join(" · ") || "—"}</td>
                  <td>
                    {p.handed_at ? (
                      <small>{`${p.direction === "in" ? "Collected" : "Sent"} ${dateTime(p.handed_at)}${p.handed_to ? ` by ${p.handed_to}` : ""}`}</small>
                    ) : (
                      <button type="button" className="btn" onClick={() => handed(p)}>
                        {p.direction === "in" ? "Collected" : "Sent"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="table-empty">{list.loading ? "Loading…" : show === "open" ? "Nothing waiting." : "Nothing logged."}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
