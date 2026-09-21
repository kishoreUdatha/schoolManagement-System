import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Avatar, Person } from "@/components/ui/primitives";
import { ModuleGroup } from "./ModuleGroup";
import { MODULES, SCREENS, screen, routeOf, type Screen } from "@/lib/screens";

/*
 * The signed-in frame every workspace screen sits in: sidebar, top bar,
 * breadcrumb, page head and footer, as drawn in the BrightCampus mocks.
 *
 * Who is signed in and which menu they see is decided here from the screen
 * number, exactly as the mocks do. When auth lands, `viewerFor` becomes the
 * session and `ROLE_NAV` the role's permitted menu; nothing else changes.
 */

type NavLink = [screen: number, label: string, icon: IconName];

const NAV: [title: string, links: [number, string, IconName, number[]][]][] = [
  ["Overview", [[33, "Dashboard", "grid", [3]], [43, "Admissions", "file", [4]], [55, "Students", "cap", [5, 6]], [80, "Teachers & staff", "users", [7, 14]]]],
  ["Learning", [[98, "Academics", "book", [2, 8]], [110, "Attendance", "check", [9]], [125, "Timetable", "calendar", [10]], [128, "Homework", "file", [11]], [138, "Examinations", "chart", [12]]]],
  ["School operations", [[154, "Fees & finance", "money", [13]], [186, "Transport", "bus", [15]], [198, "Library", "book", [16]], [246, "Communication", "message", [21]], [264, "Reports", "chart", [23]], [289, "Settings", "settings", [24]]]],
];

const ROLE_NAV: Record<string, NavLink[]> = {
  Student: [[36, "Dashboard", "grid"], [131, "My homework", "book"], [59, "My academics", "cap"], [60, "My attendance", "check"], [125, "My timetable", "calendar"], [61, "Exams & results", "chart"], [62, "My fees", "money"], [67, "My library", "book"], [63, "My documents", "file"], [246, "School events", "calendar"], [296, "Notifications", "bell"], [57, "My profile", "users"]],
  Teacher: [[35, "Dashboard", "grid"], [85, "My classes", "cap"], [110, "Mark attendance", "check"], [126, "My timetable", "calendar"], [128, "Homework", "book"], [134, "Assignments", "file"], [145, "Marks entry", "chart"], [102, "Lesson plans", "book"], [106, "Teaching resources", "folder"], [253, "Messages", "message"], [296, "Notifications", "bell"], [82, "My profile", "users"]],
  Parent: [[37, "Dashboard", "grid"], [57, "My children", "cap"], [60, "Attendance", "check"], [61, "Exams & results", "chart"], [131, "Homework", "book"], [78, "Payments & receipts", "money"], [251, "Parent-teacher meeting", "calendar"], [253, "Messages", "message"], [296, "Notifications", "bell"], [73, "My profile", "users"]],
  "Super Admin": [[9, "Platform overview", "grid"], [10, "Organizations", "building"], [13, "Subscription plans", "file"], [14, "Billing", "money"], [15, "Usage & limits", "chart"], [16, "Platform users", "users"], [17, "Support tickets", "message"], [18, "Service health", "check"], [19, "Announcements", "bell"], [20, "Platform settings", "settings"]],
  Principal: [[34, "Dashboard", "grid"], [55, "Students", "cap"], [80, "Teachers", "users"], [104, "Lesson plan review", "book"], [53, "Admission approvals", "file"], [105, "Syllabus progress", "chart"], [117, "Attendance", "check"], [270, "Academic performance", "chart"], [246, "School calendar", "calendar"], [252, "Announcements", "message"]],
  Accountant: [[38, "Dashboard", "grid"], [158, "Collect fee", "money"], [155, "Fee structures", "file"], [161, "Student ledger", "book"], [162, "Outstanding dues", "chart"], [165, "Refund requests", "money"], [167, "Expenses", "file"], [170, "Cash & bank book", "book"], [171, "Finance reports", "chart"]],
  "HR Manager": [[39, "Dashboard", "grid"], [80, "Staff directory", "users"], [172, "Recruitment", "file"], [174, "Candidates", "cap"], [178, "Onboarding", "check"], [179, "Staff attendance", "calendar"], [181, "Leave requests", "file"], [184, "Payroll", "money"], [89, "Leave reports", "chart"]],
  "Admission Officer": [[40, "Dashboard", "grid"], [44, "Enquiries", "users"], [47, "Follow-up calendar", "calendar"], [48, "Applications", "file"], [51, "Document verification", "check"], [52, "Assessments", "chart"], [53, "Admission approvals", "file"], [265, "Admission reports", "chart"]],
  "Transport Manager": [[41, "Dashboard", "grid"], [186, "Vehicles", "bus"], [189, "Routes", "pin"], [191, "Stops", "pin"], [192, "Drivers & conductors", "users"], [193, "Student assignment", "cap"], [194, "Trip sheets", "file"], [195, "Live GPS tracking", "pin"], [197, "Maintenance & fuel", "settings"], [279, "Transport reports", "chart"]],
  Librarian: [[42, "Dashboard", "grid"], [198, "Book catalogue", "book"], [201, "Library members", "users"], [202, "Issue book", "book"], [203, "Return book", "check"], [204, "Renew & reserve", "calendar"], [205, "Fines & lost books", "money"], [206, "Digital library", "folder"], [207, "Library reports", "chart"]],
};

/** Modules without a place in the main menu, listed under "More modules". */
const SIDE_MODULES: [number, IconName][] = [[1, "building"], [17, "building"], [18, "heart"], [19, "shield"], [20, "folder"], [22, "file"]];
const MOD_LABEL = (i: number) => SCREENS.find((x) => x.module === MODULES[i])!.moduleShort;

