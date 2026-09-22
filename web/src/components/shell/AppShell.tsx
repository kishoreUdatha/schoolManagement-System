"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Avatar, Person } from "@/components/ui/primitives";
import { ModuleGroup, NOT_IN_MENU, PARENT } from "./ModuleGroup";
import { heldJobs, usePermissions } from "@/lib/jobs";
import { MODULES, SCREENS, screen, routeOf, type Screen } from "@/lib/screens";
import { HOME_SCREEN, ROLE_LABEL, session } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useHydrated, useSession } from "@/lib/useSession";

/*
 * The signed-in frame every workspace screen sits in: sidebar, top bar,
 * breadcrumb, page head and footer, as drawn in the BrightCampus mocks.
 *
 * Who is signed in comes from the session; the menu is that role's menu.
 * Before the session is read (the server render) it falls back to the
 * mock's viewer for the screen, so the first paint matches the design.
 * Signed-out visitors are sent to sign in.
 */

type NavLink = [screen: number, label: string, icon: IconName];

const NAV: [title: string, links: [number, string, IconName, number[]][]][] = [
  ["Overview", [[33, "Dashboard", "grid", [3]], [43, "Admissions", "file", [4]], [55, "Students", "cap", [5, 6]], [80, "Teachers & staff", "users", [7, 14]]]],
  ["Learning", [[98, "Academics", "book", [2, 8]], [110, "Attendance", "check", [9]], [125, "Timetable", "calendar", [10]], [128, "Homework", "file", [11]], [138, "Examinations", "chart", [12]]]],
  ["School operations", [[154, "Fees & finance", "money", [13]], [186, "Transport", "bus", [15]], [198, "Library", "book", [16]], [246, "Communication", "message", [21]], [264, "Reports", "chart", [23]], [289, "Settings", "settings", [24]]]],
];

const ROLE_NAV: Record<string, NavLink[]> = {
  Student: [[36, "Dashboard", "grid"], [131, "My homework", "book"], [59, "My academics", "cap"], [60, "My attendance", "check"], [125, "My timetable", "calendar"], [61, "Exams & results", "chart"], [62, "My fees", "money"], [67, "My library", "book"], [63, "My documents", "file"], [246, "School events", "calendar"], [296, "Notifications", "bell"], [57, "My profile", "users"]],
  Teacher: [[35, "Dashboard", "grid"], [1096, "My classes & students", "cap"], [110, "Mark attendance", "check"], [126, "My timetable", "calendar"], [128, "Homework", "book"], [134, "Assignments", "file"], [145, "Marks entry", "chart"], [102, "Lesson plans", "book"], [106, "Teaching resources", "folder"], [1021, "Rubrics", "check"], [1022, "Question bank", "file"], [1023, "Online tests", "chart"], [1094, "Behaviour notes", "heart"], [1095, "Weekly reports", "file"], [253, "Messages", "message"], [296, "Notifications", "bell"], [82, "My profile", "users"]],
  Parent: [[37, "Dashboard", "grid"], [57, "My children", "cap"], [60, "Attendance", "check"], [61, "Exams & results", "chart"], [131, "Homework", "book"], [78, "Payments & receipts", "money"], [251, "Parent-teacher meeting", "calendar"], [253, "Messages", "message"], [296, "Notifications", "bell"], [73, "My profile", "users"]],
  "Super Admin": [[9, "Platform overview", "grid"], [10, "Organizations", "building"], [13, "Subscription plans", "file"], [14, "Billing", "money"], [15, "Usage & limits", "chart"], [16, "Platform users", "users"], [17, "Support tickets", "message"], [18, "Service health", "check"], [19, "Announcements", "bell"], [20, "Platform settings", "settings"]],
  Principal: [[34, "Dashboard", "grid"], [55, "Students", "cap"], [80, "Teachers", "users"], [104, "Lesson plan review", "book"], [53, "Admission approvals", "file"], [105, "Syllabus progress", "chart"], [117, "Attendance", "check"], [270, "Academic performance", "chart"], [1080, "Approval requests", "check"], [246, "School calendar", "calendar"], [252, "Announcements", "message"]],
  Accountant: [[38, "Dashboard", "grid"], [158, "Collect fee", "money"], [155, "Fee structures", "file"], [161, "Student ledger", "book"], [162, "Outstanding dues", "chart"], [165, "Refund requests", "money"], [167, "Expenses", "file"], [170, "Cash & bank book", "book"], [1040, "Fee heads", "file"], [1041, "Generate fees", "money"], [1042, "Waivers & adjustments", "money"], [1044, "Payment reconciliation", "check"], [1045, "Cheques", "file"], [171, "Finance reports", "chart"]],
  Staff: [[39, "Dashboard", "grid"], [1090, "My attendance", "check"], [1091, "My leave", "calendar"], [1092, "My payslips", "money"], [1093, "My library", "book"], [296, "Notifications", "bell"]],
  "HR Manager": [[39, "Dashboard", "grid"], [80, "Staff directory", "users"], [172, "Recruitment", "file"], [174, "Candidates", "cap"], [178, "Onboarding", "check"], [179, "Staff attendance", "calendar"], [181, "Leave requests", "file"], [184, "Payroll", "money"], [1060, "Candidate pool", "users"], [1061, "Leave balances", "calendar"], [1062, "Salary & bank files", "money"], [89, "Leave reports", "chart"]],
  "Admission Officer": [[40, "Dashboard", "grid"], [44, "Enquiries", "users"], [47, "Follow-up calendar", "calendar"], [48, "Applications", "file"], [51, "Document verification", "check"], [52, "Assessments", "chart"], [53, "Admission approvals", "file"], [1002, "Campaigns", "message"], [1001, "Online admission link", "pin"], [265, "Admission reports", "chart"]],
  "Transport Manager": [[41, "Dashboard", "grid"], [1072, "Transport dashboard", "bus"], [186, "Vehicles", "bus"], [189, "Routes", "pin"], [191, "Stops", "pin"], [192, "Drivers & conductors", "users"], [193, "Student assignment", "cap"], [194, "Trip sheets", "file"], [195, "Live GPS tracking", "pin"], [197, "Maintenance & fuel", "settings"], [279, "Transport reports", "chart"]],
  Librarian: [[42, "Dashboard", "grid"], [198, "Book catalogue", "book"], [201, "Library members", "users"], [202, "Issue book", "book"], [203, "Return book", "check"], [204, "Renew & reserve", "calendar"], [205, "Fines & lost books", "money"], [206, "Digital library", "folder"], [1073, "Library settings", "settings"], [207, "Library reports", "chart"]],
};

