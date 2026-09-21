// SCR-225 · Emergency Contacts & Escalation
// Module: Health / Counselling / Discipline · Role: Nurse / Medical Officer · Release: Phase 3 · Stories: US-0449 / US-0450
// Mock: screens/SCR-225_Emergency_Contacts_Escalation.html
// Backend: the old frontend served this at /school/health/emergency — Ordered chain that renumbers when one is removed
// Wired: GET /api/v1/school/wellbeing/emergency/thin, GET/POST /wellbeing/emergency/{student_id} (?id=), PUT …/order, DELETE /wellbeing/emergency/contacts/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { EmergencyContacts, IdAction } from "@/features/health/Pastoral";

export const metadata = { title: "SCR-225 · Emergency Contacts & Escalation · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-225" actions={<Suspense>
        <IdAction screen={225} extra="new=1" icon="plus">
          Add contact
        </IdAction>
      </Suspense>}>
      <Suspense>
        <EmergencyContacts />
      </Suspense>
    </AppShell>
  );
}
