"use client";

import { useParams } from "next/navigation";

import { TestResults } from "@/components/online-exam/Results";

export default function TeacherOnlineTestResultsPage() {
  const { id } = useParams<{ id: string }>();
  return <TestResults testId={id} base="/teacher/online-tests" />;
}
