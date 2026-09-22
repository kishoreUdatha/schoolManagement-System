// PM-051 · Library loans
// Parent app · Module: Optional services · Release: Phase 2 · ERP: SCR-067 / SCR-204 / SCR-205
// Feature: View child’s library loans, due dates and renewal requests when enabled.
// Mock: Parent_Mobile_58_Screens/screens/PM-051_library_loans.html
// Wired: GET /api/v1/parent/me/children/{id}/library, POST /api/v1/parent/me/children/{id}/library/renewal-requests, GET /api/v1/parent/me/requests?kind=library_renewal. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { LibraryLoans } from "@/features/parent/services/LibraryLoans";

export const metadata = { title: "PM-051 · Library loans · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={51}>
      <LibraryLoans />
    </ParentShell>
  );
}
