// SCR-071 · Parent / Guardian Directory
// Module: Parents & Guardians · Role: School Admin · Release: MVP · Stories: US-0141 / US-0142
// Mock: screens/SCR-071_Parent_Guardian_Directory.html
// Backend: the old frontend served this at /school/parents — Search, status filter, linked children
// Wired: GET /api/v1/school/parents (status, search), /academic-years, /classes. Hand-maintained.

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { AppShell } from "@/components/shell/AppShell";
import { ParentDirectory } from "@/features/parents/ParentDirectory";

export const metadata = { title: "SCR-071 · Parent / Guardian Directory · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-071" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/parents/add-parent-guardian" className="btn primary">
          <Icon name="plus" className="sm" />
          Add guardian
        </Link>
      </>}>
      <ParentDirectory />
    </AppShell>
  );
}
