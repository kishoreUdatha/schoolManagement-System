"use client";

/*
 * The parent app's frame, from the Parent Mobile pack: header (back, title,
 * notifications), the selected-child bar, the scrolling body, the five-tab
 * bottom navigation and the "More" menu. Full screen on a phone; a centred
 * column on a desktop.
 *
 * It also owns the parent's session and children. Screens read them with
 * useParent(): the list from GET /parent/me/children and the child picked
 * in the bar, kept per browser. Switching child changes `child`, and every
 * screen keyed on it reloads, so siblings' records never mix.
 */

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { PARENT_SCREENS, parentRoute, parentScreen } from "@/lib/parentScreens";
import { session } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useHydrated, useSession } from "@/lib/useSession";

export type Child = {
  id: number;
  full_name: string;
  admission_no: string;
  roll_no: number | null;
  section_id: number | null;
  section_label: string | null;
  photo_url: string | null;
  is_active: boolean;
  attendance_percent: number | null;
  fees_pending_amount: number | null;
  relation: string | null;
};

type ParentCtx = {
  /** Every child linked to this parent (empty until loaded or when none). */
  children: Child[];
  /** The child picked in the child bar. Null while loading or when none. */
  child: Child | null;
  childId: number | null;
  setChild: (id: number) => void;
  /** Show a message in the frame's toast. */
  notify: (message: string) => void;
  /** Go to parent screen n (PM-00n). */
  go: (n: number) => void;
  loading: boolean;
  error: string | null;
  reloadChildren: () => void;
};

const Ctx = createContext<ParentCtx | null>(null);

export function useParent(): ParentCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useParent() must be used inside <ParentShell>");
  return c;
}

const CHILD_KEY = "bc_child";

const ICONS: Record<string, string> = {
  home: "M3 10 12 3l9 7v10H7V10m3 10v-6h5v6",
  learn: "M3 4h7c1.5 0 2 .7 2 2 0-1.3.5-2 2-2h7v16h-7c-1.5 0-2-.7-2-2 0 1.3-.5 2-2 2H3zM12 6v12",
  fees: "M4 6h16v14H4zM4 6V4h13M14 11h7v5h-7z",
  inbox: "M3 5h18v13H8l-5 3zM7 9h10M7 13h7",
  back: "m14 5-7 7 7 7M7 12h13",
  bell: "M6 10a6 6 0 0 1 12 0v5l2 3H4l2-3zM10 21h4",
  close: "m6 6 12 12M18 6 6 18",
};

function Ico({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "more" ? (
        <>
          <circle cx="5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="19" cy="12" r="1.7" />
        </>
      ) : (
        <path d={ICONS[name]} />
      )}
    </svg>
  );
}

const TABS: [key: string, label: string, n: number][] = [
  ["home", "Home", 6],
  ["learn", "Learn", 14],
  ["fees", "Fees", 23],
  ["inbox", "Inbox", 35],
  ["more", "More", 0],
];

