// SCR-193 · Student Route Assignment
// Module: Transport / Bus / GPS · Role: Transport Manager · Release: Phase 3 · Stories: US-0385 / US-0386
// Mock: screens/SCR-193_Student_Route_Assignment.html
// Backend: the old frontend served this at /school/transport/students — Assign, move, end with route and stop
// Wired: GET/POST /api/v1/school/transport/assignments, PATCH /assignments/{id}, POST /assignments/{id}/end; GET /transport/routes, /students (search). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { RouteAssignment } from "@/features/transport/People";

export const metadata = { title: "SCR-193 · Student Route Assignment · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-193" actions={<Link href="/transport/student-route-assignment?new=1" className="btn primary">
          <Icon name="check" className="sm" />
          Assign route
        </Link>}>
      <Suspense>
        <RouteAssignment />
      </Suspense>
    </AppShell>
  );
}
