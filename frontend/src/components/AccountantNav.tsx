"use client";

import { IndianRupee, LayoutDashboard, Wallet } from "lucide-react";

import { Sidebar, type NavSection } from "@/components/Sidebar";

const sections: NavSection[] = [
  {
    heading: null,
    items: [
      { href: "/accountant", label: "Dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    heading: "Finance",
    icon: Wallet,
    items: [{ href: "/accountant/fees", label: "Fees", icon: IndianRupee }],
  },
];

export function AccountantNav() {
  return (
    <Sidebar
      brandTitle="SMS · Accountant"
      portalLabel="Accountant"
      brandHref="/accountant"
      sections={sections}
      loginPath="/accountant/login"
    />
  );
}
