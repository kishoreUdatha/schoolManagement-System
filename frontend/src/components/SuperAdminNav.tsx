"use client";

import {
  Activity,
  Building2,
  CreditCard,
  Gauge,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  School,
  Settings,
  ShieldCheck,
} from "lucide-react";

import { Sidebar, type NavSection } from "@/components/Sidebar";

const sections: NavSection[] = [
  {
    heading: null,
    items: [
      { href: "/super-admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/super-admin/tenants", label: "Tenants", icon: Building2 },
      { href: "/super-admin/schools", label: "Schools", icon: School },
      { href: "/super-admin/plans", label: "Plans", icon: CreditCard },
      { href: "/super-admin/billing", label: "Billing", icon: CreditCard },
      { href: "/super-admin/usage", label: "Usage & quotas", icon: Gauge },
      { href: "/super-admin/tickets", label: "Support", icon: LifeBuoy },
      { href: "/super-admin/announcements", label: "Announcements", icon: Megaphone },
      { href: "/super-admin/health", label: "System health", icon: Activity },
      { href: "/super-admin/users", label: "Administrators", icon: ShieldCheck },
      { href: "/super-admin/settings", label: "Platform settings", icon: Settings },
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
