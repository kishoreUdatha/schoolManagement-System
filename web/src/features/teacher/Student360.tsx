"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Chart } from "@/components/ui/Chart";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatCards } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { usePageTitle } from "@/components/shell/AppShell";
import { KV } from "@/features/self/kit";
import { date, dateTime, initials, label, money, pct } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { Student360 as S360 } from "./types";

/** The tabs across the record, in the order a teacher asks the questions. */
const TABS = [
  ["overview", "Overview"],
  ["profile", "Student profile"],
  ["family", "Parent & emergency"],
  ["wellbeing", "Health & transport"],
  ["attendance", "Attendance"],
  ["academics", "Academics"],
  ["homework", "Homework"],
  ["fees", "Fees"],
  ["documents", "Documents"],
  ["activity", "Activity"],
] as const;
type Tab = (typeof TABS)[number][0];

/** "08:14:00" -> "08:14 AM". */
function clock(v: string | null | undefined) {
  if (!v) return "—";
  const [h, m] = v.split(":").map(Number);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** A mark sheet prints the figure, not the sign: 91.4 -> "91". */
function mark(v: number | null) {
  return v === null ? "—" : String(Math.round(v));
}

/** "320 KB", the way a file listing says it. */
function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const HW_LABEL: Record<string, string> = {
  approved: "Completed",
  submitted: "Submitted",
  rejected: "Returned",
  pending: "Pending",
  not_submitted: "Missing",
};

/**
 * NEW-096, one child: everything the school records about them, in the one
 * place a teacher looks — marks, attendance, homework, family, health,
 * transport, fees and documents.
 *
 * Live on GET /api/v1/teacher/students/{id}/360, which only answers for a
 * child whose class this teacher teaches.
 */
export function Student360({ id, back }: { id: string; back: string }) {
  const params = useSearchParams();
  const path = usePathname();
  const section = params.get("section");
  const asked = params.get("tab");
  const tab: Tab = TABS.some(([k]) => k === asked) ? (asked as Tab) : "overview";
  const res = useApi<S360>(`/api/v1/teacher/students/${id}/360`);
  const s = res.data;

  usePageTitle(s ? { title: "Student 360", note: "View complete academic, attendance, behaviour and parent details." } : null);

  if (res.error)
    return (
      <>
        <ErrorNote>{res.error}</ErrorNote>
        <Link href={back} className="btn">
          <Icon name="arrow" className="sm" />
          Back to my students
        </Link>
      </>
    );
  if (!s) return <Loading what="Loading the student…" />;

  const href = (k: Tab) => `${path}?id=${id}${section ? `&section=${section}` : ""}${k === "overview" ? "" : `&tab=${k}`}`;
  const k = s.kpis;

  return (
    <>
      <section className="panel s360-banner">
        <div className="s360-head">
          <div className="row">
            <span className="avatar large">{initials(s.full_name)}</span>
            <div>
              <div className="row" style={{ gap: 10 }}>
                <h2>{s.full_name}</h2>
                <Badge>{s.is_active ? "Active" : "Inactive"}</Badge>
              </div>
              <div className="s360-meta">
                <span>{s.class_label ?? "No class"}</span>
                <span>{`Student ID: ${s.admission_no}`}</span>
                <span>{`Roll No: ${s.roll_no}`}</span>
                <span>{`Joined: ${date(s.joined_on)}`}</span>
              </div>
            </div>
          </div>
          <div className="row">
            <Link className="btn" href={`${routeOf(57)}?id=${s.id}`}>
              <Icon name="pencil" className="sm" />
              Edit Profile
            </Link>
            <Link className="btn" href={`${routeOf(253)}?student=${s.id}`}>
              <Icon name="message" className="sm" />
              Message Parent
            </Link>
            <MoreMenu back={back} />
          </div>
        </div>
        <div className="s360-kpis">
          <StatCards
            items={[
              { label: "Attendance", value: pct(k.attendance_percent, 0), note: "", icon: "check", tone: "blue", href: href("attendance") },
              { label: "Avg Marks", value: k.average_percent === null ? "—" : pct(k.average_percent, 0), note: "", icon: "chart", tone: "lilac", href: href("academics") },
              { label: "Homework Completion", value: `${k.homework_done} / ${k.homework_total}`, note: "", icon: "file", tone: "blue", href: href("homework") },
              { label: "Behaviour", value: k.behaviour ?? "Not rated", note: "", icon: "heart", tone: "mint", href: href("activity") },
              { label: "Transport", value: k.transport, note: "", icon: "bus", tone: "peach", href: href("wellbeing") },
              { label: "Fee Status", value: k.fees_pending > 0 ? money(k.fees_pending) : "No dues", note: "", icon: "money", tone: "peach", href: href("fees") },
            ]}
          />
        </div>
      </section>

      <nav className="module-tabs profile-tabs" aria-label="Student record">
        {TABS.map(([key, text]) => (
          <Link key={key} href={href(key)} scroll={false} replace className={key === tab ? "active" : ""} aria-current={key === tab ? "page" : undefined}>
            {text}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? <Overview s={s} href={href} /> : null}
      {tab === "profile" ? <ProfileTab s={s} /> : null}
      {tab === "family" ? <FamilyTab s={s} /> : null}
      {tab === "wellbeing" ? <WellbeingTab s={s} /> : null}
      {tab === "attendance" ? <AttendanceTab s={s} /> : null}
      {tab === "academics" ? <AcademicsTab s={s} /> : null}
      {tab === "homework" ? <HomeworkTab rows={s.homework} /> : null}
      {tab === "fees" ? <FeesTab s={s} /> : null}
      {tab === "documents" ? <DocumentsTab s={s} /> : null}
      {tab === "activity" ? <ActivityTab s={s} /> : null}
    </>
  );
}

/** The banner’s "⋮": where the actions that are not the two buttons live. */
function MoreMenu({ back }: { back: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const shut = (e: Event) => {
      if (!(e.target as HTMLElement).closest(".more-menu")) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("click", shut);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", shut);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className="more-menu">
      <button type="button" className="btn icon-only" aria-haspopup="menu" aria-expanded={open} aria-label="More actions" onClick={() => setOpen((v) => !v)}>
        ⋮
      </button>
      {open ? (
        <div className="more-menu-list" role="menu">
          <Link role="menuitem" href={back}>
            Back to my students
          </Link>
          <Link role="menuitem" href={routeOf(110)}>
            Mark attendance
          </Link>
          <Link role="menuitem" href={routeOf(1094)}>
            Add a note
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- Overview ---------------- */

function Overview({ s, href }: { s: S360; href: (k: Tab) => string }) {
  const a = s.academic;
  const marks: Row[] = a.rows.map((r) => [r.subject_name, ...r.marks.map(mark), mark(r.average)]);
  const hw: Row[] = s.homework.slice(0, 4).map((h) => [
    { text: h.title, note: h.subject_name ?? undefined },
    date(h.due_date),
    HW_LABEL[h.status] ?? label(h.status),
    h.marks === null ? "—" : `${h.marks} / ${h.max_marks ?? "—"}`,
  ]);

  return (
    <div className="two-col dashboard-grid s360-grid">
      <div className="stack s360-stack">
        <div className="two-equal s360-pair">
          <Panel
            title="Academic summary"
            action={a.average === null ? undefined : <span className="pill-soft">{`Term average: ${pct(a.average, 0)}`}</span>}
            flush
          >
            <DataTable
              columns={["Subject", ...a.columns, "Average"]}
              rows={marks}
              selectable={false}
              rowAction={false}
              footer={false}
              emptyState={{ title: "No published results yet", note: "Subject marks appear here once an exam is marked and published." }}
            />
          </Panel>
          <Panel
            title="Attendance trend"
            action={
              <div className="chart-key">
                <span>Present</span>
                <span className="late">Late</span>
              </div>
            }
          >
            {s.attendance.trend.length ? (
              <Chart kind="bar" showValues labels={s.attendance.trend.map((t) => t.label)} values={s.attendance.trend.map((t) => t.value)} label="Attendance over the last marked days" />
            ) : (
              <p className="muted">No attendance marked yet.</p>
            )}
          </Panel>
        </div>
        <div className="two-equal s360-pair">
          <Panel
            title="Recent homework"
            action={
              <Link className="small" href={href("homework")}>
                View all →
              </Link>
            }
            flush
          >
            <div className="hw-mini">
            <DataTable
              columns={["Title", "Due Date", "Status", "Score"]}
              rows={hw}
              selectable={false}
              rowAction={false}
              footer={false}
              emptyState={{ title: "No homework set yet", note: "Homework set for this child's class will appear here." }}
            />
          </div>
          </Panel>
          <Panel
            title="Teacher notes & behaviour"
            action={
              <Link className="small" href={href("activity")}>
                View all →
              </Link>
            }
          >
            {s.notes.length ? (
              s.notes.map((n) => (
                <div className="note-row" key={n.id}>
                  <span className={`note-dot ${n.average >= 4 ? "good" : n.average >= 3 ? "ok" : "low"}`} />
                  <div>
                    <h4>{date(n.created_at)}</h4>
                    <p>{n.teacher_note ?? `${n.period_key} · average ${n.average.toFixed(1)} of 5`}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No notes recorded yet.</p>
            )}
          </Panel>
        </div>
      </div>

      <aside className="stack">
        <Panel title="Today's status" action={s.today.status ? <Badge>{label(s.today.status)}</Badge> : <Badge tone="warn">Not marked</Badge>}>
          <KV
            rows={[
              ["Today's attendance", s.today.status ? label(s.today.status) : "Not marked yet"],
              ["Last check-in", clock(s.today.arrived_at)],
              ["Class teacher", s.class_teacher_name ?? "—"],
              ["Section", s.class_label ?? "—"],
            ]}
          />
        </Panel>

        <Panel
          title="Upcoming items"
          action={
            <Link className="small" href={href("activity")}>
              View all →
            </Link>
          }
        >
          {s.upcoming.length ? (
            s.upcoming.map((u, i) => (
              <div className="rail-row" key={`${u.kind}${i}`}>
                <span className={`rail-icon ${u.kind}`}>
                  <Icon name={u.kind === "meeting" ? "users" : u.kind === "exam" ? "calendar" : "money"} />
                </span>
                <div>
                  <h4>{u.title}</h4>
                  <p>{`${dateTime(u.on)}${u.note ? ` · ${u.note}` : ""}`}</p>
                </div>
                <Icon name="chevron" className="sm rail-go" />
              </div>
            ))
          ) : (
            <p className="muted">Nothing scheduled for this child.</p>
          )}
        </Panel>

        <Panel
          title="Documents"
          action={
            <Link className="small" href={href("documents")}>
              View all →
            </Link>
          }
        >
          {s.documents.length ? (
            s.documents.slice(0, 3).map((d) => (
              <div className="rail-row" key={d.id}>
                <span className="rail-icon doc">
                  <Icon name="file" />
                </span>
                <div>
                  <h4>{d.title}</h4>
                  <p>{`${size(d.size_bytes)} · ${date(d.uploaded_on)}`}</p>
                </div>
                <Link className="small" href={href("documents")}>
                  View
                </Link>
              </div>
            ))
          ) : (
            <p className="muted">No documents on file.</p>
          )}
        </Panel>

        <Panel title="Quick actions">
          <div className="s360-actions">
            <Link className="quick-action" href={routeOf(110)}>
              <Icon name="check" />
              Mark attendance
            </Link>
            <Link className="quick-action" href={routeOf(1094)}>
              <Icon name="message" />
              Add note
            </Link>
            <Link className="quick-action" href={href("academics")}>
              <Icon name="chart" />
              View report card
            </Link>
            <Link className="quick-action" href={href("fees")}>
              <Icon name="money" />
              Open fee history
            </Link>
          </div>
        </Panel>
      </aside>
    </div>
  );
}

/* ---------------- the record, tab by tab ---------------- */

function ProfileTab({ s }: { s: S360 }) {
  return (
    <div className="two-equal s360-pair">
      <Panel title="Student details">
        <KV
          rows={[
            ["Full name", s.full_name],
            ["Date of birth", date(s.dob)],
            ["Gender", label(s.gender)],
            ["Blood group", s.health.blood_group ?? "—"],
            ["Address", s.address ?? "—"],
          ]}
        />
      </Panel>
      <Panel title="Enrolment">
        <KV
          rows={[
            ["Admission no.", s.admission_no],
            ["Class & section", s.class_label ?? "—"],
            ["Roll no.", String(s.roll_no)],
            ["Academic year", s.academic_year_name ?? "—"],
            ["Class teacher", s.class_teacher_name ?? "—"],
            ["Joined", date(s.joined_on)],
            ["Status", s.is_active ? "Active" : "Inactive"],
          ]}
        />
      </Panel>
    </div>
  );
}

function FamilyTab({ s }: { s: S360 }) {
  const rows: Row[] = s.guardians.map((g) => [
    { name: g.full_name, sub: label(g.relation) },
    g.phone ?? "—",
    g.email ?? "—",
    g.is_primary ? "Yes" : "No",
    g.is_emergency_contact ? "Yes" : "No",
    g.can_pickup ? "Yes" : "No",
    g.user_id ? "Has login" : "No login",
  ]);
  const emergency = s.health.emergency_contact_name;
  return (
    <div className="stack s360-stack">
      <Panel title="Parents & guardians" sub="Everyone the office has on file for this child" flush>
        <DataTable
          columns={["Name", "Phone", "Email", "Primary", "Emergency", "Can pick up", "Parent portal"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          emptyState={{ title: "No parent or guardian on file", note: "The school office records a child's family on the student record." }}
        />
      </Panel>
      <Panel title="Emergency contact" sub="From the child's medical record">
        {emergency ? (
          <KV
            rows={[
              ["Name", emergency],
              ["Phone", s.health.emergency_contact_phone ?? "—"],
              ["Relation", label(s.health.emergency_contact_relation)],
            ]}
          />
        ) : (
          <p className="muted">No separate emergency contact recorded — the primary guardian above is the one to call.</p>
        )}
      </Panel>
    </div>
  );
}

function WellbeingTab({ s }: { s: S360 }) {
  const h = s.health;
  const t = s.transport;
  return (
    <div className="two-equal s360-pair">
      <Panel title="Health" sub={h.on_file ? "From the medical record" : "No medical record on file"}>
        <KV
          rows={[
            ["Blood group", h.blood_group ?? "—"],
            ["Allergies", h.allergies ?? "None recorded"],
            ["Conditions", h.chronic_conditions ?? "None recorded"],
            ["Medication", h.current_medications ?? "None recorded"],
            ["Dietary needs", h.dietary_restrictions ?? "None recorded"],
            ["Doctor", [h.doctor_name, h.doctor_phone].filter(Boolean).join(" · ") || "—"],
            ["Notes", h.notes ?? "—"],
          ]}
        />
      </Panel>
      <Panel title="Transport" action={<Badge tone={t.active ? "" : "neutral"}>{t.active ? "Active" : "Not using"}</Badge>}>
        {t.route_name ? (
          <KV
            rows={[
              ["Route", t.route_name],
              ["Stop", t.stop_name ?? "—"],
              ["Direction", label(t.direction)],
              ["From", date(t.start_date)],
              ["Until", t.end_date ? date(t.end_date) : "Ongoing"],
            ]}
          />
        ) : (
          <p className="muted">This child does not use school transport.</p>
        )}
      </Panel>
    </div>
  );
}

function AttendanceTab({ s }: { s: S360 }) {
  const a = s.attendance;
  const rows: Row[] = a.recent.map((d) => [
    date(d.date),
    label(d.status),
    clock(d.arrived_at),
    clock(d.left_at),
    d.remark ?? "—",
  ]);
  return (
    <div className="stack s360-stack">
      <div className="two-equal s360-pair">
        <Panel title="This year">
          <KV
            rows={[
              ["Attendance", pct(a.attendance_percent)],
              ["Present / absent", `${a.days_present} / ${a.days_absent}`],
              ["Late / half day", `${a.days_late} / ${a.days_half_day}`],
              ["Days marked", String(a.days_marked)],
            ]}
          />
        </Panel>
        <Panel title="Attendance trend" sub={`Last ${a.trend.length || 5} marked days`}>
          {a.trend.length ? <Chart kind="bar" labels={a.trend.map((t) => t.label)} values={a.trend.map((t) => t.value)} label="Attendance over the last marked days" /> : <p className="muted">No attendance marked yet.</p>}
        </Panel>
      </div>
      <Panel title="Recent days" sub="Newest first" flush>
        <DataTable
          columns={["Date", "Status", "Arrived", "Left", "Remark"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          emptyState={{ title: "No attendance marked yet", note: "Days appear here as the register is marked." }}
        />
      </Panel>
    </div>
  );
}

function AcademicsTab({ s }: { s: S360 }) {
  const a = s.academic;
  const marks: Row[] = a.rows.map((r) => [r.subject_name, ...r.marks.map((m) => (m === null ? "—" : pct(m, 0))), r.average === null ? "—" : pct(r.average, 0)]);
  const exams: Row[] = a.exams.map((e) => [e.exam_name, label(e.kind), date(e.start_date), `${e.obtained} / ${e.out_of}`, pct(e.percent, 1), `${e.marked} paper(s)`]);
  return (
    <div className="stack s360-stack">
      <Panel title="Subject marks" sub="Every published exam, as a percentage of each paper" action={a.average === null ? undefined : <Badge tone="blue">{`Average: ${pct(a.average, 0)}`}</Badge>} flush>
        <DataTable
          columns={["Subject", ...a.columns, "Average"]}
          rows={marks}
          selectable={false}
          rowAction={false}
          emptyState={{ title: "No published results yet", note: "Subject marks appear here once an exam is marked and published." }}
        />
      </Panel>
      <Panel title="Exams" sub="Published results, newest first" flush>
        <DataTable
          columns={["Exam", "Kind", "Started", "Marks", "Percentage", "Marked"]}
          rows={exams}
          selectable={false}
          rowAction={false}
          emptyState={{ title: "No exams published", note: "Once an exam's results are published they are listed here." }}
        />
      </Panel>
    </div>
  );
}

function HomeworkTab({ rows }: { rows: S360["homework"] }) {
  const out: Row[] = rows.map((h) => [
    { text: h.title, note: h.subject_name ?? undefined },
    date(h.due_date),
    HW_LABEL[h.status] ?? label(h.status),
    h.submitted_at ? dateTime(h.submitted_at) : "—",
    h.marks === null ? "—" : `${h.marks}${h.max_marks ? ` / ${h.max_marks}` : ""}`,
    h.teacher_remark ?? "—",
  ]);
  return (
    <Panel title="Homework" sub="Everything set for this child's class" flush>
      <DataTable
        columns={["Title", "Due date", "Status", "Handed in", "Score", "Remark"]}
        rows={out}
        selectable={false}
        rowAction={false}
        emptyState={{ title: "No homework set yet", note: "Homework set for this child's class will appear here." }}
      />
    </Panel>
  );
}

function FeesTab({ s }: { s: S360 }) {
  const f = s.fees;
  const rows: Row[] = f.rows.map((r) => [
    r.head ?? "—",
    r.period ?? "—",
    date(r.due_date),
    money(r.amount_due),
    money(r.amount_paid),
    label(r.status),
  ]);
  return (
    <div className="stack s360-stack">
      <Panel title="Fees" sub="What the office has raised against this child">
        <KV
          rows={[
            ["Total raised", money(f.total_due)],
            ["Paid", money(f.total_paid)],
            ["Pending", f.pending > 0 ? money(f.pending) : "No dues"],
          ]}
        />
      </Panel>
      <Panel title="Fee history" flush>
        <DataTable
          columns={["Head", "Period", "Due date", "Amount", "Paid", "Status"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          emptyState={{ title: "No fees raised yet", note: "Fee rows appear here once the office generates them for this child." }}
        />
      </Panel>
    </div>
  );
}

function DocumentsTab({ s }: { s: S360 }) {
  const rows: Row[] = s.documents.map((d) => [{ name: d.title, sub: d.original_name }, label(d.category), size(d.size_bytes), date(d.uploaded_on)]);
  return (
    <Panel title="Documents" sub="Files the office keeps on this child" flush>
      <DataTable
        columns={["Document", "Category", "Size", "Uploaded"]}
        rows={rows}
        selectable={false}
        rowAction={false}
        emptyState={{ title: "No documents on file", note: "Certificates and forms uploaded by the office appear here." }}
      />
    </Panel>
  );
}

function ActivityTab({ s }: { s: S360 }) {
  return (
    <div className="two-col dashboard-grid s360-grid">
      <Panel title="Activity" sub="What the school recorded lately">
        {s.activity.length ? (
          s.activity.map((x, i) => (
            <div className="timeline-item" key={`${x.kind}${i}`}>
              <span className="timeline-dot">
                <Icon name={x.kind === "homework" ? "file" : x.kind === "fee" ? "money" : "message"} />
              </span>
              <div>
                <h4>{x.title}</h4>
                <p>{`${dateTime(x.on)}${x.note ? ` · ${x.note}` : ""}`}</p>
              </div>
            </div>
          ))
        ) : (
          <p className="muted">Nothing recorded yet.</p>
        )}
      </Panel>
      <Panel title="Behaviour ratings" sub="Newest first">
        {s.notes.length ? (
          s.notes.map((n) => (
            <div className="spread" key={n.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
              <div>
                <strong>{n.period_key}</strong>
                <p className="small muted">{n.teacher_note ?? "No note"}</p>
              </div>
              <Badge tone={n.average >= 4 ? "" : n.average >= 3 ? "blue" : "warn"}>{`${n.average.toFixed(1)} / 5`}</Badge>
            </div>
          ))
        ) : (
          <p className="muted">No behaviour ratings yet.</p>
        )}
      </Panel>
    </div>
  );
}
