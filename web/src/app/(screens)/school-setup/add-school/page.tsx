// SCR-023 · Add School
// Module: Organization / School / Branch Setup · Role: Super Admin · Release: MVP · Stories: US-0045 / US-0046
// Mock: screens/SCR-023_Add_School.html
// Wired: POST /api/v1/super-admin/tenants (school, organisation and first administrator together). Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { SubmitFor } from "@/features/setup/bits";
import { AddSchool } from "@/features/setup/Organizations";

export const metadata = { title: "SCR-023 · Add School · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-023" actions={<SubmitFor form="school-form">Create school</SubmitFor>}>
      <AddSchool />
    </AppShell>
  );
}
