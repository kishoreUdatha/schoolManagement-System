// SCR-025 · Branches List
// Module: Organization / School / Branch Setup · Role: Super Admin · Release: MVP · Stories: US-0049 / US-0050
// Mock: screens/SCR-025_Branches_List.html
// Wired: GET /api/v1/school/branches, /school/profile. Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { BranchesList } from "@/features/setup/Branches";

export const metadata = { title: "SCR-025 · Branches List · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-025" actions={<>
        <button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          Export
        </button>
        <Link href="/school-setup/add-branch" className="btn primary">
          <Icon name="plus" className="sm" />
          Add branch
        </Link>
      </>}>
      <BranchesList />
    </AppShell>
  );
}
