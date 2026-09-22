// PM-039 · Book a PTM
// Parent app · Module: Events & PTM · Release: MVP · ERP: SCR-251
// Feature: Reserve an available teacher appointment without double-booking.
// Mock: Parent_Mobile_58_Screens/screens/PM-039_book_a_ptm.html
// Wired: GET /api/v1/parent/me/ptm, POST /api/v1/parent/me/ptm/book. Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { BookPtm } from "@/features/parent/events/BookPtm";

export const metadata = { title: "PM-039 · Book a PTM · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={39}>
      <Suspense>
        <BookPtm />
      </Suspense>
    </ParentShell>
  );
}
