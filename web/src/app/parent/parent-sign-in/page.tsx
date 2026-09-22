// PM-002 · Parent sign in
// Parent app · Module: Access · Release: MVP · ERP: SCR-003 / SCR-076
// Feature: Sign in with the account the school gave the parent.
// Mock: Parent_Mobile_58_Screens/screens/PM-002_parent_sign_in.html
// Wired: POST /api/v1/parent/auth/login, then /parent/auth/verify-otp when the server asks. Hand-maintained.

import { Suspense } from "react";
import { ParentShell } from "@/components/parent/ParentShell";
import { ParentSignIn } from "@/features/parent/signin/ParentSignIn";

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
