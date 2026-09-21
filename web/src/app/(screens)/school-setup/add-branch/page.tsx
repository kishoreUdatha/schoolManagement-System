// SCR-026 · Add Branch
// Module: Organization / School / Branch Setup · Role: Super Admin · Release: MVP · Stories: US-0051 / US-0052
// Mock: screens/SCR-026_Add_Branch.html
// Wired: POST /api/v1/school/branches, PUT /branches/{id} (?id= edits), GET /branches, /directory/staff, /profile, /academic-years. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { BranchForm } from "@/features/setup/Branches";
import { SubmitFor } from "@/features/setup/bits";

export const metadata = { title: "SCR-026 · Add Branch · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-026" actions={<SubmitFor form="branch-form">Save branch</SubmitFor>}>
      <Suspense>
        <BranchForm />
      </Suspense>
    </AppShell>
  );
}
