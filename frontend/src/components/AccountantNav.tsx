"use client";

import { Banknote, Calculator, CreditCard, HandCoins, IndianRupee, LayoutDashboard, Package, ReceiptText, Wallet } from "lucide-react";

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
      { href: "/accountant/late-refunds", label: "Late fees & refunds", icon: HandCoins },
      { href: "/accountant/accounts", label: "Accounts", icon: Calculator },
      { href: "/accountant/payroll", label: "Payroll", icon: Banknote },
      { href: "/accountant/inventory", label: "Inventory & store", icon: Package },
      { href: "/accountant/payslips", label: "My payslips", icon: ReceiptText },
    ],
  },
];

export function AccountantNav() {
  return (
    <Sidebar
      showSchool
      brandTitle="SMS · Accountant"
      portalLabel="Accountant"
      brandHref="/accountant"
      sections={sections}
      loginPath="/accountant/login"
    />
  );
}
