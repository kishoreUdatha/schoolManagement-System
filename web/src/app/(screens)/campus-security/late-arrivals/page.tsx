// NEW-105 · Late Arrivals
// Module: Visitor / Gate / Security · Role: Receptionist · Release: Extension
// New screen (no mock)
// Wired: POST/GET /api/v1/school/front-desk/late-arrivals. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { LateArrivals } from "@/features/security/FrontOffice";

export const metadata = { title: "NEW-105 · Late Arrivals · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-105">
      <LateArrivals />
    </AppShell>
  );
}
