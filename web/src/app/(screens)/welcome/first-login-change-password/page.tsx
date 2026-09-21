// SCR-007 · First Login / Change Password
// Module: Public Website & Authentication · Role: All Users · Release: Phase 2 · Stories: US-0013 / US-0014
// Mock: screens/SCR-007_First_Login_Change_Password.html
// Backend: the old frontend served this at /account/change-password — Every guard forces it when somebody else set the password
// Wired: POST /api/v1/account/change-password (clears must_change_password for every role). Hand-maintained.

import Link from "next/link";
import { Suspense } from "react";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { AuthTop, ChangePasswordForm } from "@/features/account/AccountForms";

export const metadata = { title: "SCR-007 · First Login / Change Password · BrightCampus" };

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
            <ChangePasswordForm />
          </Suspense>
          <div className="auth-help">Need help? Contact your school administrator.</div>
        </main>
      </div>
    </>
  );
}
