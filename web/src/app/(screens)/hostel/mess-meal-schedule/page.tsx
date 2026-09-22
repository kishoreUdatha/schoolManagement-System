// SCR-214 · Mess / Meal Schedule
// Module: Hostel · Role: Hostel Warden · Release: Phase 3 · Stories: US-0427 / US-0428
// Mock: screens/SCR-214_Mess_Meal_Schedule.html
// Backend: the old frontend served this at /school/hostel — Seven-day, four-meal editable grid
// Wired: GET + PUT /api/v1/school/hostels/{id}/menu; day-school canteen GET + PUT /api/v1/school/parent-services/canteen-menu. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { MessMenu } from "@/features/hostel/Daily";
import { CanteenMenu } from "@/features/hostel/CanteenMenu";

export const metadata = { title: "SCR-214 · Mess / Meal Schedule · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-214" actions={<button type="submit" form="menu-form" className="btn primary">
          <Icon name="check" className="sm" />
          Save meal plan
        </button>}>
      <Suspense>
        <MessMenu />
      </Suspense>
      <CanteenMenu />
    </AppShell>
  );
}
