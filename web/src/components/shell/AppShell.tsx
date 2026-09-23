"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Avatar, Person } from "@/components/ui/primitives";
import { LinkGroup, ModuleGroup, PARENT } from "./ModuleGroup";
import { heldJobs, usePermissions, type Job } from "@/lib/jobs";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { MODULES, SCREENS, screenAt, routeOf, type Screen } from "@/lib/screens";
import { MENU_LABEL, SCREEN_NOTE, tabGroupOf } from "@/lib/menuGroups";
import { HOME_SCREEN, ROLE_LABEL, session } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useHydrated, useSession } from "@/lib/useSession";

import { ask } from "@/lib/dialog";
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
/** A role's menu is plain links, and groups of links where a role has enough screens to need them. */
type NavGroupDef = { title: string; items: [number, string][] };
type RoleEntry = NavLink | NavGroupDef;
const isGroup = (e: RoleEntry): e is NavGroupDef => !Array.isArray(e);
const screensIn = (e: RoleEntry) => (isGroup(e) ? e.items.map(([n]) => n) : [e[0]]);

const NAV: [title: string, links: [number, string, IconName, number[]][]][] = [
  ["Overview", [[33, "Dashboard", "grid", [3]], [43, "Admissions", "file", [4]], [55, "Students", "cap", [5, 6]], [80, "Teachers & staff", "users", [7, 14]]]],
  ["Learning", [[98, "Academics", "book", [2, 8]], [110, "Attendance", "check", [9]], [125, "Timetable", "calendar", [10]], [128, "Homework", "file", [11]], [138, "Examinations", "chart", [12]]]],
  ["School operations", [[154, "Fees & finance", "money", [13]], [186, "Transport", "bus", [15]], [198, "Library", "book", [16]], [246, "Communication", "message", [21]], [264, "Reports", "chart", [23]], [289, "Settings", "settings", [24]]]],
];

