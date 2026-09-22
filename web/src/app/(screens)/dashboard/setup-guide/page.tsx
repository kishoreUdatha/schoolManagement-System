// NEW-084 · Setup Guide
// Module: Role Dashboards · Role: School Admin · Release: Extension
// New screen (no mock)
// Wired: reads the school's profile, years, terms, classes, subjects, periods, grade scales, staff, fees, students, payment gateway and WhatsApp to tick steps off; one-click steps post to the same endpoints the screens use. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { ClientOnly } from "@/features/fees/common";
import { SetupGuide } from "@/features/setup/SetupGuide";

export const metadata = { title: "NEW-084 · Setup Guide · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-084">
      <ClientOnly>
        <SetupGuide />
      </ClientOnly>
    </AppShell>
  );
}
