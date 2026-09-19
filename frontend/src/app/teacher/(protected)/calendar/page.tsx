"use client";

import { CalendarFeed } from "@/components/events/CalendarFeed";
import { PageHeader } from "@/components/ui/Field";

export default function TeacherCalendarPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="School calendar" subtitle="Events, holidays, exams and your parent-teacher meetings." />
      <CalendarFeed feed="/api/v1/school/calendar" />
    </div>
  );
}
