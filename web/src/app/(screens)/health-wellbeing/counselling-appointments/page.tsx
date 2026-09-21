// SCR-221 · Counselling Appointments
// Module: Health / Counselling / Discipline · Role: Nurse / Medical Officer · Release: Phase 3 · Stories: US-0441 / US-0442
// Mock: screens/SCR-221_Counselling_Appointments.html
// Backend: the old frontend served this at /school/counselling/diary — Private notes never selected, not filtered later
// Wired: GET/POST /api/v1/school/wellbeing/counselling/appointments, PATCH /appointments/{id}, GET /appointments/{id}/private-note (on request); GET /directory/staff. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { CounsellingCalendar } from "@/features/health/Pastoral";

export const metadata = { title: "SCR-221 · Counselling Appointments · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-221" actions={<Link href="/health-wellbeing/counselling-appointments?new=1" className="btn primary">
          <Icon name="check" className="sm" />
          Book appointment
        </Link>}>
      <Suspense>
        <CounsellingCalendar />
      </Suspense>
    </AppShell>
  );
}
