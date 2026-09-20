"use client";

import { BarChart3, BookLock, BriefcaseBusiness, DoorClosed, FileSignature, CalendarClock, CalendarOff, FileBadge, Gavel, HandCoins, HeartHandshake, ClipboardCheck, Replace, FileQuestion, LayoutDashboard, ListChecks, MonitorCheck, NotebookPen, ReceiptText } from "lucide-react";

import { Sidebar, type NavSection } from "@/components/Sidebar";

const sections: NavSection[] = [
  {
    heading: null,
    items: [
      { href: "/principal", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/principal/reports", label: "Reports", icon: BarChart3 },
      { href: "/principal/approvals", label: "Approvals", icon: ClipboardCheck },
      { href: "/principal/syllabus", label: "Syllabus", icon: ListChecks },
      { href: "/principal/lesson-plans", label: "Lesson plans", icon: NotebookPen },
      { href: "/principal/question-bank", label: "Question bank", icon: FileQuestion },
      { href: "/principal/online-tests", label: "Online tests", icon: MonitorCheck },
      { href: "/principal/report-cards", label: "Report cards", icon: FileBadge },
      { href: "/principal/refunds", label: "Refunds", icon: HandCoins },
      { href: "/principal/discipline", label: "Discipline", icon: Gavel },
      { href: "/principal/counselling", label: "Counselling", icon: HeartHandshake },
      { href: "/principal/applications", label: "Applications", icon: FileSignature },
      { href: "/principal/recruitment", label: "Recruitment", icon: BriefcaseBusiness },
      { href: "/principal/leave-entitlement", label: "Leave entitlement", icon: CalendarClock },
      { href: "/principal/facilities", label: "Rooms & labs", icon: DoorClosed },
      { href: "/principal/cover", label: "Substitutions", icon: Replace },
      { href: "/principal/attendance-registers", label: "Registers", icon: BookLock },
      { href: "/principal/student-leaves", label: "Student leave", icon: CalendarOff },
      { href: "/principal/payslips", label: "My payslips", icon: ReceiptText },
    ],
  },
];

export function PrincipalNav() {
  return (
    <Sidebar
      brandTitle="SMS · Principal"
      portalLabel="Principal"
      brandHref="/principal"
      sections={sections}
      loginPath="/principal/login"
    />
  );
}
