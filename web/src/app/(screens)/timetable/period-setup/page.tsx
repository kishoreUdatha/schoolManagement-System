// SCR-122 · Period Setup
// Module: Timetable & Substitution · Role: Academic Coordinator · Release: MVP · Stories: US-0243 / US-0244
// Mock: screens/SCR-122_Period_Setup.html
// Wired: GET/POST /api/v1/school/periods, PATCH/DELETE /periods/{id} (?id= to edit). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { PeriodSetup } from "@/features/timetable/PeriodSetup";

export const metadata = { title: "SCR-122 · Period Setup · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-122"
      actions={
        <button type="submit" form="period-form" className="btn primary">
          <Icon name="check" className="sm" />
          Save period
        </button>
      }
    >
      <Suspense>
        <PeriodSetup />
      </Suspense>
    </AppShell>
  );
}
