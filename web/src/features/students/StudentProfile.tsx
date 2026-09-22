"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, initials, label, money, pct } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { AcademicBody } from "./StudentAcademic";
import { AttendanceBody } from "./StudentAttendance";
import { DocumentsBody } from "./StudentDocuments";
import { CollectFeeLink, LedgerBody } from "./StudentLedger";
import { PrintButton, ResultsBody } from "./StudentResults";
import { TransportBody } from "./StudentTransport";
import type { Guardian, StudentProfile as Profile } from "./types";

/** The profile tabs: key, label and the screen that shows the same content on its own. */
export const STUDENT_TABS = [
  ["overview", "Overview", 57],
  ["academics", "Academics", 59],
  ["attendance", "Attendance", 60],
  ["results", "Results", 61],
  ["fees", "Fees", 62],
  ["documents", "Documents", 63],
  ["transport", "Transport", 66],
] as const;
export type StudentTab = (typeof STUDENT_TABS)[number][0];

/** The tab named by ?tab= on the student profile (Overview when absent). */
export function useStudentTab(): StudentTab {
  const t = useSearchParams().get("tab");
  return STUDENT_TABS.some(([k]) => k === t) ? (t as StudentTab) : "overview";
}

/** The profile tab a per-student screen stands for, or null (Health, Library…). */
export function tabOfScreen(screen: number): StudentTab | null {
  return STUDENT_TABS.find(([, , n]) => n === screen)?.[0] ?? null;
}

/**
 * Tabs across the student profile. They stay on the profile page and only
 * change ?tab= (replacing the address, so Back leaves the profile rather than
 * stepping through tabs); the header stays put and just the content below
 * changes. `tab` null (a screen that is not a tab) highlights none.
 */
export function StudentTabs({ id, tab }: { id: string; tab: StudentTab | null }) {
  return (
    <nav className="module-tabs profile-tabs">
      {STUDENT_TABS.map(([k, t]) => (
        <Link key={k} href={`${routeOf(57)}?id=${id}${k === "overview" ? "" : `&tab=${k}`}`} scroll={false} replace className={k === tab ? "active" : ""} aria-current={k === tab ? "page" : undefined}>
          {t}
        </Link>
      ))}
    </nav>
  );
}

/** Name, class and attendance across the top of every student screen. */
export function StudentBanner({ s, tab }: { s: Profile; tab: StudentTab | null }) {
  return (
    <section className="panel profile-banner">
      <div className="profile-hero">
        <div className="row">
          <span className="avatar mint large">{initials(s.full_name)}</span>
          <div>
            <h2>{s.full_name}</h2>
            <p>{`${s.class_name ?? "No class"} ${s.section_name ?? ""} · Admission no. ${s.admission_no}`}</p>
            <div className="profile-meta">
              <span>
                <Icon name="calendar" className="sm" />
                {` ${s.academic_year_name ?? "—"}`}
              </span>
              {s.roll_no ? (
                <span>
                  <Icon name="users" className="sm" />
                  {` Roll no. ${s.roll_no}`}
                </span>
              ) : null}
              <Badge>{s.is_active ? "Active" : "Inactive"}</Badge>
            </div>
          </div>
        </div>
        <div className="profile-badge">
          <strong>{pct(s.attendance.attendance_percent)}</strong>
          <small>{`Attendance · ${s.attendance.days_marked} days marked`}</small>
        </div>
      </div>
      <StudentTabs id={String(s.id)} tab={tab} />
    </section>
  );
}

/** Load the student named by ?id=, or explain how to pick one. */
export function useStudent() {
  const id = useSearchParams().get("id");
  const res = useApi<Profile>(id ? `/api/v1/school/students/${id}` : null);
  return { id, ...res };
}

/**
 * SCR-057, live: GET /api/v1/school/students/{id}. The student's header stays
 * at the top and ?tab= picks what is under it: the overview here, or the
 * Academics, Attendance, Results, Fees, Documents and Transport screens'
 * content (the same components those screens use on their own). Switching
 * tabs never reloads the header.
 */
