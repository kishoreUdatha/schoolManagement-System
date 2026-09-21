// SCR-244 · Practical / Lab Booking
// Module: Inventory / Assets / Labs · Role: Store Manager · Release: Phase 3 · Stories: US-0487 / US-0488
// Mock: screens/SCR-244_Practical_Lab_Booking.html
// Backend: the old frontend served this at /school/facilities — Period grid, book, cancel, my bookings
// Wired: GET/POST /api/v1/school/lab-bookings, POST /lab-bookings/{id}/cancel, GET /lab-availability, /labs, /academic-years, /classes. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { LabBookingCalendar } from "@/features/inventory/LabBooking";

export const metadata = { title: "SCR-244 · Practical / Lab Booking · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-244" actions={<Link href="/inventory-labs/practical-lab-booking?new=1" className="btn primary" scroll={false}>
        <Icon name="check" className="sm" />
        Book lab
      </Link>}>
      <Suspense>
        <LabBookingCalendar />
      </Suspense>
    </AppShell>
  );
}