export function viewerFor(n: number): { who: string; role: string } {
  if (n === 35) return { who: "Ananya Rao", role: "Teacher" };
  if (n === 36 || n === 131 || n === 132) return { who: "Aarav Sharma", role: "Student" };
  if ([37, 78, 79, 159, 251].includes(n)) return { who: "Meera Sharma", role: "Parent" };
  if (n >= 9 && n <= 20) return { who: "Kavya Reddy", role: "Super Admin" };
  if (n === 34) return { who: "Kavya Reddy", role: "Principal" };
  if (n === 38) return { who: "Rohit Verma", role: "Accountant" };
  if (n === 39) return { who: "Priya Nair", role: "HR Manager" };
  if (n === 40) return { who: "Priya Nair", role: "Admission Officer" };
  if (n === 41) return { who: "Arun Kumar", role: "Transport Manager" };
  if (n === 42) return { who: "Sana Ali", role: "Librarian" };
  return { who: "Ananya Rao", role: "School Admin" };
}

function Sidebar({ s }: { s: Screen }) {
  const { who, role } = viewerFor(s.n);
  const roleNav = ROLE_NAV[role];

  return (
    <aside className="sidebar">
      <Link href="/screens" className="brand">
        <span className="brand-mark">
          <Icon name="book" />
        </span>
        <span>
          BrightCampus<small>SCHOOL ERP</small>
        </span>
      </Link>
      <div className="nav-scroll">
        {roleNav ? (
          <>
            <div className="nav-label">{`${role.toUpperCase()} WORKSPACE`}</div>
            {roleNav.map(([n, label, icon]) => (
              <Link key={n + label} className={`nav ${n === s.n ? "active" : ""}`} href={routeOf(n)}>
                <Icon name={icon} />
                <span>{label}</span>
              </Link>
            ))}
          </>
        ) : (
          <>
            {NAV.map(([title, links]) => (
              <div key={title}>
                <div className="nav-label">{title.toUpperCase()}</div>
                {links.map(([n, label, icon, mods], i) => (
                  <ModuleGroup key={n} label={label} icon={icon} mods={mods} currentId={s.id} currentModule={s.module} tone={i} count={label === "Admissions" ? 12 : undefined} />
                ))}
              </div>
            ))}
            <div className="nav-label">MORE MODULES</div>
            {SIDE_MODULES.map(([i, icon], k) => (
              <ModuleGroup key={i} label={MOD_LABEL(i)} icon={icon} mods={[i]} currentId={s.id} currentModule={s.module} tone={k} />
            ))}
          </>
        )}
      </div>
      <div className="sidebar-footer">
        <Person name={who} sub={role} />
      </div>
    </aside>
  );
}

/** The school (tenant) you are working in. The platform console has none. */
function TenantSwitch({ role }: { role: string }) {
  const platform = role === "Super Admin";
  return (
    <button type="button" className="tenant-switch" aria-label="Switch school">
      <span className="avatar">{platform ? "BC" : "BI"}</span>
      <span className="tenant-name">
        {platform ? "BrightCampus Platform" : "Bright International"}
        <small>{platform ? "All organizations" : "Main Campus, Hyderabad"}</small>
      </span>
      <Icon name="down" className="sm" />
    </button>
  );
}

function Topbar({ who, role }: { who: string; role: string }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="btn mobile-menu " aria-label="Open navigation" data-toggle-nav="">
          <Icon name="menu" className="sm" />
        </button>
        <TenantSwitch role={role} />
        <div className="topsearch">
          <Icon name="search" className="sm" />
          <input aria-label="Find screen" placeholder="Search people, classes, pages…" id="global-search" autoComplete="off" />
          <kbd>⌘ K</kbd>
          <div className="search-results" id="global-results" />
        </div>
      </div>
      <div className="row">
        <select className="academic-select" aria-label="Academic year">
          <option>Academic year 2026–27</option>
          <option>Academic year 2025–26</option>
        </select>
        <div className="bar-divider" />
        <Link href={routeOf(296)} aria-label="Notifications" className="btn icon">
          <Icon name="bell" />
          <i className="unread-dot" />
        </Link>
        <Link href={routeOf(253)} aria-label="Messages" className="btn icon">
          <Icon name="message" />
        </Link>
        <Avatar name={who} />
        <Icon name="down" className="sm" />
      </div>
    </header>
  );
}

export function AppShell({ screen: id, actions, children }: { screen: string; actions?: ReactNode; children: ReactNode }) {
  const s = screen(id);
  const mi = MODULES.indexOf(s.module);
  const { who, role } = viewerFor(s.n);
  return (
    <div className="app">
      <Sidebar s={s} />
      <button className="offcanvas-backdrop" aria-label="Close navigation" data-toggle-nav="" />
      <div className="workspace">
        <Topbar who={who} role={role} />
        <main className="main">
          <div className="crumb">
            <Link href={routeOf(33)}>Bright International</Link>
            <span>/</span>
            <Link href={`/screens?module=${mi}`}>{s.moduleShort}</Link>
            <span>/</span>
            {` ${s.layout.includes("dashboard") ? "Overview" : "Workspace"}`}
          </div>
          <div className="page-head">
            <div>
              <h1>{s.name}</h1>
            </div>
            <div className="actions">{actions}</div>
          </div>
          {children}
          <footer className="screen-note">
            <span>BrightCampus · Sample school data</span>
            <span>
              {`${s.id}   `}
              <Link href="/screens">Browse all screens</Link>
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
