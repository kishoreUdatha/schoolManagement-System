// SCR-072 · Add Parent / Guardian
// Module: Parents & Guardians · Role: School Admin · Release: MVP · Stories: US-0143 / US-0144
// Mock: screens/SCR-072_Add_Parent_Guardian.html
// Backend: the old frontend served this at /school/parents — Creates login, links a child, temp password
// Wired: POST /api/v1/school/parents; with ?id=, GET + PATCH /api/v1/school/parents/{id}; GET /students. Hand-maintained.

import { Suspense } from "react";
import { Icon } from "@/components/ui/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { ParentForm } from "@/features/parents/ParentForm";

export const metadata = { title: "SCR-072 · Add Parent / Guardian · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-072" actions={<button type="submit" form="parent-form" className="btn primary">
        <Icon name="check" className="sm" />
        Save guardian
      </button>}>
      <Suspense>
        <ParentForm />
      </Suspense>
    </AppShell>
  );
}
