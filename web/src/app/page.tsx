// SCR-001 · Landing / Home
// Module: Public Website & Authentication · Role: All Users · Release: MVP · Stories: US-0001 / US-0002
// Mock: screens/SCR-001_Landing_Home.html
// Backend: the old frontend served this at / — Hero, feature cards, portal links, health badge
// Wired: GET /api/v1/health (public status badge); sign-in and dashboard links follow the session. Hand-maintained.

import Link from "next/link";
import { HeroArt } from "@/components/ui/HeroArt";
import { Icon } from "@/components/ui/Icon";
import { HealthBadge, LandingDashboardLink, LandingSignIn } from "@/features/account/Public";

export const metadata = { title: "SCR-001 · Landing / Home · BrightCampus" };

export default function Page() {
  return (
    <>
      <div className="public-page">
        <header className="public-header">
          <Link href="/screens" className="brand">
            <span className="brand-mark">
              <Icon name="book" />
            </span>
            <span>
              BrightCampus
              <small>SCHOOL ERP</small>
            </span>
          </Link>
          <nav>
            <Link href="/welcome/sign-in?role=school_admin">School operations</Link>
            <Link href="/welcome/sign-in?role=teacher">Teaching</Link>
            <Link href="/welcome/sign-in?role=student">Student life</Link>
          </nav>
          <LandingSignIn />
        </header>
        <main className="landing">
          <div>
            <div className="landing-kicker">A CONNECTED SCHOOL EXPERIENCE</div>
            <h1>
              A brighter school day.
              <br />
              <em>For everyone.</em>
            </h1>
            <p>
              Bring learning, people and school operations together in one clear, welcoming workspace.
            </p>
            <div className="actions">
              <Link href="/welcome/workspace-role-selection" className="btn primary">
                <Icon name="arrow" className="sm" />
                Explore workspaces
              </Link>
              <LandingDashboardLink />
            </div>
            <div className="gap" />
            <div className="small muted">Students · Teachers · Parents · School teams</div>
            <div className="gap" />
            <HealthBadge />
          </div>
          <div className="landing-art">
            <HeroArt />
            <div className="floating-card one">
              <span className="avatar mint">
                <Icon name="check" />
              </span>
              <span>
                <strong>Your school day, organized</strong>
                <small>Classes, attendance and more</small>
              </span>
            </div>
            <div className="floating-card two">
              <span className="avatar">
                <Icon name="book" />
              </span>
              <span>
                <strong>Room to learn and grow</strong>
                <small>One connected community</small>
              </span>
            </div>
          </div>
        </main>
        <section className="landing-bottom">
          <div>
            <h3>Learning that stays connected</h3>
            <p>
              Classes, homework, assessments and progress, brought together for every learner.
            </p>
          </div>
          <div>
            <h3>More time for teaching</h3>
            <p>Keep daily attendance, lesson plans and feedback easy to manage.</p>
          </div>
          <div>
            <h3>A clear view of your school</h3>
            <p>
              Support your school community with organized admissions, fees and operations.
            </p>
          </div>
        </section>
        <footer className="screen-note">
          <span>BrightCampus · School ERP preview</span>
          <Link href="/screens">Browse all 296 screens</Link>
        </footer>
      </div>
    </>
  );
}
