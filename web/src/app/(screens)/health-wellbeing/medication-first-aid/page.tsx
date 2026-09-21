// SCR-219 · Medication / First Aid
// Module: Health / Counselling / Discipline · Role: Nurse / Medical Officer · Release: Phase 3 · Stories: US-0437 / US-0438
// Mock: screens/SCR-219_Medication_First_Aid.html
// Backend: the old frontend served this at /school/health/medication — Append-only; a correction supersedes rather than edits
// Wired: GET/POST /api/v1/school/wellbeing/medication, POST /medication/{id}/correct, GET/POST /wellbeing/first-aid. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { MedicationFirstAid } from "@/features/health/Clinic";

export const metadata = { title: "SCR-219 · Medication / First Aid · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-219" actions={<button type="submit" form="dose-form" className="btn primary">
          <Icon name="check" className="sm" />
          Record administration
        </button>}>
      <Suspense>
        <MedicationFirstAid />
      </Suspense>
    </AppShell>
  );
}