const ROLE_NAV: Record<string, RoleEntry[]> = {
  Student: [[36, "Dashboard", "grid"], [131, "My homework", "book"], [59, "My academics", "cap"], [60, "My attendance", "check"], [125, "My timetable", "calendar"], [61, "Exams & results", "chart"], [62, "My fees", "money"], [67, "My library", "book"], [63, "My documents", "file"], [246, "School events", "calendar"], [296, "Notifications", "bell"], [57, "My profile", "users"]],
  // A teacher's day first, then the work that groups: the notification centre
  // is a tab of Messages, so it is not listed twice.
  Teacher: [
    [35, "Dashboard", "grid"], [1096, "My classes & students", "cap"], [110, "Mark attendance", "check"], [126, "My timetable", "calendar"],
    { title: "Homework & assignments", items: [[128, "Homework"], [134, "Assignments"]] },
    { title: "Teaching", items: [[102, "Lesson plans"], [106, "Teaching resources"], [1021, "Rubrics"]] },
    { title: "Marks & tests", items: [[145, "Marks entry"], [1022, "Question bank"], [1023, "Online tests"]] },
    { title: "Notes on students", items: [[1094, "Behaviour notes"], [1095, "Weekly reports"]] },
    [253, "Messages", "message"], [1097, "My profile", "users"],
  ],
  Parent: [[37, "Dashboard", "grid"], [57, "My children", "cap"], [60, "Attendance", "check"], [61, "Exams & results", "chart"], [131, "Homework", "book"], [78, "Payments & receipts", "money"], [251, "Parent-teacher meeting", "calendar"], [253, "Messages", "message"], [296, "Notifications", "bell"], [73, "My profile", "users"]],
  "Super Admin": [[9, "Platform overview", "grid"], [10, "Organizations", "building"], [13, "Subscription plans", "file"], [14, "Billing", "money"], [15, "Usage & limits", "chart"], [16, "Platform users", "users"], [17, "Support tickets", "message"], [18, "Service health", "check"], [19, "Announcements", "bell"], [1083, "Integrations", "settings"], [20, "Platform settings", "settings"]],
  Principal: [[34, "Dashboard", "grid"], [55, "Students", "cap"], [80, "Teachers", "users"], [104, "Lesson plan review", "book"], [53, "Admission approvals", "file"], [105, "Syllabus progress", "chart"], [117, "Attendance", "check"], [270, "Academic performance", "chart"], [1080, "Approval requests", "check"], [246, "School calendar", "calendar"], [252, "Announcements", "message"]],
  Accountant: [[38, "Dashboard", "grid"], [158, "Collect fee", "money"], [155, "Fee structures", "file"], [161, "Student ledger", "book"], [162, "Outstanding dues", "chart"], [165, "Refund requests", "money"], [167, "Expenses", "file"], [170, "Cash & bank book", "book"], [1040, "Fee heads", "file"], [1041, "Generate fees", "money"], [1042, "Waivers & adjustments", "money"], [1044, "Payment reconciliation", "check"], [1045, "Cheques", "file"], [171, "Finance reports", "chart"]],
  Staff: [[39, "Dashboard", "grid"], [1090, "My attendance", "check"], [1091, "My leave", "calendar"], [1092, "My payslips", "money"], [1093, "My library", "book"], [296, "Notifications", "bell"], [1097, "My profile", "users"]],
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

/**
 * A job's screens as menu entries. Screens that share a tab group are one
 * entry under the group's name — the rest of the group is a row of tabs on
 * the page — but only where the job can open the whole group. Screens already
 * in the person's own menu are not repeated.
 */
function jobMenu(job: Job, own: Set<number>): [number, string][] {
  const listed = new Set(job.items.map(([n]) => n));
  const out: [number, string][] = [];
  const seen = new Set<number>();
  for (const [n, label] of job.items) {
    const group = tabGroupOf(n);
    const grouped = group && listed.has(group.tabs[0][0]);
    const head = grouped ? group.tabs[0][0] : n;
    // already in their own menu — as that screen, or as a tab of one they have
    if (seen.has(head) || own.has(head) || (grouped && group.tabs.some(([t]) => own.has(t)))) continue;
    seen.add(head);
    out.push([head, grouped ? group.label : label]);
  }
  return out;
}

/** The signed-in person, or the mock's viewer for this screen until known. */
function useViewer(s: Screen | undefined): Viewer {
  const sess = useSession();
  return sess ? { who: sess.user.full_name, role: ROLE_LABEL[sess.user.role] ?? sess.user.role } : viewerFor(s?.n ?? 0);
}

/** The signed-in person's home dashboard (the school admin's before sign-in is known). */
function useHome(): string {
  const sess = useSession();
  return routeOf(sess ? HOME_SCREEN[sess.user.role] : 33);
}

const SCROLL_KEY = "bc_nav_scroll";

function signOut() {
  session.clear();
  window.location.href = routeOf(3);
}

function Sidebar({ s, viewer, school }: { s: Screen | undefined; viewer: Viewer; school: Branding | null }) {
  const { who, role } = viewer;
  const roleNav = ROLE_NAV[role];
  const home = useHome();
  // Jobs given through the permission matrix (library, transport, front
  // desk…), each a section under the person's own menu; items already in
  // their menu are not repeated.
  const perms = usePermissions();
  const own = new Set((roleNav ?? []).flatMap(screensIn));
  const jobs = roleNav ? heldJobs(perms).map((j) => ({ ...j, items: jobMenu(j, own) })).filter((j) => j.items.length) : [];
  const here = s ? (PARENT[s.n] ?? s.n) : -1;
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
  }, [s?.id]);

  return (
    <aside className="sidebar">
      {/* The school you are working in heads the menu; the platform console
          (and the moment before the school loads) shows BrightCampus. */}
      <Link href={home} className={`brand ${school ? "school-brand" : ""}`} title={school?.name}>
        {school ? (
          school.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="brand-logo" src={school.logo_url} alt="" />
          ) : (
            <span className="brand-mark school">{initials(school.name)}</span>
          )
        ) : (
          <span className="brand-mark">
            <Icon name="book" />
          </span>
        )}
        <span className="brand-text">
          {school ? school.name : "BrightCampus"}
          <small>{school ? "SCHOOL ERP" : role === "Super Admin" ? "PLATFORM" : "SCHOOL ERP"}</small>
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
            {/* the person's own screens need no heading: they are the menu */}
            {roleNav.map((entry, i) =>
              isGroup(entry) ? (
                <LinkGroup key={entry.title} title={entry.title} items={entry.items} activeN={here} tone={i} currentId={s?.id ?? ""} />
              ) : (
                <Link key={entry[0] + entry[1]} className={`nav ${entry[0] === here ? "active" : ""}`} href={routeOf(entry[0])}>
                  <span>{entry[1]}</span>
                </Link>
              ),
            )}
            {jobs.length ? <div className="nav-label">THE REST OF THE SCHOOL</div> : null}
            {jobs.map((j, i) => (
              <LinkGroup key={j.permission} title={j.title} items={j.items} activeN={here} tone={i} currentId={s?.id ?? ""} />
            ))}
          </>
        ) : (
          <>
            {NAV.map(([title, links]) => (
              <div key={title}>
                {/* "Overview" said nothing the entries did not; the rest still group the menu */}
                {title === "Overview" ? null : <div className="nav-label">{title.toUpperCase()}</div>}
                {links.map(([n, label, icon, mods], i) => (
                  <ModuleGroup key={n} label={label} icon={icon} mods={mods} currentId={s?.id ?? ""} currentModule={s?.module ?? ""} tone={i} />
                ))}
              </div>
            ))}
            <div className="nav-label">MORE MODULES</div>
            {SIDE_MODULES.map(([i, icon], k) => (
              <ModuleGroup key={i} label={MOD_LABEL(i)} icon={icon} mods={[i]} currentId={s?.id ?? ""} currentModule={s?.module ?? ""} tone={k} />
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

/**
 * The school's academic years, with the current one shown. A school admin can
 * make another year current from here (POST /academic-years/{id}/set-current);
 * everyone else sees which year is current. Hidden where the list can't be read.
 */
function YearSelect({ admin }: { admin: boolean }) {
  const years = useApi<{ id: number; name: string; is_current: boolean }[]>("/api/v1/school/academic-years");
  const reload = years.reload;
  // a screen that creates the year (the setup guide) says so
  useEffect(() => {
    window.addEventListener("bc:years-changed", reload);
    return () => window.removeEventListener("bc:years-changed", reload);
  }, [reload]);
  if (!years.data) return null;
  const current = years.data.find((y) => y.is_current);
  async function change(id: number) {
    const y = years.data?.find((x) => x.id === id);
    if (!y || y.is_current) return;
    if (!(await ask(`Make ${y.name} the current academic year for the whole school?`))) return;
    try {
      await api.post(`/api/v1/school/academic-years/${id}/set-current`);
      window.location.reload();
    } catch (err) {
      notify(errorText(err));
    }
  }
  return (
    <select
      className="academic-select"
      aria-label="Academic year"
      value={current?.id ?? ""}
      disabled={!admin || !years.data.length}
      title={admin ? "Change the current academic year" : "The school's current academic year"}
      onChange={(e) => e.target.value && change(Number(e.target.value))}
    >
      {!current ? <option value="">{years.data.length ? "No current academic year" : "No academic year yet"}</option> : null}
      {years.data.map((y) => (
        <option key={y.id} value={y.id}>
          {`Academic year ${y.name}`}
        </option>
      ))}
    </select>
  );
}

function Topbar({ who, role, school }: { who: string; role: string; school: Branding | null }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button type="button" className="btn mobile-menu " aria-label="Open navigation" data-toggle-nav="">
          <Icon name="menu" className="sm" />
        </button>
        <div className="topsearch">
          <Icon name="search" className="sm" />
          <input aria-label="Find screen" placeholder="Search people, classes, pages…" id="global-search" autoComplete="off" />
          <kbd>⌘ K</kbd>
          <div className="search-results" id="global-results" />
        </div>
      </div>
      <div className="row">
        {school ? <YearSelect admin={role === "School Admin"} /> : null}
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

/**
 * The chrome: sidebar, top bar and page head. It lives in the (screens)
 * layout, so moving between screens re-renders only the content below it —
 * the menu keeps its scroll position and its open groups.
 */
export function ShellFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const s = screenAt(path);
  // Sign-in, the workspace chooser and the rest of the public pages draw
  // themselves; they have no menu and no one signed in to send away.
  if (!s || s.module === MODULES[0]) return <>{children}</>;
  return <SignedInFrame s={s}>{children}</SignedInFrame>;
}

function SignedInFrame({ s, children }: { s: Screen; children: ReactNode }) {
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

  const schoolName = sess?.user.role === "super_admin" ? "BrightCampus Platform" : (school?.name ?? "Bright International");
  const group = tabGroupOf(s.n);
  return (
    <div className="app">
      <Sidebar s={s} viewer={viewer} school={school ?? null} />
      <button className="offcanvas-backdrop" aria-label="Close navigation" data-toggle-nav="" />
      <div className="workspace">
        <Topbar who={viewer.who} role={viewer.role} school={school} />
        <main className="main">
          {/* No breadcrumb: the menu shows where you are. Dashboards open
              straight on their greeting; other screens keep a compact title
              row, which also carries their buttons (Save, Add …) — put there
              by the page through PAGE_ACTIONS_SLOT. */}
          {s.layout.includes("dashboard") ? null : (
            <div className="page-head">
              <div>
                <h1>{group?.label ?? MENU_LABEL[s.n] ?? s.name}</h1>
                {SCREEN_NOTE[s.n] ? <p className="page-note">{SCREEN_NOTE[s.n]}</p> : null}
              </div>
              <div className="actions" id={PAGE_ACTIONS_SLOT} />
            </div>
          )}
          {group ? (
            <nav className="module-tabs page-tabs" aria-label={group.label}>
              {group.tabs.map(([n, t]) => (
                <Link key={n} href={routeOf(n)} className={n === s.n ? "active" : ""} aria-current={n === s.n ? "page" : undefined}>
                  {t}
                </Link>
              ))}
            </nav>
          ) : null}
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

export const PAGE_ACTIONS_SLOT = "page-actions";

/**
 * A screen's content. The chrome around it belongs to the layout, so this
 * only hands the page's buttons to the page head (through the slot) and
 * renders the screen itself. `screen` is kept for the page files that name
 * their screen id; the frame reads the screen from the address.
 */
export function AppShell({ actions, children }: { screen: string; actions?: ReactNode; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const path = usePathname();
  useEffect(() => {
    setSlot(document.getElementById(PAGE_ACTIONS_SLOT));
  }, [path]);
  return (
    <>
      {actions && slot ? createPortal(actions, slot) : null}
      {children}
    </>
  );
}
