"use client";

import { BookOpen, GraduationCap, KeyRound, LayoutDashboard } from "lucide-react";

import { Sidebar, type NavSection } from "@/components/Sidebar";

/** A short list on purpose.
 *
 *  A child opening this has three questions: what have I got to do, when is
 *  it due, and how did I do. Attendance sits on the home screen rather than
 *  behind its own link, because it is a number to glance at, not a register
 *  to read. Everything else in the school belongs on somebody else's screen. */
const sections: NavSection[] = [
  {
    heading: null,
    items: [
      { href: "/student", label: "Home", icon: LayoutDashboard, exact: true },
      { href: "/student/homework", label: "Homework", icon: BookOpen },
      { href: "/student/exams", label: "Results", icon: GraduationCap },
      { href: "/student/password", label: "Password", icon: KeyRound },
    ],
  },
];

export function StudentNav() {
  return (
    <Sidebar
      brandTitle="My school"
      portalLabel="Student"
      brandHref="/student"
      sections={sections}
      loginPath="/student/login"
    />
  );
}
