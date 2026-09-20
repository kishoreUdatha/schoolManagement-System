"use client";

import { Facilities } from "@/components/facilities/Facilities";
import { PageHeader } from "@/components/ui/Field";

export default function SchoolFacilitiesPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Rooms & labs" subtitle="Rooms across the school, labs and who's booked them." />
      <Facilities canManage />
    </div>
  );
}
