// PM-101 · Online tests
// Parent app · Module: Learning · Release: Phase 2 · ERP: NEW-023
// Feature: See the child's online tests, start or resume one, and read results the school has released.
// Mock: none (the Parent Mobile pack has no online test screen); built in the pack's style.
// Wired: GET /api/v1/parent/me/children/{id}/tests, POST …/tests/{test_id}/start. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { OnlineTests } from "@/features/parent/learning/OnlineTests";

export const metadata = { title: "PM-101 · Online tests · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={101}>
      <OnlineTests />
    </ParentShell>
  );
}
