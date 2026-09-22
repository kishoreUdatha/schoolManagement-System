// PM-048 · App settings
// Parent app · Module: Account · Release: MVP · ERP: SCR-075 / SCR-291 / SCR-293
// Feature: Manage language, notification categories and session preferences.
// Mock: Parent_Mobile_58_Screens/screens/PM-048_app_settings.html
// Wired: GET/PUT /api/v1/parent/me/preferences, POST /api/v1/account/change-password. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { AppSettings } from "@/features/parent/account/AppSettings";

export const metadata = { title: "PM-048 · App settings · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={48}>
      <AppSettings />
    </ParentShell>
  );
}