export function StudentProfile() {
  const { id, data: s, error, loading, reload } = useStudent();
  const tab = useStudentTab();
  if (!id) return <PickFirst what="student" href={routeOf(55)} cta="Open the student directory" />;
  if (loading && !s) return <Loading what="Loading the student…" />;
  if (!s) return <ErrorNote>{error ?? "Student not found."}</ErrorNote>;
  return (
    <>
      <StudentBanner s={s} tab={tab} />
      {tab === "academics" ? (
        <AcademicBody s={s} />
      ) : tab === "attendance" ? (
        <AttendanceBody s={s} />
      ) : tab === "results" ? (
        <ResultsBody s={s} />
      ) : tab === "fees" ? (
        <LedgerBody s={s} />
      ) : tab === "documents" ? (
        <DocumentsBody s={s} />
      ) : tab === "transport" ? (
        <TransportBody s={s} />
      ) : (
        <StudentOverview s={s} onChange={reload} />
      )}
    </>
  );
}

/** The page-head buttons for the tab on screen (what that tab's own screen offers). */
export function StudentProfileActions() {
  const tab = useStudentTab();
  if (tab === "academics")
    return (
      <Link href="/examinations/report-card" className="btn primary">
        <Icon name="arrow" className="sm" />
        View report card
      </Link>
    );
  if (tab === "attendance")
    return (
      <Link href="/attendance/attendance-correction" className="btn primary">
        <Icon name="arrow" className="sm" />
        Request correction
      </Link>
    );
  if (tab === "results")
    return (
      <>
        <PrintButton />
        <Link href="/examinations/student-result" className="btn primary">
          <Icon name="arrow" className="sm" />
          Download result
        </Link>
      </>
    );
  if (tab === "fees") return <CollectFeeLink />;
  if (tab === "documents")
    return (
      <button type="submit" form="upload-document" className="btn primary">
        <Icon name="check" className="sm" />
        Upload document
      </button>
    );
  if (tab === "transport")
    return (
      <Link href="/transport/student-route-assignment" className="btn primary">
        <Icon name="arrow" className="sm" />
        Change route
      </Link>
    );
  return (
    <WithStudentLink screen={58} icon="arrow">
      Edit student
    </WithStudentLink>
  );
}

