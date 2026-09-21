// SCR-069 · Promotion / Transfer
// Module: Students · Role: School Admin · Release: Phase 3 · Stories: US-0137 / US-0138
// Mock: screens/SCR-069_Promotion_Transfer.html
// Wired: GET /api/v1/school/academic-years, /classes, /students (section roster); POST /students/promote. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { StudentPromotion } from "@/features/students/StudentPromotion";

export const metadata = { title: "SCR-069 · Promotion / Transfer · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-069">
      <StudentPromotion />
    </AppShell>
  );
}
