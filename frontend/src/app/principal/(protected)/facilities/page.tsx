"use client";

import { Facilities } from "@/components/facilities/Facilities";
import { PageHeader } from "@/components/ui/Field";

export default function PrincipalFacilitiesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Rooms & labs" subtitle="Rooms, labs and the day's lab timetable." />
      <Facilities canManage={false} />
    </div>
  );
}
