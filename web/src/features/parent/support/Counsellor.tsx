"use client";

/*
 * PM-104 · Talk to the counsellor, and the student app's SM-017. A parent
 * (for the child in the bar) or a student (for themselves) asks to see the
 * school counsellor and follows the request: open, appointment booked, or
 * closed. What is said in sessions is never shown here.
 *   parent:  GET/POST /parent/me/children/{id}/counselling-requests
 *   student: GET/POST /student/counselling-requests
 */

import { useState, type FormEvent } from "react";
import { api, errorText } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading, useChildPath } from "./pm";

type Request = { id: number; asked_on: string; about: string; status: "open" | "booked" | "closed"; appointment_on: string | null; appointment_at: string | null };

const day = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const clock = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export function ParentCounsellor() {
  return (
    <ChildGate>
      <ParentForChild />
    </ChildGate>
  );
}

function ParentForChild() {
  const base = useChildPath("/counselling-requests");
  return base ? <CounsellorRequests path={base} intro="Ask for your child to meet the school counsellor. Say a little about what is worrying you; the counsellor will book a time." /> : <PmLoading />;
}

export function StudentCounsellor() {
  return <CounsellorRequests path="/api/v1/student/counselling-requests" intro="You can ask to talk to the school counsellor about anything: studies, friends, home, how you feel. Your parents aren't told that you asked." />;
}

function CounsellorRequests({ path, intro }: { path: string; intro: string }) {
  const list = useApi<Request[]>(path);
  const [about, setAbout] = useState("");
  const [times, setTimes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api.post(path, { about: about.trim(), preferred_times: times.trim() || null });
      setAbout("");
      setTimes("");
      setSent(true);
      list.reload();
    } catch (x) {
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  }

  const open = (list.data ?? []).filter((r) => r.status !== "closed");
  const past = (list.data ?? []).filter((r) => r.status === "closed");
  return (
    <>
      <PmError>{err || list.error}</PmError>
      {list.loading && !list.data ? <PmLoading /> : null}
      {open.map((r) => (
        <div key={r.id} className="panel soft">
          <span className="eyebrow">{r.status === "booked" ? "APPOINTMENT BOOKED" : "WAITING FOR A TIME"}</span>
          {r.status === "booked" && r.appointment_on ? <h3>{`${day(r.appointment_on)}${r.appointment_at ? ` · ${clock(r.appointment_at)}` : ""}`}</h3> : null}
          <p>{r.about}</p>
          <p className="micro">{`Asked on ${day(r.asked_on)}`}</p>
        </div>
      ))}
      {sent ? <div className="panel soft"><p>Sent. The counsellor will book a time and it will show here.</p></div> : null}
      <form className="panel" onSubmit={send}>
        <p>{intro}</p>
        <label className="field">
          What would you like to talk about?
          <textarea rows={4} value={about} onChange={(e) => setAbout(e.target.value)} required minLength={5} maxLength={2000} />
        </label>
        <label className="field">
          Good times (optional)
          <input value={times} onChange={(e) => setTimes(e.target.value)} maxLength={200} placeholder="e.g. after lunch, Tuesdays" />
        </label>
        <button className="action" type="submit" disabled={busy || about.trim().length < 5}>
          {busy ? "Sending…" : "Ask for a meeting"}
        </button>
      </form>
      {past.length ? <h3 className="section-head">Earlier</h3> : null}
      {past.map((r) => (
        <div key={r.id} className="item">
          <span>
            <strong>{r.about.slice(0, 80)}</strong>
            <small>{`Asked on ${day(r.asked_on)}`}</small>
          </span>
          <span className="value good">Closed</span>
        </div>
      ))}
      {!list.loading && !(list.data ?? []).length && !sent ? <PmEmpty title="No requests yet">Your requests to the counsellor will show here.</PmEmpty> : null}
    </>
  );
}
