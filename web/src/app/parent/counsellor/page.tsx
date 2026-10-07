// PM-104 · Talk to the counsellor
// Wired: GET/POST /api/v1/parent/me/children/{id}/counselling-requests. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { ParentCounsellor } from "@/features/parent/support/Counsellor";

export const metadata = { title: "PM-104 · Talk to the counsellor · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={104}>
      <ParentCounsellor />
    </ParentShell>
  );
}
