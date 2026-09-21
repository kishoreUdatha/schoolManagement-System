// SCR-003 · Sign In
// Module: Public Website & Authentication · Role: All Users · Release: MVP · Stories: US-0005 / US-0006
// Mock: screens/SCR-003_Sign_In.html
// Backend: the old frontend served this at /school/login and six other portals — Seven sign-in pages, each posts auth/login
// Wired: posts to /api/v1/<portal>/auth/login (and verify-otp for parents). Hand-maintained; listed in KEEP.

import Link from "next/link";
import { Suspense } from "react";
import { SignInForm, WorkspaceLine } from "@/components/auth/SignInForm";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";

export const metadata = { title: "SCR-003 · Sign In · BrightCampus" };

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
            <WorkspaceLine />
            <SignInForm />
          </Suspense>
          <div className="auth-help">Need help? Contact your school administrator.</div>
        </main>
      </div>
    </>
  );
}
