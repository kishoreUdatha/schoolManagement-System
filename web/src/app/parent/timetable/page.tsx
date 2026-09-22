// PM-018 · Timetable
// Parent app · Module: Learning · Release: MVP · ERP: SCR-125 / SCR-127
// Feature: View daily class schedule and substitutions.
// Mock: Parent_Mobile_58_Screens/screens/PM-018_timetable.html
// Wired: GET /api/v1/parent/me/children/{id}/timetable (which weekdays have periods; 404 until published), …/timetable/day (?date) — one dated day with cover (substitutions). Hand-maintained.

import { ParentShell } from "@/components/parent/ParentShell";
import { Timetable } from "@/features/parent/learning/Timetable";

export const metadata = { title: "PM-018 · Timetable · BrightCampus Parent" };

export default function Page() {
  return (
    <ParentShell screen={18}>
      <Timetable />
    </ParentShell>
  );
}
