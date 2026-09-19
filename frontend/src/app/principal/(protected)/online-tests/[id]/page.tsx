"use client";

import { useParams } from "next/navigation";

import { TestEditor } from "@/components/online-exam/TestEditor";

export default function PrincipalOnlineTestPage() {
  const { id } = useParams<{ id: string }>();
  return <TestEditor testId={id} base="/principal/online-tests" />;
}
