"use client";

import { useParams } from "next/navigation";

import { TestEditor } from "@/components/online-exam/TestEditor";

export default function TeacherOnlineTestPage() {
  const { id } = useParams<{ id: string }>();
  return <TestEditor testId={id} base="/teacher/online-tests" />;
}
