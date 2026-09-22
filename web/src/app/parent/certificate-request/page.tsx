// PM-042 · Certificate request
// Parent app · Module: Documents · Release: Phase 2 · ERP: SCR-261 / SCR-262 / SCR-263
// Feature: Request school-issued certificates and track approval.
// Mock: Parent_Mobile_58_Screens/screens/PM-042_certificate_request.html
// Wired: GET /api/v1/parent/me/children/{id}/certificates/available, GET/POST /api/v1/parent/me/children/{id}/certificates, GET …/certificates/{cert}/pdf. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { CertificateRequest } from "@/features/parent/documents/CertificateRequest";

export const metadata = { title: "PM-042 · Certificate request · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={42}>
      <CertificateRequest />
    </ParentShell>
  );
}
