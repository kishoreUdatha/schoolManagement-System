"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { date, dateTime, initials, label } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { StaffAttendanceSummary } from "./StaffAttendanceSummary";
import { StaffLeaveSummary } from "./StaffLeaveSummary";
import { StaffQualifications } from "./StaffQualifications";
import { TeacherAllocation } from "./TeacherAllocation";
import { TeacherWorkload } from "./TeacherWorkload";
import { EMPLOYMENT_LABEL, ROLE_LABEL, type StaffProfile as Profile } from "./types";

/** Tabs across the staff profile. */
export const STAFF_TABS = [
  ["overview", "Overview"],
  ["allocation", "Allocation"],
  ["workload", "Workload"],
  ["documents", "Documents"],
  ["attendance", "Attendance"],
  ["leave", "Leave"],
] as const;
export type StaffTab = (typeof STAFF_TABS)[number][0];

/** The tab named by ?tab= on the staff profile (Overview when absent). */
export function useStaffTab(): StaffTab {
  const t = useSearchParams().get("tab");
  return STAFF_TABS.some(([k]) => k === t) ? (t as StaffTab) : "overview";
}

/** The staff profile's address for one tab, e.g. ?id=4&tab=leave. */
export const staffTabHref = (id: string | number, tab: StaffTab) => `${routeOf(82)}?id=${id}${tab === "overview" ? "" : `&tab=${tab}`}`;

/**
 * Tabs across the staff profile. They stay on the profile page and only
 * change ?tab= (replacing the address, so Back leaves the profile rather than
 * stepping through tabs); the header stays put and just the content below
 * changes. Each tab still has its own address to share or reload.
 */
export function StaffTabs({ id, tab }: { id: string; tab: StaffTab }) {
  return (
    <nav className="module-tabs profile-tabs">
      {STAFF_TABS.map(([k, t]) => (
        <Link key={k} href={staffTabHref(id, k)} scroll={false} replace className={k === tab ? "active" : ""} aria-current={k === tab ? "page" : undefined}>
          {t}
        </Link>
      ))}
    </nav>
  );
}

/** Name, designation and teaching load across the top of a staff screen. */
export function StaffBanner({ p, tab }: { p: Profile; tab?: StaffTab }) {
  return (
    <section className="panel profile-banner">
      <div className="profile-hero">
        <div className="row">
          <span className="avatar mint large">{initials(p.full_name)}</span>
          <div>
            <h2>{p.full_name}</h2>
            <p>{`${p.designation ?? ROLE_LABEL[p.role]} · ${p.employee_no}`}</p>
            <div className="profile-meta">
              <span>
                <Icon name="users" className="sm" />
                {` ${ROLE_LABEL[p.role] ?? label(p.role)}`}
              </span>
              <span>
                <Icon name="calendar" className="sm" />
                {` Joined ${date(p.joining_date)}`}
              </span>
              <Badge>{p.exit_status ? `Exit ${label(p.exit_status).toLowerCase()}` : p.is_active ? "Active" : "Inactive"}</Badge>
            </div>
          </div>
        </div>
        <div className="profile-badge">
          <strong>{p.workload.periods_per_week}</strong>
          <small>Periods a week on the timetable</small>
        </div>
      </div>
      {tab ? <StaffTabs id={String(p.staff_id)} tab={tab} /> : null}
    </section>
  );
}

/** Load the member of staff named by ?id=. */
export function useStaffProfile() {
  const id = useSearchParams().get("id");
  const res = useApi<Profile>(id ? `/api/v1/school/staff-ops/${id}/profile` : null);
  return { id, ...res };
}

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

/**
 * SCR-082, live: GET /api/v1/school/staff-ops/{id}/profile. The header stays
 * at the top and ?tab= picks what is under it: the overview here, or the
 * Allocation, Workload, Documents, Attendance and Leave screens' content (the
 * same components those screens use, narrowed to this person). Switching tabs
 * never reloads the header.
 */
export function StaffProfile() {
  const { id, data: p, error, loading } = useStaffProfile();
  const tab = useStaffTab();
  if (!id) return <PickFirst what="member of staff" href={routeOf(80)} cta="Open the staff directory" />;
  if (loading && !p) return <Loading what="Loading the staff profile…" />;
  if (!p) return <ErrorNote>{error ?? "Staff member not found."}</ErrorNote>;
  const who = { staffId: p.staff_id, userId: p.user_id, name: p.full_name };
  return (
    <>
      <StaffBanner p={p} tab={tab} />
      {tab === "allocation" ? (
        <TeacherAllocation only={who} />
      ) : tab === "workload" ? (
        <TeacherWorkload only={who} />
      ) : tab === "documents" ? (
        <StaffQualifications embedded />
      ) : tab === "attendance" ? (
        <StaffAttendanceSummary only={who} />
      ) : tab === "leave" ? (
        <StaffLeaveSummary only={who} />
      ) : (
        <StaffOverview p={p} />
      )}
    </>
  );
}

