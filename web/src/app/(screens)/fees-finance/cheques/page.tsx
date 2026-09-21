// NEW-045 · Cheques
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock)
// Wired: GET/POST /api/v1/school/accounts/cheques, POST /accounts/cheques/{id}/action; GET /fees/student-fees, /fees/heads, /directory/students. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ClientOnly } from "@/features/fees/common";
import { Cheques } from "@/features/fees/Cheques";

export const metadata = { title: "NEW-045 · Cheques · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-045" actions={<Link href="/fees-finance/cheques?new=1" className="btn primary">
        <Icon name="plus" className="sm" />
        Record cheque
      </Link>}>
      <Suspense>
        <ClientOnly>
          <Cheques />
        </ClientOnly>
      </Suspense>
    </AppShell>
  );
}
