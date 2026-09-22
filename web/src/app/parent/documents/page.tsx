// PM-041 · Documents
// Parent app · Module: Documents · Release: MVP · ERP: SCR-063 / SCR-257
// Feature: Access documents released to parent and upload requested student documents.
// Mock: Parent_Mobile_58_Screens/screens/PM-041_documents.html
// Wired: GET/POST /api/v1/parent/me/children/{id}/documents, DELETE …/documents/{doc}, GET …/documents/{doc}/file, GET /api/v1/parent/me/children/{id}/certificates, GET …/certificates/{cert}/pdf. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { ChildDocuments } from "@/features/parent/documents/ChildDocuments";

export const metadata = { title: "PM-041 · Documents · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={41}>
      <ChildDocuments />
    </ParentShell>
  );
}
