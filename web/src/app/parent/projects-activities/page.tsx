// PM-058 · Projects & activities
// Parent app · Module: Progress & resources · Release: Phase 2 · ERP: SCR-109 / SCR-134 / SCR-136
// Feature: Track school projects, activity participation and upcoming milestones.
// Mock: Parent_Mobile_58_Screens/screens/PM-058_projects_activities.html
// Wired: GET /api/v1/parent/me/children/{id}/projects, GET/POST …/projects/{id}/progress, GET /api/v1/parent/me/children/{id}/project-milestones, GET /api/v1/parent/me/children/{id}/activities. Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { ProjectsActivities } from "@/features/parent/progress/ProjectsActivities";

export const metadata = { title: "PM-058 · Projects & activities · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={58}>
      <ProjectsActivities />
    </ParentShell>
  );
}
