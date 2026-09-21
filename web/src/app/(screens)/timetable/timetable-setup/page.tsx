// SCR-121 · Timetable Setup
// Module: Timetable & Substitution · Role: Academic Coordinator · Release: MVP · Stories: US-0241 / US-0242
// Mock: screens/SCR-121_Timetable_Setup.html
// Wired: GET /api/v1/school/sections/{id}/timetable, PUT/DELETE …/timetable/{period_id}, POST …/timetable/copy|publish|unpublish, GET /classes/{id}/subjects, /exam-ops/rooms (?section=). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { routeOf } from "@/lib/screens";
import { SectionWeek } from "@/features/timetable/SectionWeek";

export const metadata = { title: "SCR-121 · Timetable Setup · BrightCampus" };

export default function Page() {
  // Each slot saves as it is set, so the head offers the generator rather than a "Save" with nothing to save.
  return (
    <AppShell
      screen="SCR-121"
      actions={
        <Link href={routeOf(124)} className="btn primary">
          <Icon name="check" className="sm" />
          Generate timetable
        </Link>
      }
    >
      <Suspense>
        <SectionWeek mode="edit" />
      </Suspense>
    </AppShell>
  );
}
