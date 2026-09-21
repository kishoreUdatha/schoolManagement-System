// NEW-020 · Holidays
// Module: Academics & Curriculum · Role: School Admin · Release: Extension
// New screen (no mock)
// Backend: the old frontend served this at /school/holidays — Year list, add, edit, delete
// Wired: GET/POST /api/v1/school/holidays (?year=, ?upcoming=), PATCH/DELETE /holidays/{id}. Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { Holidays } from "@/features/holidays/Holidays";

export const metadata = { title: "NEW-020 · Holidays · BrightCampus" };

export default function Page() {
  return (
    <AppShell
      screen="NEW-020"
      actions={
        <Link href="/academics/holidays?new=1" className="btn primary" scroll={false}>
          <Icon name="plus" className="sm" />
          Add holiday
        </Link>
      }
    >
      <Suspense>
        <Holidays />
      </Suspense>
    </AppShell>
  );
}
