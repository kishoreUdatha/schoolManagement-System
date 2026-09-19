"use client";

import { useParams } from "next/navigation";

import { TakeTest } from "@/components/online-exam/TakeTest";

export default function TakeTestPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  return <TakeTest attemptId={attemptId} />;
}
