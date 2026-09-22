"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { date, dateTime, initials, label } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { EMPLOYMENT_LABEL, ROLE_LABEL, type StaffProfile as Profile } from "./types";

/** The staff profile tabs, each carrying ?id= on to the next screen. */
export function StaffTabs({ id, active }: { id: string; active: number }) {
  const tabs: [number, string][] = [
    [82, "Overview"],
    [84, "Allocation"],
    [86, "Workload"],
    [87, "Documents"],
    [88, "Attendance"],
    [89, "Leave"],
  ];
  return (
    <nav className="module-tabs profile-tabs">
      {tabs.map(([n, t]) => (
        <Link key={n} href={`${routeOf(n)}?id=${id}`} className={n === active ? "active" : ""}>
          {t}
        </Link>
      ))}
    </nav>
  );
}

/** Name, designation and teaching load across the top of a staff screen. */
export function StaffBanner({ p, active }: { p: Profile; active: number }) {
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
      <StaffTabs id={String(p.staff_id)} active={active} />
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

/** SCR-082, live: GET /api/v1/school/staff-ops/{id}/profile. */
export function StaffProfile() {
  const { id, data: p, error, loading } = useStaffProfile();
  if (!id) return <PickFirst what="member of staff" href={routeOf(80)} cta="Open the staff directory" />;
  if (loading && !p) return <Loading what="Loading the staff profile…" />;
  if (!p) return <ErrorNote>{error ?? "Staff member not found."}</ErrorNote>;

  const w = p.workload;
  const verified = p.qualifications.filter((q) => q.verified_at).length;

  return (
    <>
      <StaffBanner p={p} active={82} />
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