const MORE: [string, number][] = [
  ["My children", 5], ["Student profile", 8], ["Attendance & leave", 9], ["Timetable", 18], ["Exams & results", 19],
  ["Online tests", 101], ["Transport", 29], ["Notice board", 33], ["School calendar", 37], ["Photo gallery", 103],
  ["Parent–teacher meeting", 39], ["Documents", 41],
  ["Health & emergency", 43], ["Help & requests", 44], ["Parent profile", 47], ["Settings", 48], ["Authorized pickup", 49],
  ["Library loans", 51], ["Hostel updates", 52], ["Meal menu", 53], ["Feedback", 54], ["Weekly progress", 55],
  ["Learning resources", 56], ["Behaviour & achievements", 57], ["Projects & activities", 58],
];

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export function ParentShell({ screen: n, children: body }: { screen: number; children: ReactNode }) {
  const s = parentScreen(n);
  const router = useRouter();
  const pathname = usePathname();
  const sess = useSession();
  const hydrated = useHydrated();
  const isParent = sess?.user.role === "parent";

  // Signed-out parents go to sign-in; public screens (welcome, sign-in, verify, link) stay open.
  useEffect(() => {
    if (hydrated && !s.public && !isParent) {
      router.replace(`${parentRoute(2)}?next=${encodeURIComponent(pathname)}`);
    }
  }, [hydrated, s.public, isParent, router, pathname]);

  const kids = useApi<Child[]>(isParent ? "/api/v1/parent/me/children" : null);
  const list = useMemo(() => kids.data ?? [], [kids.data]);
  const [childId, setChildId] = useState<number | null>(null);

  useEffect(() => {
    if (!list.length) return;
    let saved: number | null = null;
    try {
      saved = Number(localStorage.getItem(CHILD_KEY)) || null;
    } catch {
      /* storage unavailable */
    }
    setChildId((cur) => (cur && list.some((c) => c.id === cur) ? cur : saved && list.some((c) => c.id === saved) ? saved : list[0].id));
  }, [list]);

  const setChild = useCallback((id: number) => {
    setChildId(id);
    try {
      localStorage.setItem(CHILD_KEY, String(id));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const notify = useCallback((m: string) => {
    setToast(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const go = useCallback((to: number) => router.push(parentRoute(to)), [router]);
  const [menu, setMenu] = useState(false);

  // The converted mock markup navigates with data-go="n"; honour it until a screen gives the element a real handler.
  const onClick = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-go]");
    if (el && PARENT_SCREENS.some((x) => x.n === Number(el.dataset.go))) {
      e.preventDefault();
      go(Number(el.dataset.go));
    }
  };

  const child = list.find((c) => c.id === childId) ?? null;
  const ctx: ParentCtx = { children: list, child, childId, setChild, notify, go, loading: kids.loading, error: kids.error, reloadChildren: kids.reload };
  const noNav = n <= 5;

  return (
    <Ctx.Provider value={ctx}>
      <div className="pm">
        <div className={`phone ${noNav ? "no-nav" : ""}`} data-screen={n} onClick={onClick}>
          {n > 1 ? (
            <header id="app-header">
              <button className="icon-button" aria-label="Go back" onClick={() => router.back()}>
                <Ico name="back" />
              </button>
              <h2>{n === 6 ? "BrightCampus" : s.title}</h2>
              {isParent ? (
                <button className="icon-button" aria-label="Notifications" onClick={() => go(7)}>
                  <Ico name="bell" />
                </button>
              ) : (
                <span style={{ width: 38 }} />
              )}
            </header>
          ) : null}
          {!s.global && isParent ? (
            <div id="child-bar">
              <button className="child-select" onClick={() => go(5)}>
                <span className="mini-avatar">{child ? initialsOf(child.full_name) : "…"}</span>
                <b>{child?.full_name ?? (kids.loading ? "Loading…" : "No child linked")}</b>
                <span>{child ? `${child.section_label ?? ""}⌄` : ""}</span>
              </button>
            </div>
          ) : null}
          <div className="scroll-body" id="screen-body">
            {body}
          </div>
          {!noNav ? (
            <nav id="bottom-nav" aria-label="Main navigation">
              {TABS.map(([key, label, to]) => (
                <button key={key} className={s.tab === key ? "active" : ""} onClick={() => (to ? go(to) : setMenu(true))}>
                  <Ico name={key} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          ) : null}
          <div id="pm-toast" className={toast ? "visible" : ""} role="status" aria-live="polite">
            {toast}
          </div>
          {menu ? (
            <div id="more-menu">
              <div className="between">
                <h2>More</h2>
                <button className="icon-button" aria-label="Close menu" onClick={() => setMenu(false)}>
                  <Ico name="close" />
                </button>
              </div>
              {MORE.map(([label, to]) => (
                <button
                  key={to}
                  className="item"
                  onClick={() => {
                    setMenu(false);
                    go(to);
                  }}
                >
                  <strong>{label}</strong>
                  <span>›</span>
                </button>
              ))}
              <button
                className="item"
                onClick={() => {
                  session.clear();
                  window.location.href = parentRoute(2);
                }}
              >
                <strong>Sign out</strong>
                <span>›</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </Ctx.Provider>
  );
}
