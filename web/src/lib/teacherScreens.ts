// The teacher app (/teacher): phone screens for classroom work, in the
// parent app's frame and styles. Hand-maintained; there is no mock pack for it.
// Numbered TM-001 on, independent of the staff workspace's SCR numbers.

export type TeacherScreen = {
  id: string;
  n: number;
  title: string;
  route: string;
  tab: "today" | "attendance" | "homework" | "marks" | "more";
  /** Reachable without signing in. */
  public: boolean;
  /** No bottom navigation (sign-in). */
  noNav?: boolean;
};

export const TEACHER_SCREENS: TeacherScreen[] = [
  { id: "TM-001", n: 1, title: "Teacher sign in", route: "/teacher/sign-in", tab: "more", public: true, noNav: true },
  { id: "TM-002", n: 2, title: "Today", route: "/teacher/today", tab: "today", public: false },
  { id: "TM-003", n: 3, title: "Attendance", route: "/teacher/attendance", tab: "attendance", public: false },
  { id: "TM-004", n: 4, title: "Homework", route: "/teacher/homework", tab: "homework", public: false },
  { id: "TM-005", n: 5, title: "Set homework", route: "/teacher/new-homework", tab: "homework", public: false },
  { id: "TM-006", n: 6, title: "Marks", route: "/teacher/marks", tab: "marks", public: false },
  { id: "TM-007", n: 7, title: "Enter marks", route: "/teacher/marks-entry", tab: "marks", public: false },
  { id: "TM-008", n: 8, title: "My timetable", route: "/teacher/timetable", tab: "more", public: false },
  { id: "TM-009", n: 9, title: "My classes", route: "/teacher/my-classes", tab: "more", public: false },
  { id: "TM-010", n: 10, title: "Class list", route: "/teacher/class-list", tab: "more", public: false },
];

const BY_N = new Map(TEACHER_SCREENS.map((s) => [s.n, s]));

export function teacherScreen(n: number): TeacherScreen {
  const s = BY_N.get(n);
  if (!s) throw new Error(`Unknown teacher screen ${n}`);
  return s;
}

export const teacherRoute = (n: number) => teacherScreen(n).route;
