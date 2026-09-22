// PM-018 · Timetable
// Parent app · Module: Learning · Release: MVP · ERP: SCR-125 / SCR-127
// Feature: View daily class schedule and substitutions.
// Mock: Parent_Mobile_58_Screens/screens/PM-018_timetable.html
// Wired: GET /api/v1/parent/me/children/{id}/timetable (weekly periods + entries; 404 until published). Hand-maintained.
// Not wired: dated days and substitutions — the timetable is weekly and the parent API has no cover/substitution data.

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
