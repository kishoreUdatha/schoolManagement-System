// SCR-163 · Concession / Scholarship
// Module: Fees & Finance · Role: Accountant · Release: Phase 2 · Stories: US-0325 / US-0326
// Mock: screens/SCR-163_Concession_Scholarship.html
// Backend: the old frontend served this at /school/accounts — Concessions: add, amend, end
// Wired: GET/POST /api/v1/school/accounts/concessions, PATCH /concessions/{id}, POST /concessions/{id}/end, /approve, /reject, GET /fees/heads, /directory/students. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { Concessions } from "@/features/fees/Concessions";

export const metadata = { title: "SCR-163 · Concession / Scholarship · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-163">
      <ClientOnly>
        <Concessions />
      </ClientOnly>
    </AppShell>
  );
}
