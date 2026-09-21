// SCR-120 · Timetable Dashboard
// Module: Timetable & Substitution · Role: Academic Coordinator · Release: MVP · Stories: US-0239 / US-0240
// Mock: screens/SCR-120_Timetable_Dashboard.html
// Wired: GET /api/v1/school/timetable-gen/dashboard, /timetable-gen/coordinator?day_of_week=, /cover/day?date=. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { routeOf } from "@/lib/screens";
import { TimetableDashboard } from "@/features/timetable/TimetableDashboard";

export const metadata = { title: "SCR-120 · Timetable Dashboard · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-120"
      actions={
        <Link href={routeOf(125)} className="btn primary">
          <Icon name="arrow" className="sm" />
          View timetable
        </Link>
      }
    >
      <Suspense>
        <TimetableDashboard />
      </Suspense>
    </AppShell>
  );
}
