// PM-102 · Online test
// Parent app · Module: Learning · Release: Phase 2 · ERP: NEW-023
// Feature: Take an online test with the child: answers save as they go, and it submits on time.
// Mock: none (the Parent Mobile pack has no online test screen); built in the pack's style.
// Wired: GET /api/v1/parent/me/test-attempts/{id}, PUT …/answers, POST …/submit, GET …/result. ?attempt= is the attempt id. Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { OnlineTest } from "@/features/parent/learning/OnlineTests";

export const metadata = { title: "PM-102 · Online test · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={102}>
      <Suspense>
        <OnlineTest />
      </Suspense>
    </ParentShell>
  );
}
