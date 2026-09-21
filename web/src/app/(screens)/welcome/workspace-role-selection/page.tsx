// SCR-002 · Workspace / Role Selection
// Module: Public Website & Authentication · Role: All Users · Release: MVP · Stories: US-0003 / US-0004
// Mock: screens/SCR-002_Workspace_Role_Selection.html
// Backend: the old frontend served this at /workspace — Every portal, with a line on picking the right one
// Wired: no API (public). Continue goes to /welcome/sign-in?role=<role>. Hand-maintained.

import Link from "next/link";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { RoleSelection } from "@/features/account/Public";

export const metadata = { title: "SCR-002 · Workspace / Role Selection · BrightCampus" };

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
          <div className="auth-top">
            {"BrightCampus School ERP "}
            <Link href="/welcome/workspace-role-selection">Change workspace</Link>
          </div>
          <RoleSelection />
          <div className="auth-help">Need help? Contact your school administrator.</div>
        </main>
      </div>
    </>
  );
}
