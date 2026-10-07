// NEW-108 · Counsellor Referrals
// Module: Health / Counselling / Discipline · Role: Teacher · Release: Extension
// New screen (no mock)
// Wired: GET/POST /api/v1/school/discipline/counselling/cases (a teacher's own referrals). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { CounsellorReferrals } from "@/features/teacher/CounsellorReferrals";

export const metadata = { title: "NEW-108 · Counsellor Referrals · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-108">
      <Suspense>
        <CounsellorReferrals />
      </Suspense>
    </AppShell>
  );
}
