"use client";

import {
  Bell,
  BookOpen,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Library,
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
    ],
  },
  {
    heading: "Teaching",
    icon: Sparkles,
    items: [
      { href: "/teacher/homework", label: "Homework", icon: BookOpen },
      { href: "/teacher/marks", label: "Marks", icon: ClipboardCheck },
      { href: "/teacher/behaviour", label: "Behaviour", icon: Star },
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
      { href: "/teacher/my-attendance", label: "My attendance", icon: ClipboardList },
    ],
  },
  {
    heading: "Account",
    icon: UserCog,
    items: [
      { href: "/teacher/leaves", label: "My leaves", icon: ClipboardList },
      { href: "/teacher/payslips", label: "My payslips", icon: ReceiptText },
      { href: "/teacher/library", label: "Library books", icon: Library },
      { href: "/teacher/hostel", label: "Hostel (warden)", icon: BedDouble },
      { href: "/teacher/change-password", label: "Change password", icon: Lock },
    ],
  },
];

export function TeacherNav() {
  return (
    <Sidebar
      brandTitle="SMS · Teacher"
      portalLabel="Teacher"
      brandHref="/teacher"
      sections={sections}
      loginPath="/teacher/login"
    />
  );
}
