"use client";

/*
 * The student app's frame: the shared phone frame (MobileFrame) with the
 * student's tabs (Home, Timetable, Homework, Results, More). Only student
 * accounts get past it; everyone else goes to the student sign-in.
 */

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { MobileFrame, useToast } from "@/components/mobile/MobileFrame";
import { session } from "@/lib/session";
import { studentRoute, studentScreen } from "@/lib/studentScreens";
import { useHydrated, useSession } from "@/lib/useSession";

type StudentCtx = { notify: (message: string) => void; go: (n: number, query?: string) => void };

const Ctx = createContext<StudentCtx | null>(null);

export function useStudentApp(): StudentCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useStudentApp() must be used inside <StudentShell>");
  return c;
}

const TABS: [key: string, label: string, n: number][] = [
  ["home", "Home", 2],
  ["timetable", "Timetable", 3],
  ["homework", "Homework", 4],
  ["results", "Results", 6],
  ["more", "More", 0],
];

const MORE: [string, number][] = [
  ["Calendar", 8],
  ["My profile", 9],
  ["Change password", 10],
];

export function StudentShell({ screen: n, children }: { screen: number; children: ReactNode }) {
  const s = studentScreen(n);
  const router = useRouter();
  const pathname = usePathname();
  const sess = useSession();
  const hydrated = useHydrated();
  const isStudent = sess?.user.role === "student";

  useEffect(() => {
    if (hydrated && !s.public && !isStudent) {
      router.replace(`${studentRoute(1)}?next=${encodeURIComponent(pathname)}`);
    }
  }, [hydrated, s.public, isStudent, router, pathname]);

  const { toast, notify } = useToast();
  const go = useCallback((to: number, query?: string) => router.push(studentRoute(to) + (query ? `?${query}` : "")), [router]);

  return (
    <Ctx.Provider value={{ notify, go }}>
      <MobileFrame
        screen={`s${n}`}
        title={n === 2 ? "BrightCampus" : s.title}
        showHeader={n > 1}
        noNav={!!s.noNav}
        tabs={TABS.map(([key, label, to]) => ({ key, label, active: s.tab === key, onPress: () => go(to) }))}
        menu={MORE.map(([label, to]) => ({ label, onPress: () => go(to) }))}
        onSignOut={() => {
          session.clear();
          window.location.href = studentRoute(1);
        }}
        toast={toast}
      >
        {!s.public && !isStudent ? <p className="muted">Loading…</p> : children}
      </MobileFrame>
    </Ctx.Provider>
  );
}
