// SCR-107 · Classroom / Room Management
// Module: Academics & Curriculum · Role: Academic Coordinator · Release: Phase 3 · Stories: US-0213 / US-0214
// Mock: screens/SCR-107_Classroom_Room_Management.html
// Wired: GET/POST /api/v1/school/rooms, PUT/DELETE /rooms/{id}. Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Rooms } from "@/features/academics/Rooms";
import { PageAction } from "@/features/academics/planKit";

export const metadata = { title: "SCR-107 · Classroom / Room Management · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="SCR-107"
      actions={
        <PageAction action="rooms:add" icon="plus" primary>
          Add room
        </PageAction>
      }
    >
      <Suspense>
        <Rooms />
      </Suspense>
    </AppShell>
  );
}