/** The page-head buttons for the tab on screen (what that tab's own screen offers). */
export function StaffProfileActions() {
  const tab = useStaffTab();
  const id = useSearchParams().get("id");
  if (tab === "allocation")
    return (
      <Link href={routeOf(85)} className="btn primary">
        <Icon name="arrow" className="sm" />
        Assign subject teachers
      </Link>
    );
  if (tab === "workload")
    return (
      <Link href={id ? staffTabHref(id, "allocation") : routeOf(84)} scroll={false} replace={Boolean(id)} className="btn primary">
        <Icon name="arrow" className="sm" />
        View allocation
      </Link>
    );
  if (tab === "documents")
    return (
      <button type="submit" form="qualification-form" className="btn primary">
        <Icon name="check" className="sm" />
        Save qualification
      </button>
    );
  if (tab === "attendance" || tab === "leave") return null;
  return (
    <>
      <WithStaffLink screen={91} icon="arrow" primary={false}>
        Exit / offboarding
      </WithStaffLink>
      <WithStaffLink screen={83} icon="arrow">
        Edit staff
      </WithStaffLink>
    </>
  );
}

/** The Overview tab: details, teaching and observations from the profile. */
function StaffOverview({ p }: { p: Profile }) {
  const w = p.workload;
  const verified = p.qualifications.filter((q) => q.verified_at).length;

  return (
    <>
      <div className="two-col">
        <div className="stack">
          <Panel title="Personal information">
            {kv([
              ["Employee no.", p.employee_no],
              ["Department", p.department_name ?? "—"],
              ["Designation", p.designation ?? "—"],
              ["Role", ROLE_LABEL[p.role] ?? label(p.role)],
              ["Joining date", date(p.joining_date)],
              ["Employment type", p.employment_type ? EMPLOYMENT_LABEL[p.employment_type] : "—"],
              ["Reporting manager", p.reporting_manager_name ?? "—"],
              ["Qualification", p.qualification_summary ?? "—"],
              ["Experience", p.experience_years ? `${Number(p.experience_years)} years` : "—"],
              ["Last sign-in", dateTime(p.last_login_at)],
            ])}
          </Panel>
          <Panel title="Contact information">
            {kv([
              ["Email address", p.email ?? "—"],
              ["Mobile number", p.phone ?? "—"],
              ["Address", p.address ?? "—"],
              [
                "Emergency contact",
                p.emergency_contact_name || p.emergency_contact_phone
                  ? [p.emergency_contact_name, p.emergency_contact_relation ? `(${p.emergency_contact_relation})` : null, p.emergency_contact_phone].filter(Boolean).join(" ")
                  : "—",
              ],
            ])}
          </Panel>
          <Panel title="Teaching" sub={`${w.subjects_taught} subjects · ${w.sections_taught} sections`}>
            {w.subjects.length || w.class_teacher_of.length ? (
              <>
                {w.class_teacher_of.map((c) => (
                  <div className="timeline-item" key={`ct${c.section_id}`}>
                    <span className="timeline-dot">
                      <Icon name="users" />
                    </span>
                    <div>
                      <h4>{`Class teacher of ${c.label}`}</h4>
                      <p>Section responsibility</p>
                    </div>
                  </div>
                ))}
                {w.subjects.map((s) => (
                  <div className="timeline-item" key={s.class_subject_id}>
                    <span className="timeline-dot">
                      <Icon name="book" />
                    </span>
                    <div>
                      <h4>{s.subject_name}</h4>
                      <p>{s.class_name ?? "—"}</p>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <p className="muted">No subjects or sections are assigned.</p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="At a glance">
            <div className="progress-stack">
              <div className="progress-label">
                <span>Periods per week</span>
                <strong>{w.periods_per_week}</strong>
              </div>
              <div className="progress-label">
                <span>Homework set</span>
                <strong>{w.homework_set}</strong>
              </div>
              <div className="progress-label">
                <span>Marks entered</span>
                <strong>{w.marks_entered}</strong>
              </div>
              <div className="progress-label">
                <span>Qualifications verified</span>
                <strong>{`${verified} / ${p.qualifications.length}`}</strong>
              </div>
              <div className="progress-label">
                <span>Documents on file</span>
                <strong>{p.documents.length}</strong>
              </div>
            </div>
          </Panel>
          <Panel title="Recent observations">
            {p.recent_observations.length ? (
              p.recent_observations.map((o) => (
                <div className="timeline-item" key={o.id}>
                  <span className="timeline-dot">
                    <Icon name="check" />
                  </span>
                  <div>
                    <h4>{o.focus ?? o.subject_name ?? "Classroom observation"}</h4>
                    <p>{[date(o.observed_on), o.section_label, o.observer_name].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No classroom observations recorded.</p>
            )}
            <div className="gap" />
            <Link href={`${routeOf(90)}?id=${p.staff_id}`} className="btn">
              <Icon name="plus" className="sm" />
              Record an observation
            </Link>
          </Panel>
          {p.exit_status ? (
            <Panel title="Exit">
              <p className="muted">{`An exit clearance is ${label(p.exit_status).toLowerCase()}.`}</p>
              <div className="gap" />
              <Link href={`${routeOf(91)}?id=${p.staff_id}`} className="btn">
                <Icon name="arrow" className="sm" />
                Open the clearance
              </Link>
            </Panel>
          ) : null}
        </aside>
      </div>
    </>
  );
}

/** A page-head link that keeps the current ?id= (e.g. "Edit staff"). */
export function WithStaffLink({ screen, icon, children, primary = true }: { screen: number; icon: "arrow" | "check" | "plus"; children: string; primary?: boolean }) {
  const id = useSearchParams().get("id");
  return (
    <Link href={id ? `${routeOf(screen)}?id=${id}` : routeOf(80)} className={`btn ${primary ? "primary" : ""}`}>
      <Icon name={icon} className="sm" />
      {children}
    </Link>
  );
}
