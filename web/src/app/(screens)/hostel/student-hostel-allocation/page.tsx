// SCR-210 · Student Hostel Allocation
// Module: Hostel · Role: Hostel Warden · Release: Phase 3 · Stories: US-0419 / US-0420
// Mock: screens/SCR-210_Student_Hostel_Allocation.html
// Backend: the old frontend served this at /school/hostel/allocations — Register with transfer and vacate
// Wired: GET /api/v1/school/hostels/{id}/residents, /hostels/{id}/rooms; POST /hostels/allocations, /allocations/{id}/transfer, /allocations/{id}/vacate. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { HostelAllocation } from "@/features/hostel/Setup";

export const metadata = { title: "SCR-210 · Student Hostel Allocation · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-210" actions={<Link href="/hostel/student-hostel-allocation?new=1" className="btn primary">
          <Icon name="check" className="sm" />
          Allocate bed
        </Link>}>
      <Suspense>
        <HostelAllocation />
      </Suspense>
    </AppShell>
  );
}
