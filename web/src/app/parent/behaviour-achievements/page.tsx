// PM-057 · Behaviour & achievements
// Parent app · Module: Progress & resources · Release: Phase 2 · ERP: SCR-064 / SCR-109 / SCR-223
// Feature: View achievements and behaviour information explicitly shared with guardians.
// Mock: Parent_Mobile_58_Screens/screens/PM-057_behaviour_achievements.html
// Wired: GET /api/v1/parent/me/children/{id}/behaviour, GET /api/v1/parent/me/children/{id}/discipline, GET /api/v1/parent/me/children/{id}/achievements. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { BehaviourAchievements } from "@/features/parent/progress/BehaviourAchievements";

export const metadata = { title: "PM-057 · Behaviour & achievements · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={57}>
      <BehaviourAchievements />
    </ParentShell>
  );
}
