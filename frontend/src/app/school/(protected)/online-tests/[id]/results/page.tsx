"use client";

import { useParams } from "next/navigation";

import { TestResults } from "@/components/online-exam/Results";

export default function SchoolOnlineTestResultsPage() {
  const { id } = useParams<{ id: string }>();
  return <TestResults testId={id} base="/school/online-tests" />;
}
