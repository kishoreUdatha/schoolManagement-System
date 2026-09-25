"use client";

/*
 * The teacher app's frame: the shared phone frame (MobileFrame) with the
 * teacher's tabs (Today, Attendance, Homework, Marks, More) and menu. Only
 * teacher accounts get past it; everyone else is sent to the teacher sign-in.
 * Screens read `notify` and `go` from useTeacherApp().
 */

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { MobileFrame, useToast } from "@/components/mobile/MobileFrame";
import { routeOf } from "@/lib/screens";
import { session } from "@/lib/session";
import { teacherRoute, teacherScreen } from "@/lib/teacherScreens";
import { useHydrated, useSession } from "@/lib/useSession";

type TeacherCtx = { notify: (message: string) => void; go: (n: number, query?: string) => void };

const Ctx = createContext<TeacherCtx | null>(null);

export function useTeacherApp(): TeacherCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTeacherApp() must be used inside <TeacherShell>");
  return c;
}

const TABS: [key: string, label: string, n: number][] = [
  ["today", "Today", 2],
  ["attendance", "Attendance", 3],
  ["homework", "Homework", 4],
  ["marks", "Marks", 6],
  ["more", "More", 0],
];

const MORE: [string, number][] = [
  ["My timetable", 8],
  ["My classes & students", 9],
];

/** Staff-workspace screens the phone app does not have yet, opened full size. */
const WORKSPACE: [string, number][] = [
  ["Messages", 253],
  ["Behaviour notes", 1094],
  ["Weekly progress reports", 1095],
  ["Parent–teacher meetings", 250],
  ["My profile", 1097],
];

export function TeacherShell({ screen: n, children }: { screen: number; children: ReactNode }) {
  const s = teacherScreen(n);
  const router = useRouter();
  const pathname = usePathname();
  const sess = useSession();
  const hydrated = useHydrated();
  const isTeacher = sess?.user.role === "teacher";

  useEffect(() => {
    if (hydrated && !s.public && !isTeacher) {
      router.replace(`${teacherRoute(1)}?next=${encodeURIComponent(pathname)}`);
    }
  }, [hydrated, s.public, isTeacher, router, pathname]);

  const { toast, notify } = useToast();
  const go = useCallback((to: number, query?: string) => router.push(teacherRoute(to) + (query ? `?${query}` : "")), [router]);

  return (
    <Ctx.Provider value={{ notify, go }}>
      <MobileFrame
        screen={`t${n}`}
        title={n === 2 ? "BrightCampus" : s.title}
        showHeader={n > 1}
        noNav={!!s.noNav}
        tabs={TABS.map(([key, label, to]) => ({ key, label, active: s.tab === key, onPress: () => go(to) }))}
        menu={[
          ...MORE.map(([label, to]) => ({ label, onPress: () => go(to) })),
          ...WORKSPACE.map(([label, scr]) => ({ label: `${label} ↗`, onPress: () => router.push(routeOf(scr)) })),
        ]}
        onSignOut={() => {
          session.clear();
          window.location.href = teacherRoute(1);
        }}
        toast={toast}
      >
        {!s.public && !isTeacher ? <p className="muted">Loading…</p> : children}
      </MobileFrame>
    </Ctx.Provider>
  );
}
