"use client";

import { CoverBoard } from "@/components/cover/CoverBoard";
import { PageHeader } from "@/components/ui/Field";

export default function PrincipalCoverPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Substitutions" subtitle="Classes whose teacher is away, and who's covering them." />
      <CoverBoard />
    </div>
  );
}
