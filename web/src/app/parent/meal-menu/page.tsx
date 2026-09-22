// PM-053 · Meal menu
// Parent app · Module: Optional services · Release: Phase 2 · ERP: SCR-214
// Feature: View published school meal menu and allergen information when provided.
// Mock: Parent_Mobile_58_Screens/screens/PM-053_meal_menu.html
// Wired: GET /api/v1/parent/me/children/{id}/hostel (menu_today), GET /api/v1/parent/me/children/{id}/health. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { MealMenu } from "@/features/parent/services/MealMenu";

export const metadata = { title: "PM-053 · Meal menu · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={53}>
      <MealMenu />
    </ParentShell>
  );
}
