// PM-002 · Parent sign in
// Parent app · Module: Access · Release: MVP · ERP: SCR-003 / SCR-076
// Feature: Sign in using the mobile number registered with school.
// Mock: Parent_Mobile_58_Screens/screens/PM-002_parent_sign_in.html
// Wired: POST /api/v1/parent/auth/login (email + password; `otp_required` hands over to PM-003); session.set, then ?next= or /parent/home. Hand-maintained.
// Not wired: school code + mobile number sign-in — the backend signs parents in by email and password.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { ParentSignIn } from "@/features/parent/access/ParentSignIn";

export const metadata = { title: "PM-002 · Parent sign in · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={2}>
      <Suspense>
        <ParentSignIn />
      </Suspense>
    </ParentShell>
  );
}
