"use client";

import { BarChart3, ClipboardCheck, LayoutDashboard } from "lucide-react";

import { Sidebar, type NavSection } from "@/components/Sidebar";

const sections: NavSection[] = [
  {
    heading: null,
    items: [
      { href: "/principal", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/principal/reports", label: "Reports", icon: BarChart3 },
      { href: "/principal/approvals", label: "Approvals", icon: ClipboardCheck },
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
