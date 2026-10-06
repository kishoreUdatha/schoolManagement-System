// NEW-003 · Admission Form Fields
// Module: Admissions & Enquiries · Role: School Admin · Release: Extension
// New screen (no mock): the full admission form's required and not-asked fields, per class
// Wired: GET/PUT /api/v1/school/admission-form/settings, DELETE /admission-form/settings/{class_id}, /school/classes. Hand-maintained.

import { AppShell } from "@/components/shell/AppShell";
import { AdmissionFormSettings } from "@/features/admissions/AdmissionFormSettings";
import { ClientOnly } from "@/features/fees/common";

export const metadata = { title: "NEW-003 · Admission Form Fields · BrightCampus" };

export default function Page() {
  return (
    <AppShell screen="NEW-003">
      <ClientOnly>
        <AdmissionFormSettings />
      </ClientOnly>
    </AppShell>
  );
}
