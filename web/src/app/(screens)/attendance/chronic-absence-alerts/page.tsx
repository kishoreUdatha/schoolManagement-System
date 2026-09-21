// SCR-118 · Chronic Absence Alerts
// Module: Student Attendance · Role: School Admin · Release: Phase 3 · Stories: US-0235 / US-0236
// Mock: screens/SCR-118_Chronic_Absence_Alerts.html
// Wired: GET /api/v1/school/attendance-ops/at-risk (?below&days), GET /school/attendance-ops/contacts/{student_id}, POST /school/attendance-ops/contacts. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ChronicAbsence } from "@/features/attendance/ChronicAbsence";

export const metadata = { title: "SCR-118 · Chronic Absence Alerts · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-118"
      actions={
        <Link href="/communication/messaging-inbox" className="btn primary">
          <Icon name="arrow" className="sm" />
          Contact parent
        </Link>
      }
    >
      <Suspense>
        <ChronicAbsence />
      </Suspense>
    </AppShell>
  );
}
