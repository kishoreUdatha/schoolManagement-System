// PM-001 · Welcome
// Parent app · Module: Access · Release: MVP · ERP: SCR-001 / SCR-076
// Feature: Introduce the parent app and choose language.
// Mock: Parent_Mobile_58_Screens/screens/PM-001_welcome.html
// Wired: no data (static intro); "Get started" goes to PM-002, or PM-006 when already signed in. Hand-maintained.
// Not wired: language picker — the app has no translations yet, so the select is dropped.

import { ParentShell } from "@/components/parent/ParentShell";
import { WelcomeStart } from "@/features/parent/access/Welcome";

export const metadata = { title: "PM-001 · Welcome · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={1}>
      <div className="welcome-art">
        <div className="orbit" />
        <div className="book-mark">B</div>
        <span className="small-dot" />
      </div>
      <div className="brand-label">BrightCampus</div>
      <h1>
        Closer to every
        <br />
        school day.
      </h1>
      <p className="lead">Your child’s learning, updates and school life, in one place.</p>
      <WelcomeStart />
      <p className="micro center">BrightCampus parent app</p>
    </ParentShell>
  );
}
