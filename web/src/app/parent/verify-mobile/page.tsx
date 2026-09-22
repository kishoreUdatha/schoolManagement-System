// PM-003 · Verify mobile
// Parent app · Module: Access · Release: MVP · ERP: SCR-006
// Feature: Verify OTP and establish an authenticated session.
// Mock: Parent_Mobile_58_Screens/screens/PM-003_verify_mobile.html
// Wired: POST /api/v1/parent/auth/verify-otp (challenge from PM-002's login, kept in sessionStorage); session.set, then ?next= or /parent/home. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { VerifyOtp } from "@/features/parent/access/VerifyOtp";

export const metadata = { title: "PM-003 · Verify mobile · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={3}>
      <VerifyOtp />
    </ParentShell>
  );
}
