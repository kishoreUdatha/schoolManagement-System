// PM-008 · Student profile
// Parent app · Module: Home & profile · Release: MVP · ERP: SCR-057 / SCR-059
// Feature: View verified student details and request corrections.
// Mock: Parent_Mobile_58_Screens/screens/PM-008_student_profile.html
// Wired: GET /api/v1/parent/me/children/{id}/profile, GET /api/v1/branding/me. Hand-maintained.
// Not wired: class teacher — not in the profile response.

import { ParentShell } from "@/components/parent/ParentShell";
import { StudentProfile } from "@/features/parent/home/StudentProfile";

export const metadata = { title: "PM-008 · Student profile · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={8}>
      <StudentProfile />
    </ParentShell>
  );
}
