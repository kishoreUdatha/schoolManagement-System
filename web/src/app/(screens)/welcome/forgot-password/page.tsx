// SCR-004 · Forgot Password
// Module: Public Website & Authentication · Role: All Users · Release: MVP · Stories: US-0007 / US-0008
// Mock: screens/SCR-004_Forgot_Password.html
// Backend: the old frontend served this at /account/forgot-password — Same answer whether the account exists or not
// Wired: POST /api/v1/account/forgot-password (?role= narrows the account). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { AuthTop, ForgotPasswordForm } from "@/features/account/AccountForms";

export const metadata = { title: "SCR-004 · Forgot Password · BrightCampus" };

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
            <ForgotPasswordForm />
          </Suspense>
          <div className="auth-help">Need help? Contact your school administrator.</div>
        </main>
      </div>
    </>
  );
}
