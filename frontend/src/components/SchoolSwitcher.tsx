"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { api } from "@/lib/api";

type Profile = { name: string; code?: string | null; address?: string | null };

/** Which school you are in, under the brand.
 *
 *  Reads /branding/me rather than /school/profile: the profile endpoint is
 *  admin-only, so on a teacher's sidebar this would have silently rendered
 *  nothing. Branding is the one school read every role already has.
 *
 *  One school per login today — a user row carries a single school_id and
 *  nothing lets somebody move between them — so this names where you are
 *  rather than offering a list with one entry in it.
 */
export function SchoolSwitcher() {
  const [school, setSchool] = useState<Profile | null>(null);

  useEffect(() => {
    api
      .get<Profile>("/api/v1/branding/me")
      .then((r) => setSchool(r.data))
      .catch(() => setSchool(null));
  }, []);

  if (!school) return null;

  const initials = school.name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // The first line of the address is the campus; the rest is postal detail
  // nobody needs in a sidebar.
  const where = school.address?.split(",").slice(0, 2).join(",").trim();

  return (
    <div className="mx-4 mb-4 mt-1 flex items-center gap-2.5 rounded-[11px] border border-sidebar-border bg-surface-subtle px-3 py-2.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-[10px] font-extrabold text-white">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-extrabold text-sidebar-ink">{school.name}</div>
        {where && <div className="truncate text-[10px] text-ink-muted">{where}</div>}
      </div>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-subtle opacity-40" aria-hidden="true" />
    </div>
  );
}
