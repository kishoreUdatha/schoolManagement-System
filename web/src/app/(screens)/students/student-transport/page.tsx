// SCR-066 · Student Transport
// Module: Students · Role: School Admin · Release: Phase 3 · Stories: US-0131 / US-0132
// Mock: screens/SCR-066_Student_Transport.html
// Wired: GET /api/v1/school/transport/assignments?search=, /transport/routes/{id}, /transport/vehicles/{id}, /transport/trips?route_id=&on=, /students/{id} (?id=). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { StudentTransport } from "@/features/students/StudentTransport";

export const metadata = { title: "SCR-066 · Student Transport · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-066"
      actions={
        <Link href="/transport/student-route-assignment" className="btn primary">
          <Icon name="arrow" className="sm" />
          Change route
        </Link>
      }
    >
      <Suspense>
        <StudentTransport />
      </Suspense>
    </AppShell>
  );
}
