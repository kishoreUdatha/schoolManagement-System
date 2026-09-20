"use client";

import { Building2, CreditCard, LayoutDashboard, School } from "lucide-react";

import { Sidebar, type NavSection } from "@/components/Sidebar";

const sections: NavSection[] = [
  {
    heading: null,
    items: [
      { href: "/super-admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/super-admin/tenants", label: "Tenants", icon: Building2 },
      { href: "/super-admin/schools", label: "Schools", icon: School },
      { href: "/super-admin/plans", label: "Plans", icon: CreditCard },
    ],
  },
];

export function SuperAdminNav() {
  return (
    <Sidebar
      brandTitle="SMS · Super Admin"
      brandHref="/super-admin"
      sections={sections}
      loginPath="/super-admin/login"
    />
  );
}
