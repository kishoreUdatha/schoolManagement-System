// NEW-041 · Generate Fees
// Module: Fees & Finance · Role: Accountant · Release: Extension
// New screen (no mock)
// Wired: POST /api/v1/school/fees/generate, POST /transport/fees/generate; GET /fees/structures, /fees/heads, /classes, /academic-years, /fees/student-fees (count for the month). Hostel fees stay on SCR-215. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { Icon } from "@/components/ui/Icon";
import { ClientOnly } from "@/features/fees/common";
import { GenerateFees } from "@/features/fees/GenerateFees";

export const metadata = { title: "NEW-041 · Generate Fees · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-041" actions={<button type="submit" form="generate-fees-form" className="btn primary">
        <Icon name="check" className="sm" />
        Generate fees
      </button>}>
      <ClientOnly>
        <GenerateFees />
      </ClientOnly>
    </AppShell>
  );
}
