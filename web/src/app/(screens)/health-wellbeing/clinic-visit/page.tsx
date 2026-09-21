// SCR-218 · Clinic Visit
// Module: Health / Counselling / Discipline · Role: Nurse / Medical Officer · Release: Phase 2 · Stories: US-0435 / US-0436
// Mock: screens/SCR-218_Clinic_Visit.html
// Backend: the old frontend served this at /school/health — Complaint, temperature, outcome, parent notice
// Wired: POST /api/v1/school/health/visits; GET /health/visits?on=today, /health/students/{id} (allergy check), /students (search). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ClinicVisitForm } from "@/features/health/Clinic";

export const metadata = { title: "SCR-218 · Clinic Visit · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-218" actions={<button type="submit" form="visit-form" className="btn primary">
          <Icon name="check" className="sm" />
          Save clinic visit
        </button>}>
      <Suspense>
        <ClinicVisitForm />
      </Suspense>
    </AppShell>
  );
}
