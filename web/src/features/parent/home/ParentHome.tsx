"use client";

import { useRouter } from "next/navigation";
import { MenuSections, QUICK_ACCESS, TileGrid } from "@/components/parent/ParentMenu";
import { initialsOf, useParent, type Child } from "@/components/parent/ParentShell";
import { money } from "@/lib/format";
import { parentRoute } from "@/lib/parentScreens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import type { Homework } from "../learning/types";
import { BRANDING_PATH, Chevron, childPath, ChildScoped, clock, dueLabel, PmError, shortDate, todayIso, type Branding } from "./parts";
import type { AttendanceDay, ChildTransport, FeeRow, ParentPtm, StudentProfile } from "./types";

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** PM-006. The selected child's day: attendance, homework due, fees, transport and PTM. */
export function ParentHome() {
  return <ChildScoped render={(childId, child) => <HomeFor childId={childId} child={child} />} />;
}

function HomeFor({ childId, child }: { childId: number; child: Child }) {
  const { go } = useParent();
  const router = useRouter();
  const me = useSession()?.user;
  const profile = useApi<StudentProfile>(childPath(childId, "/profile"));
  const homework = useApi<Homework[]>(childPath(childId, "/homework"));
  const fees = useApi<FeeRow[]>(childPath(childId, "/fees"));
  const transport = useApi<ChildTransport | null>(childPath(childId, "/transport"));
  const ptm = useApi<ParentPtm[]>("/api/v1/parent/me/ptm");
  const school = useApi<Branding>(BRANDING_PATH);
  const todayMark = useApi<AttendanceDay>(childPath(childId, "/attendance/day"), { date: todayIso() });

  const now = new Date();
  const first = child.full_name.split(/\s+/)[0];
  const att = profile.data?.attendance;
  const pctValue = att?.attendance_percent ?? child.attendance_percent;

  const due = (homework.data ?? []).filter((h) => !h.is_past_due && !h.is_closed).sort((a, b) => a.due_date.localeCompare(b.due_date));
  const pending = Number(child.fees_pending_amount ?? 0);
  const nextFee = (fees.data ?? []).filter((f) => Number(f.amount_outstanding) > 0).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const today = todayIso();
  const meeting = (ptm.data ?? [])
    .filter((p) => p.is_published && p.booking_open && p.meeting_date >= today && p.eligible_children.includes(childId))
    .sort((a, b) => a.meeting_date.localeCompare(b.meeting_date))[0];
  const bus = transport.data;

  const hwIcon = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 3h10l5 5v13H5z" />
      <path d="M15 3v6h5" className="cut" />
      <path d="M8 12h8M8 16h6" className="cut" />
    </svg>
  );
  const peopleIcon = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="9" cy="7" r="3" />
      <circle cx="17" cy="8" r="2.5" opacity=".55" />
      <path d="M3 20v-4c0-4 12-4 12 0v4zM16 13c3-1 6 1 6 4v3h-5z" />
    </svg>
  );
  const calendarIcon = (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="17" rx="3" />
      <path d="M3 10h18M8 2v6M16 2v6" className="cut" />
      <rect x="7" y="13" width="4" height="4" rx="1" className="cutfill" />
    </svg>
  );

  return (
    <>
      <div className="v-greeting">
        <p>
          {`${greeting()}${me ? `, ${me.full_name.split(/\s+/)[0]}` : ""} `}
          <span>{`${DAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`}</span>
        </p>
        <h1>{`${first}’s school day`}</h1>
      </div>
      <PmError>{profile.error}</PmError>
      <section className="identity-card">
        <div className="identity-top">
          <button className="identity-person" onClick={() => go(5)}>
            <span className="student-photo initials">{initialsOf(child.full_name)}</span>
            <span>
              <b className="child-name">{child.full_name}</b>
              <small>{child.section_label ?? ""}</small>
              {school.data ? <small>{school.data.name}</small> : null}
            </span>
            <span className="chevron">⌄</span>
          </button>
          <TodayStatus day={todayMark.data} />
        </div>
        <div className="identity-stats">
          <button onClick={() => go(9)}>
            <span>
              <small>Attendance</small>
              <b>
                {pctValue === null || pctValue === undefined ? "—" : Math.round(pctValue)}
                <span>%</span>
              </b>
              <small>{att ? `${att.days_present} of ${att.days_marked} marked days` : profile.loading ? "Loading…" : "Not marked yet"}</small>
            </span>
            <span className="v-icon white mini">{peopleIcon}</span>
          </button>
          <button onClick={() => go(14)}>
            <span>
              <small>Homework</small>
              <b>
                {homework.data ? `${due.length} ` : "— "}
                <span>due</span>
              </b>
              <small>{due[0] ? dueLabel(due[0].due_date) : homework.loading ? "Loading…" : "Nothing due"}</small>
            </span>
            <span className="v-icon white mini">{hwIcon}</span>
          </button>
        </div>
      </section>
      <section className="tile-card">
        <h3>Quick access</h3>
        <TileGrid tiles={QUICK_ACCESS} onPick={go} />
      </section>
      <div className="section-head">
        <h3>Needs your attention</h3>
        <button className="quiet-link" onClick={() => go(7)}>
          View all
        </button>
      </div>
      <div className="row-group attention-group">
        {due.slice(0, 2).map((h) => (
          <button key={h.id} className="v-row" onClick={() => router.push(`${parentRoute(15)}?id=${h.id}`)}>
            <span className="v-icon purple">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="4" y="2" width="16" height="20" rx="3" />
                <path d="M7 6h10v4H7z" className="cutfill" />
                <path d="M8 13v5M5.5 15.5h5M14 14h3M14 17h3" className="cut" />
              </svg>
            </span>
            <span className="v-row-copy">
              <strong>{h.title}</strong>
              <small>{`${h.subject_name ?? "Homework"} · ${dueLabel(h.due_date)}`}</small>
            </span>
            <span className="v-row-value" />
            <Chevron />
          </button>
        ))}
        {pending > 0 ? (
          <button className="v-row" onClick={() => go(23)}>
            <span className="v-icon amber">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 2h14v21l-3-2-4 2-4-2-3 2z" />
                <path d="M8 7h8M8 11h8M8 15h4" className="cut" />
              </svg>
            </span>
            <span className="v-row-copy">
              <strong>Fees pending</strong>
              <small>{nextFee ? `${nextFee.is_overdue ? "Overdue since" : "Next due"} ${shortDate(nextFee.due_date)}` : "Outstanding balance"}</small>
            </span>
            <span className="v-row-value">{money(pending)}</span>
            <Chevron />
          </button>
        ) : null}
        {homework.data && due.length === 0 && pending <= 0 ? (
          <div className="v-row">
            <span className="v-row-copy">
              <strong>All caught up</strong>
              <small>No homework due and no fees pending.</small>
            </span>
          </div>
        ) : null}
      </div>
      {bus || meeting ? (
        <>
          <div className="section-head">
            <h3>Coming up</h3>
          </div>
          <div className="day-tiles">
            {bus ? (
              <button className="day-tile transport-tile" onClick={() => go(29)}>
                <span className="tile-top">
                  <span className="v-icon blue">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="4" y="3" width="16" height="17" rx="4" />
                      <path d="M7 7h10v6H7z" className="cutfill" />
                      <circle cx="8" cy="17" r="1" className="cutfill" />
                      <circle cx="16" cy="17" r="1" className="cutfill" />
                      <path d="M7 19v3M17 19v3" stroke="currentColor" strokeWidth="3" />
                    </svg>
                  </span>
                  <span>Transport ↗</span>
                </span>
                <small>{`${bus.vehicle_label ?? bus.route_name} · ${bus.stop_name}`}</small>
                {/* Not wired: live "Arrives in N min" — the API gives the scheduled pickup, not an ETA. */}
                <b>{bus.pickup_time ? `Pickup ${bus.pickup_time.slice(0, 5)}` : bus.route_name}</b>
              </button>
            ) : null}
            {meeting ? (
              <button className="day-tile event-tile" onClick={() => go(39)}>
                <span className="tile-top">
                  <span className="v-icon rose">{calendarIcon}</span>
                  <span>Book slot ↗</span>
                </span>
                <small>{meeting.title}</small>
                <b>{shortDate(meeting.meeting_date)}</b>
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      <div className="section-head">
        <h3>All services</h3>
      </div>
      <MenuSections onPick={go} />
    </>
  );
}

/** "At school · Checked in 8:24 AM", from today's register (nothing until it is marked). */
function TodayStatus({ day }: { day: AttendanceDay | null }) {
  if (!day?.status) return null;
  if (day.status === "absent") {
    return (
      <div className="school-status">
        <span className="presence">
          <i />
          Absent today
        </span>
        <small>Marked by school</small>
      </div>
    );
  }
  const left = Boolean(day.left_at);
  return (
    <div className="school-status">
      <span className="presence">
        <i />
        {left ? "Left school" : "At school"}
      </span>
      {left || day.arrived_at ? (
        <small>
          {left ? "Checked out" : "Checked in"}
          <br />
          <b>{clock(left ? day.left_at : day.arrived_at)}</b>
        </small>
      ) : (
        <small>Marked present</small>
      )}
    </div>
  );
}
