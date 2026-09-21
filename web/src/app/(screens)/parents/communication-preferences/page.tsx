// SCR-075 · Communication Preferences
// Module: Parents & Guardians · Role: School Admin · Release: Phase 2 · Stories: US-0149 / US-0150
// Mock: screens/SCR-075_Communication_Preferences.html
// Backend: the old frontend served this at /parent/preferences — Opt-out, and attendance and fees cannot be silenced
// Wired: GET + PUT /api/v1/parent/me/preferences (parent sign-in only). Hand-maintained.

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { CommunicationPreferences } from "@/features/parents/CommunicationPreferences";

export const metadata = { title: "SCR-075 · Communication Preferences · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="SCR-075">
      <div className="settings-layout">
        <nav className="settings-nav">
          <Link href="/settings/school-settings" className="">School profile</Link>
          <Link href="/settings/academic-settings" className="">Academic settings</Link>
          <Link href="/settings/notification-settings" className="">Notifications</Link>
          <Link href="/settings/roles" className="">{"Roles & permissions"}</Link>
          <Link href="/settings/integration-api-settings" className="">Integrations</Link>
          <Link href="/settings/security-password-policy" className="">Security</Link>
          <Link href="/settings/audit-logs" className="">Audit log</Link>
        </nav>
        <div>
          <CommunicationPreferences />
        </div>
      </div>
    </AppShell>
  );
}
