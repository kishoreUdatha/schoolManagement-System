// The student app (/student): phone screens for students, in the parent
// app's frame and styles. Hand-maintained; numbered SM-001 on.

export type StudentScreen = {
  id: string;
  n: number;
  title: string;
  route: string;
  tab: "home" | "timetable" | "homework" | "results" | "more";
  public: boolean;
  noNav?: boolean;
};

export const STUDENT_SCREENS: StudentScreen[] = [
  { id: "SM-001", n: 1, title: "Student sign in", route: "/student/sign-in", tab: "more", public: true, noNav: true },
  { id: "SM-002", n: 2, title: "Home", route: "/student/home", tab: "home", public: false },
  { id: "SM-003", n: 3, title: "Timetable", route: "/student/timetable", tab: "timetable", public: false },
  { id: "SM-004", n: 4, title: "Homework", route: "/student/homework", tab: "homework", public: false },
  { id: "SM-005", n: 5, title: "Homework", route: "/student/homework-detail", tab: "homework", public: false },
  { id: "SM-006", n: 6, title: "Results", route: "/student/results", tab: "results", public: false },
  { id: "SM-007", n: 7, title: "Result", route: "/student/result", tab: "results", public: false },
  { id: "SM-008", n: 8, title: "Calendar", route: "/student/calendar", tab: "more", public: false },
  { id: "SM-009", n: 9, title: "My profile", route: "/student/profile", tab: "more", public: false },
  { id: "SM-010", n: 10, title: "Change password", route: "/student/change-password", tab: "more", public: false },
];

const BY_N = new Map(STUDENT_SCREENS.map((s) => [s.n, s]));

export function studentScreen(n: number): StudentScreen {
  const s = BY_N.get(n);
  if (!s) throw new Error(`Unknown student screen ${n}`);
  return s;
}

export const studentRoute = (n: number) => studentScreen(n).route;