/** The Overview tab: GET /students/{id}/guardians alongside the record. */
function StudentOverview({ s, onChange }: { s: Profile; onChange: () => void }) {
  const guardians = useApi<Guardian[]>(`/api/v1/school/students/${s.id}/guardians`);
  const people = guardians.data ?? [];
  const primary = people.find((g) => g.is_primary) ?? people[0];
  const emergency = people.find((g) => g.is_emergency_contact) ?? primary;
  const kv = (rows: [string, string][]) => (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <>
      <div className="two-col">
        <div className="stack">
          <Panel title="Personal information">
            {kv([
              ["Admission no.", s.admission_no],
              ["Class", s.class_name ?? "—"],
              ["Section", s.section_name ?? "—"],
              ["Roll no.", s.roll_no ? String(s.roll_no) : "—"],
              ["Date of birth", date(s.dob)],
              ["Gender", label(s.gender)],
              ["Blood group", s.blood_group ?? "—"],
              ["Parent name", primary?.full_name ?? "—"],
            ])}
          </Panel>
          <Panel title="Contact information">
            {kv([
              ["Email address", primary?.email ?? "—"],
              ["Mobile number", primary?.phone ?? "—"],
              ["Address", s.address ?? "—"],
              ["Emergency contact", emergency ? `${emergency.full_name}${emergency.phone ? ` · ${emergency.phone}` : ""}` : "—"],
            ])}
          </Panel>
          <Panel title="Parents & guardians" sub={`${people.length} linked`}>
            {people.length ? (
              people.map((p, i) => (
                <div className="spread" key={p.link_id} style={{ padding: "8px 0", borderTop: i ? "1px solid var(--line)" : undefined }}>
                  <div className="person">
                    <span className={`avatar ${["mint", "", "peach", "lilac"][i % 4]}`}>{initials(p.full_name)}</span>
                    <div>
                      {p.full_name}
                      <small>{[label(p.relation), p.phone, p.email].filter((x) => x && x !== "—").join(" · ")}</small>
                    </div>
                  </div>
                  <div className="row">
                    {p.is_primary ? <Badge>Primary</Badge> : null}
                    {p.has_portal_login ? <Badge>Portal access</Badge> : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">{guardians.loading ? "Loading…" : "No parent or guardian is recorded yet."}</p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="At a glance">
            <div className="progress-stack">
              <div className="progress-label">
                <span>Attendance</span>
                <strong>{pct(s.attendance.attendance_percent)}</strong>
              </div>
              <div className="progress-label">
                <span>Days present / absent</span>
                <strong>{`${s.attendance.days_present} / ${s.attendance.days_absent}`}</strong>
              </div>
              <div className="progress-label">
                <span>Days late</span>
                <strong>{s.attendance.days_late}</strong>
              </div>
              <div className="progress-label">
                <span>Fees pending</span>
                <strong>{money(s.fees_pending_amount)}</strong>
              </div>
            </div>
          </Panel>
          <Panel title="Recent homework">
            {s.homework_recent.length ? (
              s.homework_recent.map((h) => (
                <div className="timeline-item" key={h.id}>
                  <span className="timeline-dot">
                    <Icon name="file" />
                  </span>
                  <div>
                    <h4>{h.title}</h4>
                    <p>{`${h.subject_name ?? "—"} · due ${date(h.due_date)}${h.is_past_due ? " · past due" : ""}`}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No homework set recently.</p>
            )}
          </Panel>
          <RecordStatus s={s} onChange={onChange} />
        </aside>
      </div>
    </>
  );
}

/**
 * Switching the record on or off: POST /students/{id}/activate | deactivate.
 * The server keeps the enrolment in step. A child actually leaving the
 * school goes through Student Exit instead, which records where and when.
 */
function RecordStatus({ s, onChange }: { s: Profile; onChange: () => void }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const to = s.is_active ? "deactivate" : "activate";

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/students/${s.id}/${to}`);
      notify(`${s.full_name} is now ${s.is_active ? "inactive" : "active"}.`);
      setAsking(false);
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Record status" sub={s.is_active ? "Active: on registers, lists and fee runs" : "Inactive: kept on file, out of daily lists"}>
      <ErrorNote>{error}</ErrorNote>
      <div className="spread">
        <Badge>{s.is_active ? "Active" : "Inactive"}</Badge>
        <button type="button" className={`btn ${s.is_active ? "" : "primary"}`} onClick={() => setAsking(true)} disabled={busy}>
          {s.is_active ? "Deactivate" : "Reactivate"}
        </button>
      </div>
      {s.is_active ? (
        <p className="muted small" style={{ marginTop: 12 }}>
          Leaving the school? Use <Link href={`${routeOf(70)}?id=${s.id}`}>Student exit</Link> so the transfer is recorded.
        </p>
      ) : null}
      <Dialog
        open={asking}
        title={s.is_active ? "Deactivate this student?" : "Reactivate this student?"}
        onClose={() => setAsking(false)}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setAsking(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={go} disabled={busy}>
              {busy ? "Saving…" : s.is_active ? "Deactivate" : "Reactivate"}
            </button>
          </>
        }
      >
        <p>
          {s.is_active
            ? `${s.full_name} will drop out of class lists and attendance registers, and cannot be given a portal login. Nothing is deleted; you can reactivate the record later.`
            : `${s.full_name} returns to ${s.class_name ?? "their class"} ${s.section_name ?? ""} lists and registers. Check the section still has a seat.`}
        </p>
      </Dialog>
    </Panel>
  );
}

/** A page-head button that keeps the current ?id= (e.g. "Edit student"). */
export function WithStudentLink({ screen, icon, children, primary = true }: { screen: number; icon: "arrow" | "check" | "plus"; children: string; primary?: boolean }) {
  const id = useSearchParams().get("id");
  return (
    <Link href={id ? `${routeOf(screen)}?id=${id}` : routeOf(55)} className={`btn ${primary ? "primary" : ""}`}>
      <Icon name={icon} className="sm" />
      {children}
    </Link>
  );
}
