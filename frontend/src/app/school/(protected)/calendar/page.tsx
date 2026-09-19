"use client";

import { CalendarFeed } from "@/components/events/CalendarFeed";
import { PageHeader } from "@/components/ui/Field";

export default function SchoolCalendarPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="School calendar" subtitle="Events, holidays, exams and parent-teacher meetings in one place. Drafts show only here." />
      <CalendarFeed feed="/api/v1/school/calendar" />
    </div>
  );
}
