"use client";

import { Banknote, CreditCard, IndianRupee, LayoutDashboard, ReceiptText, Wallet } from "lucide-react";

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
    items: [
      { href: "/accountant/fees", label: "Fees", icon: IndianRupee },
      { href: "/accountant/online-payments", label: "Online payments", icon: CreditCard },
      { href: "/accountant/payroll", label: "Payroll", icon: Banknote },
      { href: "/accountant/payslips", label: "My payslips", icon: ReceiptText },
    ],
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
