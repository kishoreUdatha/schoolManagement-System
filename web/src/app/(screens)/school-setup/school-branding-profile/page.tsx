// SCR-032 · School Branding & Profile
// Module: Organization / School / Branch Setup · Role: Super Admin · Release: Phase 3 · Stories: US-0063 / US-0064
// Mock: screens/SCR-032_School_Branding_Profile.html
// Wired: GET/PATCH /api/v1/school/profile. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { SchoolBranding } from "@/features/setup/SchoolProfile";
import { SubmitFor } from "@/features/setup/bits";

export const metadata = { title: "SCR-032 · School Branding & Profile · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-032" actions={<SubmitFor form="branding-form">Save branding</SubmitFor>}>
      <SchoolBranding />
    </AppShell>
  );
}