/** Modules without a place in the main menu, listed under "More modules". */
// Platform (module 1) is the super admin's, reached through their own menu; a school never sees it.
const SIDE_MODULES: [number, IconName][] = [[17, "building"], [18, "heart"], [19, "shield"], [20, "folder"], [22, "file"]];
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

type Viewer = { who: string; role: string };

/** The signed-in person, or the mock's viewer for this screen until known. */
function useViewer(s: Screen): Viewer {
  const sess = useSession();
  return sess ? { who: sess.user.full_name, role: ROLE_LABEL[sess.user.role] ?? sess.user.role } : viewerFor(s.n);
}

/** The signed-in person's home dashboard (the school admin's before sign-in is known). */
function useHome(): string {
  const sess = useSession();
  return routeOf(sess ? HOME_SCREEN[sess.user.role] : 33);
}

/** A module's first screen that appears in the menu: where its breadcrumb link goes. */
function moduleHome(module: string): string {
  return (SCREENS.find((x) => x.module === module && !NOT_IN_MENU.has(x.n)) ?? SCREENS.find((x) => x.module === module))!.route;
}

const SCROLL_KEY = "bc_nav_scroll";

function signOut() {
  session.clear();
  window.location.href = routeOf(3);
}

function Sidebar({ s, viewer }: { s: Screen; viewer: Viewer }) {
  const { who, role } = viewer;
  const roleNav = ROLE_NAV[role];
  const home = useHome();
  // Jobs given through the permission matrix (library, transport, front
  // desk…), each a section under the person's own menu; items already in
  // their menu are not repeated.
  const perms = usePermissions();
  const own = new Set((roleNav ?? []).map(([n]) => n));
  const jobs = roleNav ? heldJobs(perms).map((j) => ({ ...j, items: j.items.filter(([n]) => !own.has(n)) })).filter((j) => j.items.length) : [];
  const here = PARENT[s.n] ?? s.n;
  const scroller = useRef<HTMLDivElement>(null);

  // Keep the menu where it was between screens, and the current item in view.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    try {
      el.scrollTop = Number(sessionStorage.getItem(SCROLL_KEY) ?? 0);
    } catch {
      /* storage unavailable */
    }
    const active = el.querySelector<HTMLElement>(".subnav.active, a.nav.active");
    if (active) {
      const a = active.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      if (a.top < box.top || a.bottom > box.bottom) active.scrollIntoView({ block: "center" });
    }
  }, [s.id]);

  return (
    <aside className="sidebar">
      <Link href={home} className="brand">
        <span className="brand-mark">
          <Icon name="book" />
        </span>
        <span>
          BrightCampus<small>SCHOOL ERP</small>
        </span>
      </Link>
      <div
        className="nav-scroll"
        ref={scroller}
        onScroll={(e) => {
          try {
            sessionStorage.setItem(SCROLL_KEY, String(e.currentTarget.scrollTop));
          } catch {
            /* storage unavailable */
          }
        }}
      >
        {roleNav ? (
          <>
            <div className="nav-label">{`${role.toUpperCase()} WORKSPACE`}</div>
            {roleNav.map(([n, label]) => (
              <Link key={n + label} className={`nav ${n === here ? "active" : ""}`} href={routeOf(n)}>
                <span>{label}</span>
              </Link>
            ))}
            {jobs.map((j) => (
              <div key={j.permission}>
                <div className="nav-label">{j.title.toUpperCase()}</div>
                {j.items.map(([n, label]) => (
                  <Link key={n} className={`nav ${n === here ? "active" : ""}`} href={routeOf(n)}>
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            ))}
          </>
        ) : (
          <>
            {NAV.map(([title, links]) => (
              <div key={title}>
                <div className="nav-label">{title.toUpperCase()}</div>
                {links.map(([n, label, icon, mods], i) => (
                  <ModuleGroup key={n} label={label} icon={icon} mods={mods} currentId={s.id} currentModule={s.module} tone={i} />
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
      <div className="sidebar-footer spread">
        <Person name={who} sub={role} />
        <button type="button" className="btn icon sign-out" aria-label="Sign out" title="Sign out" onClick={signOut}>
          <Icon name="logout" />
        </button>
      </div>
    </aside>
  );
}

/** The school (tenant) you are working in. The platform console has none. */
type Branding = { school_id: number; name: string; code: string | null; address: string | null; logo_url: string | null };

/** The signed-in school's branding; null for the platform console and before sign-in. */
function useSchool(role: string) {
  const sess = useSession();
  const { data } = useApi<Branding>(sess && role !== "Super Admin" ? "/api/v1/branding/me" : null);
  return data;
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function TenantSwitch({ role, school }: { role: string; school: Branding | null }) {
  const platform = role === "Super Admin";
  const name = platform ? "BrightCampus Platform" : (school?.name ?? "Bright International");
  const sub = platform ? "All organizations" : school ? (school.address ?? `School code ${school.code ?? ""}`) : "Main Campus, Hyderabad";
  return (
    <button type="button" className="tenant-switch" aria-label="Switch school">
      <span className="avatar">{platform ? "BC" : initials(name)}</span>
      <span className="tenant-name">
        {name}
        <small>{sub}</small>
      </span>
      <Icon name="down" className="sm" />
    </button>
  );
}

function Topbar({ who, role, school }: { who: string; role: string; school: Branding | null }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="btn mobile-menu " aria-label="Open navigation" data-toggle-nav="">
          <Icon name="menu" className="sm" />
        </button>
        <TenantSwitch role={role} school={school} />
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
  const viewer = useViewer(s);
  const school = useSchool(viewer.role);
  const sess = useSession();
  const hydrated = useHydrated();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !sess) {
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      router.replace(`${routeOf(3)}?next=${next}`);
    }
  }, [hydrated, sess, router]);

  const schoolName = school?.name ?? "Bright International";
  const home = useHome();
  return (
    <div className="app">
      <Sidebar s={s} viewer={viewer} />
      <button className="offcanvas-backdrop" aria-label="Close navigation" data-toggle-nav="" />
      <div className="workspace">
        <Topbar who={viewer.who} role={viewer.role} school={school} />
        <main className="main">
          <div className="crumb">
            <Link href={home}>{schoolName}</Link>
            <span>/</span>
            <Link href={moduleHome(s.module)}>{s.moduleShort}</Link>
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
            <span>{`BrightCampus · ${schoolName}`}</span>
            <span>{s.id}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
