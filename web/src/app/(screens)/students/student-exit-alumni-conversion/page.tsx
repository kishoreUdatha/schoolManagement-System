// SCR-070 · Student Exit / Alumni Conversion
// Module: Students · Role: School Admin · Release: Phase 3 · Stories: US-0139 / US-0140
// Mock: screens/SCR-070_Student_Exit_Alumni_Conversion.html
// Wired: POST /api/v1/school/students/{id}/transfer; GET /students, /students/{id}, /library/loans, /student-detail/leavers, /academic-years (?id= optional). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { StudentExit } from "@/features/students/StudentExit";

export const metadata = { title: "SCR-070 · Student Exit / Alumni Conversion · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-070"
      actions={
        <button type="submit" form="exit-form" className="btn primary">
          <Icon name="check" className="sm" />
          Record exit
        </button>
      }
    >
      <Suspense>
        <StudentExit />
      </Suspense>
    </AppShell>
  );
}
