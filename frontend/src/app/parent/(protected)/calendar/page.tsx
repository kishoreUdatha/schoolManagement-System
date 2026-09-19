"use client";

import { CalendarFeed } from "@/components/events/CalendarFeed";
import { PageHeader } from "@/components/ui/Field";

export default function ParentCalendarPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="School calendar" subtitle="Events, holidays, exams and your meetings with teachers." />
      <CalendarFeed feed="/api/v1/parent/me/calendar" />
    </div>
  );
}
