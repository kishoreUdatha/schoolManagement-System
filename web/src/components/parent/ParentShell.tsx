"use client";

/*
 * The parent app: the shared phone frame (MobileFrame: header, body, five-tab
 * bottom navigation, "More" menu) with the parent's tabs, menu and the
 * selected-child bar. Full screen on a phone; a centred column on a desktop.
 *
 * It also owns the parent's session and children. Screens read them with
 * useParent(): the list from GET /parent/me/children and the child picked
 * in the bar, kept per browser. Switching child changes `child`, and every
 * screen keyed on it reloads, so siblings' records never mix.
 */

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Ico, MobileFrame, useToast } from "@/components/mobile/MobileFrame";
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

  const { toast, notify } = useToast();

  const go = useCallback((to: number) => router.push(parentRoute(to)), [router]);

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
      <MobileFrame
        screen={n}
        title={n === 6 ? "BrightCampus" : s.title}
        showHeader={n > 1}
        headerRight={
          isParent ? (
            <button className="icon-button" aria-label="Notifications" onClick={() => go(7)}>
              <Ico name="bell" />
            </button>
          ) : undefined
        }
        subBar={
          !s.global && isParent ? (
            <div id="child-bar">
              <button className="child-select" onClick={() => go(5)}>
                <span className="mini-avatar">{child ? initialsOf(child.full_name) : "…"}</span>
                <b>{child?.full_name ?? (kids.loading ? "Loading…" : "No child linked")}</b>
                <span>{child ? `${child.section_label ?? ""}⌄` : ""}</span>
              </button>
            </div>
          ) : null
        }
        noNav={noNav}
        tabs={TABS.map(([key, label, to]) => ({ key, label, active: s.tab === key, onPress: () => go(to) }))}
        menu={MORE.map(([label, to]) => ({ label, onPress: () => go(to) }))}
        onSignOut={() => {
          session.clear();
          window.location.href = parentRoute(2);
        }}
        toast={toast}
        onBodyClick={onClick}
      >
        {body}
      </MobileFrame>
    </Ctx.Provider>
  );
}
