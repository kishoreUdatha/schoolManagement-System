"use client";

import { useParams } from "next/navigation";

import { PayrollRunView } from "@/components/payroll/PayrollRunView";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <PayrollRunView runId={id} basePath="/school/payroll" />;
}
