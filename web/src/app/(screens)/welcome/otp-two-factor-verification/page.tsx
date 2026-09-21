// SCR-006 · OTP / Two-Factor Verification
// Module: Public Website & Authentication · Role: All Users · Release: Phase 2 · Stories: US-0011 / US-0012
// Mock: screens/SCR-006_OTP_Two_Factor_Verification.html
// Backend: the old frontend served this at /parent/login — Two-step when the school requires it; no tokens without the code
// Wired: POST /api/v1/parent/auth/verify-otp (?challenge= from parent sign-in). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { AuthTop, OtpForm } from "@/features/account/AccountForms";

export const metadata = { title: "SCR-006 · OTP / Two-Factor Verification · BrightCampus" };

export default function Page() {
  return (
    <>
      <div className="auth-page">
        <section className="auth-visual">
          <Link href="/screens" className="brand">
            <span className="brand-mark">
              <Icon name="book" />
            </span>
            <span>
              BrightCampus
              <small>SCHOOL ERP</small>
            </span>
          </Link>
          <div className="auth-copy">
            <h1>
              Every school day.
              <br />
              A little brighter.
            </h1>
            <p>
              One welcoming space for learning, teaching and everything that makes a school thrive.
            </p>
          </div>
          <HeroArt />
          <span className="art-note">BrightCampus · Connected school life</span>
        </section>
        <main className="auth-main">
          <Suspense fallback={null}>
            <AuthTop />
            <OtpForm />
          </Suspense>
          <div className="auth-help">Need help? Contact your school administrator.</div>
        </main>
      </div>
    </>
  );
}
