// SCR-142 · Hall / Room Allocation
// Module: Examinations / Marks / Results · Role: Exam Coordinator · Release: MVP · Stories: US-0283 / US-0284
// Mock: screens/SCR-142_Hall_Room_Allocation.html
// Backend: the old frontend served this at /school/exams/[id]/halls — Room allocation, fills in order, move a child
// Wired: GET /api/v1/school/exam-ops/rooms, GET/POST/DELETE /school/exam-ops/papers/{id}/allocation, POST …/allocation/move, GET …/invigilators (?id=&paper=). Hand-maintained.

import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { HallAllocation } from "@/features/examinations/HallAllocation";

export const metadata = { title: "SCR-142 · Hall / Room Allocation · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-142">
      <Suspense>
        <HallAllocation />
      </Suspense>
    </AppShell>
  );
}
