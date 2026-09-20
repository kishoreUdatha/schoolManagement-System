"use client";

import { Facilities } from "@/components/facilities/Facilities";
import { PageHeader } from "@/components/ui/Field";

export default function TeacherLabsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Labs" subtitle="See what's free and book a lab for your class." />
      <Facilities canManage={false} />
    </div>
  );
}
