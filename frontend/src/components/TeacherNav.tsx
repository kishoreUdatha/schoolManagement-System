"use client";

import {
  Bell,
  BookOpen,
  CalendarDays,
  CalendarRange,
  Handshake,
  Images,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Library,
  FlaskConical,
  Gavel,
  HeartHandshake,
  FileBadge,
  Replace,
  CalendarOff,
  FileQuestion,
  MonitorCheck,
  ListChecks,
  NotebookPen,
  BedDouble,
  Lock,
  MessageSquare,
  ReceiptText,
  PlayCircle,
  Sparkles,
  Star,
  UserCog,
} from "lucide-react";

import { Sidebar, type NavSection } from "@/components/Sidebar";

const sections: NavSection[] = [
  {
    heading: null,
    items: [
      { href: "/teacher", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/teacher/my-classes", label: "My classes", icon: GraduationCap },
      { href: "/teacher/timetable", label: "Timetable", icon: CalendarDays },
      { href: "/teacher/calendar", label: "Calendar", icon: CalendarRange },
      { href: "/teacher/cover", label: "My cover", icon: Replace },
      { href: "/teacher/ptm", label: "Parent meetings", icon: Handshake },
      { href: "/teacher/gallery", label: "Photo gallery", icon: Images },
    ],
  },
  {
    heading: "Teaching",
    icon: Sparkles,
    items: [
      { href: "/teacher/syllabus", label: "Syllabus", icon: ListChecks },
      { href: "/teacher/lesson-plans", label: "Lesson plans", icon: NotebookPen },
      { href: "/teacher/question-bank", label: "Question bank", icon: FileQuestion },
      { href: "/teacher/online-tests", label: "Online tests", icon: MonitorCheck },
      { href: "/teacher/homework", label: "Homework", icon: BookOpen },
      { href: "/teacher/rubrics", label: "Rubrics", icon: ClipboardList },
      { href: "/teacher/marks", label: "Marks", icon: ClipboardCheck },
      { href: "/teacher/report-cards", label: "Report cards", icon: FileBadge },
      { href: "/teacher/behaviour", label: "Behaviour", icon: Star },
      { href: "/teacher/discipline", label: "Discipline", icon: Gavel },
      { href: "/teacher/counselling", label: "Counselling", icon: HeartHandshake },
      { href: "/teacher/videos", label: "Videos", icon: PlayCircle },
      { href: "/teacher/projects", label: "Projects", icon: ClipboardCheck },
      { href: "/teacher/weekly-reports", label: "Weekly reports", icon: ClipboardList },
      { href: "/teacher/messages", label: "Messages", icon: MessageSquare },
      { href: "/teacher/notices", label: "Notices", icon: Bell },
    ],
  },
  {
    heading: "Attendance",
    icon: CheckSquare,
    items: [
      { href: "/teacher/attendance", label: "Class attendance", icon: CheckSquare },
      { href: "/teacher/student-leaves", label: "Student leave", icon: CalendarOff },
      { href: "/teacher/my-attendance", label: "My attendance", icon: ClipboardList },
    ],
  },
  {
    heading: "Account",
    icon: UserCog,
    items: [
      { href: "/teacher/leaves", label: "My leaves", icon: ClipboardList },
      { href: "/teacher/payslips", label: "My payslips", icon: ReceiptText },
      { href: "/teacher/labs", label: "Labs", icon: FlaskConical },
      { href: "/teacher/library", label: "Library books", icon: Library },
      { href: "/teacher/hostel", label: "Hostel (warden)", icon: BedDouble },
      { href: "/teacher/change-password", label: "Change password", icon: Lock },
    ],
  },
];

export function TeacherNav() {
  return (
    <Sidebar
      showSchool
      brandTitle="SMS · Teacher"
      portalLabel="Teacher"
      brandHref="/teacher"
      sections={sections}
      loginPath="/teacher/login"
    />
  );
}
