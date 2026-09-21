// SCR-005 · Reset Password
// Module: Public Website & Authentication · Role: All Users · Release: MVP · Stories: US-0009 / US-0010
// Mock: screens/SCR-005_Reset_Password.html
// Backend: the old frontend served this at /account/reset-password — Code dies on use, on reissue and after five guesses
// Wired: POST /api/v1/account/reset-password (?email= and ?token= from the email link). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { AuthTop, ResetPasswordForm } from "@/features/account/AccountForms";

export const metadata = { title: "SCR-005 · Reset Password · BrightCampus" };

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
            <ResetPasswordForm />
          </Suspense>
          <div className="auth-help">Need help? Contact your school administrator.</div>
        </main>
      </div>
    </>
  );
}
