"use client";

import { Bell, LayoutDashboard, MessageSquare, PartyPopper } from "lucide-react";
import { useEffect, useState } from "react";

import { NavBadge, Sidebar, type NavSection } from "@/components/Sidebar";
import { api } from "@/lib/api";

export function ParentNav() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api
      .get<{ unread: number }>("/api/v1/parent/me/notices/unread-count")
      .then((r) => setUnread(r.data.unread))
      .catch(() => {});
  }, []);

  const sections: NavSection[] = [
    {
      heading: null,
      items: [
        { href: "/parent", label: "Dashboard", icon: LayoutDashboard, exact: true },
        {
          href: "/parent/notices",
          label: "Notices",
          icon: Bell,
          badge: unread > 0 ? <NavBadge>{unread}</NavBadge> : undefined,
        },
        { href: "/parent/messages", label: "Messages", icon: MessageSquare },
        { href: "/parent/holidays", label: "Holidays", icon: PartyPopper },
      ],
    },
  ];

  return (
    <Sidebar
      brandTitle="SMS · Parent"
      portalLabel="Parent"
      brandHref="/parent"
      sections={sections}
      loginPath="/parent/login"
    />
  );
}
