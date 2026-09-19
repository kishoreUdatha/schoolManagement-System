"use client";

import { DoorOpen, Library, Lock, ReceiptText, UserCog } from "lucide-react";

import { Sidebar, type NavSection } from "@/components/Sidebar";

const sections: NavSection[] = [
  {
    heading: null,
    items: [{ href: "/staff/front-desk", label: "Front desk", icon: DoorOpen }],
  },
  {
    heading: "Account",
    icon: UserCog,
    items: [
      { href: "/staff/payslips", label: "My payslips", icon: ReceiptText },
      { href: "/staff/library", label: "Library books", icon: Library },
      { href: "/staff/change-password", label: "Change password", icon: Lock },
    ],
  },
];

export function StaffNav() {
  return <Sidebar brandTitle="SMS · Staff" portalLabel="Staff" brandHref="/staff" sections={sections} loginPath="/staff/login" />;
}
