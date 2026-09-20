"use client";

import { Bell, CalendarHeart, CalendarRange, Handshake, Images, LayoutDashboard, MessageSquare, PartyPopper, SlidersHorizontal } from "lucide-react";
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
        { href: "/parent/calendar", label: "Calendar", icon: CalendarRange },
        { href: "/parent/events", label: "Events", icon: CalendarHeart },
        { href: "/parent/meetings", label: "Teacher meetings", icon: Handshake },
        { href: "/parent/gallery", label: "Photo gallery", icon: Images },
        { href: "/parent/holidays", label: "Holidays", icon: PartyPopper },
        { href: "/parent/preferences", label: "What we send you", icon: SlidersHorizontal },
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
