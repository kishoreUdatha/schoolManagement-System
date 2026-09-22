"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { AddNote, NotesPanel, PICK_PARENT, useParent, useParentNotes } from "./ParentShell";
import type { PtmSession, PtmSessionDetail, PtmSlot } from "./types";

type Meeting = { session: PtmSession; teacher: string; slot: PtmSlot };

const hm = (t: string) => t.slice(0, 5);

/**
 * SCR-077, live: the parent's parent-teacher meetings. GET /api/v1/school/ptm
 * lists the sessions; GET /ptm/{id} gives each teacher's slots, kept where the
 * booked student is one of this parent's children (GET /parents/{id}).
 * Messages are teacher-to-parent only and have no school-side endpoint.
 * Office notes: GET/POST/DELETE /parents/{id}/notes.
 */
export function ParentInteractions() {
  const { id, data: p, error, loading } = useParent();
  const sessions = useApi<PtmSession[]>(id ? "/api/v1/school/ptm" : null);
  const notes = useParentNotes(id);
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const childKey = p?.children.map((c) => c.student_id).join(",");
  useEffect(() => {
    if (!p || !sessions.data) return;
    const kids = new Set(p.children.map((c) => c.student_id));
    let live = true;
    // Most recent sessions first; a family's history rarely needs more than the last few dozen.
    const recent = [...sessions.data].sort((a, b) => b.meeting_date.localeCompare(a.meeting_date)).slice(0, 30);
    Promise.all(recent.map((s) => api.get<PtmSessionDetail>(`/api/v1/school/ptm/${s.id}`)))
      .then((details) => {
        if (!live) return;
        const out: Meeting[] = [];
        for (const d of details)
          for (const t of d.teachers) for (const slot of t.slots) if (slot.student_id && kids.has(slot.student_id)) out.push({ session: d, teacher: t.teacher_name, slot });
        setMeetings(out);
      })
      .catch((e) => live && setFailed(errorText(e)));
    return () => {
      live = false;
    };
    // childKey and the sessions list capture the inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childKey, sessions.data]);

  if (!id) return <PickFirst {...PICK_PARENT} />;
  if (loading && !p) return <Loading what="Loading the parent…" />;
  if (!p) return <ErrorNote>{error ?? "Parent not found."}</ErrorNote>;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (sessions.data ?? []).filter((s) => s.is_published && s.meeting_date >= today).sort((a, b) => a.meeting_date.localeCompare(b.meeting_date));
  const first = p.children[0];
  const num = (v: number) => (meetings ? String(v) : "…");
  const held = (s: PtmSlot["status"]) => (meetings ?? []).filter((m) => m.slot.status === s).length;
  const stats = [
    { label: "Meetings", value: num(meetings?.length ?? 0), note: "Booked for their children" },
    { label: "Met", value: num(held("done")), note: "Held with a teacher" },
    { label: "Missed", value: num(held("no_show")), note: "Parent did not come" },
    { label: "Upcoming", value: sessions.data ? String(upcoming.length) : "…", note: upcoming.length ? `Next on ${date(upcoming[0].meeting_date)}` : "No school meeting ahead" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="two-col">
        <div className="stack">
          <ErrorNote>{failed ?? sessions.error}</ErrorNote>
          <Panel title="Activity history" sub={`Parent-teacher meetings booked for ${p.full_name}’s children`}>
            {meetings === null ? (
              <p className="muted">Loading…</p>
            ) : meetings.length ? (
              meetings.map((m) => (
                <div className="timeline-item" key={`${m.session.id}-${m.slot.id}`}>
                  <span className="timeline-dot">
                    <Icon name={m.slot.status === "done" ? "check" : m.slot.status === "no_show" ? "bell" : "calendar"} />
                  </span>
                  <div>
                    <h4>{`${m.session.title} · ${label(m.slot.status)}`}</h4>
                    <p>
                      {`${m.teacher} · ${m.slot.student_name ?? "—"} · ${date(m.session.meeting_date)}, ${hm(m.slot.start_time)}`}
                      {m.slot.teacher_notes ? ` · ${m.slot.teacher_notes}` : ""}
                    </p>
                  </div>
                  <time>{date(m.session.meeting_date)}</time>
                </div>
              ))
            ) : (
              <p className="muted">No parent-teacher meetings booked for these children yet.</p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Record information">
            <dl className="kv">
              <div>
                <dt>Student</dt>
                <dd>{p.children.map((c) => c.full_name).join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>Class</dt>
                <dd>{[...new Set(p.children.map((c) => c.section_label ?? "—"))].join(", ") || "—"}</dd>
              </div>
              <div>
                <dt>Meetings</dt>
                <dd>{meetings ? String(meetings.length) : "…"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{p.is_active ? "Active" : "Inactive"}</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Next action">
            <p className="muted small">
              {upcoming.length
                ? `Next meeting: ${upcoming[0].title} on ${date(upcoming[0].meeting_date)}, ${hm(upcoming[0].start_time)} (${upcoming[0].scope_label}).`
                : "No published parent-teacher meeting is coming up."}
            </p>
            <div className="gap" />
            <div className="actions">
              <AddNote id={String(p.user_id)} onAdded={notes.reload} />
              {first ? (
                <Link href={`${routeOf(57)}?id=${first.student_id}`} className="btn">
                  <Icon name="arrow" className="sm" />
                  {`Open ${first.full_name.split(/\s+/)[0]}’s profile`}
                </Link>
              ) : null}
            </div>
          </Panel>
          <NotesPanel id={String(p.user_id)} notes={notes.data} loading={notes.loading} onChange={notes.reload} />
        </aside>
      </div>
    </>
  );
}
