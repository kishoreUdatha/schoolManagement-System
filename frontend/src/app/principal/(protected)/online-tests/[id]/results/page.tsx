"use client";

import { useParams } from "next/navigation";

import { TestResults } from "@/components/online-exam/Results";

export default function PrincipalOnlineTestResultsPage() {
  const { id } = useParams<{ id: string }>();
  return <TestResults testId={id} base="/principal/online-tests" />;
}
