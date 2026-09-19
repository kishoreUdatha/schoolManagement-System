"use client";

import {
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  Clock,
  Cog,
  GraduationCap,
  IndianRupee,
  LayoutDashboard,
  PartyPopper,
  PlayCircle,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  Download,
  User,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import { Sidebar, type NavSection } from "@/components/Sidebar";

const sections: NavSection[] = [
  {
    heading: null,
    items: [
      { href: "/school", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/school/profile", label: "Profile", icon: Settings },
    ],
  },
  {
    heading: "Setup",
    icon: Cog,
    items: [
      { href: "/school/academic-years", label: "Years", icon: Calendar },
      { href: "/school/classes", label: "Classes", icon: GraduationCap },
      { href: "/school/subjects", label: "Subjects", icon: BookOpen },
      { href: "/school/periods", label: "Periods", icon: Clock },
    ],
  },
  {
    heading: "Admissions",
    icon: UserPlus,
    items: [
      { href: "/school/admissions", label: "Enquiries", icon: UserPlus, exact: true },
      { href: "/school/admissions/campaigns", label: "Campaigns", icon: BarChart3 },
    ],
  },
  {
    heading: "People",
    icon: Users,
    items: [
      { href: "/school/staff", label: "Staff", icon: Users },
      { href: "/school/students", label: "Students", icon: User },
      { href: "/school/parents", label: "Parents", icon: UserCheck },
    ],
  },
  {
    heading: "Academics",
    icon: Sparkles,
    items: [
      { href: "/school/timetable", label: "Timetable", icon: CalendarDays },
      { href: "/school/exams", label: "Exams", icon: ClipboardCheck },
      { href: "/school/videos", label: "Videos", icon: PlayCircle },
      { href: "/school/notices", label: "Notices", icon: Bell },
      { href: "/school/holidays", label: "Holidays", icon: PartyPopper },
    ],
  },
  {
    heading: "Attendance",
    icon: CheckSquare,
    items: [
      { href: "/school/staff-attendance", label: "Staff attendance", icon: CheckSquare },
      { href: "/school/staff-leaves", label: "Staff leaves", icon: ClipboardCheck },
      { href: "/school/reports/attendance", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    heading: "Finance",
    icon: Wallet,
    items: [{ href: "/school/fees", label: "Fees", icon: IndianRupee }],
  },
  {
    heading: "Security",
    icon: Shield,
    items: [
      { href: "/school/audit-log", label: "Audit log", icon: ScrollText },
      { href: "/school/exports", label: "Exports", icon: Download },
    ],
  },
];

export function SchoolAdminNav() {
  return (
    <Sidebar
      brandTitle="SMS · School"
      portalLabel="School"
      brandHref="/school"
      sections={sections}
      loginPath="/school/login"
    />
  );
}
