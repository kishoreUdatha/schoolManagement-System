"use client";

import { BarChart3, ClipboardCheck, FileQuestion, LayoutDashboard, ListChecks, MonitorCheck, NotebookPen, ReceiptText } from "lucide-react";

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
