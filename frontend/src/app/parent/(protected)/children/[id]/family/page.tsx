"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { Guardians } from "@/components/foundation/Guardians";

export default function ChildFamilyPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-4">
      <Link href={`/parent/children/${id}`} className="text-sm text-brand-700 hover:underline">
        ← Back
      </Link>
      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Family & pickup</h1>
      <p className="text-sm text-slate-500">
        Add grandparents, drivers or others who may collect your child. The gate checks this list for early pickups.
      </p>
      <Guardians mode="parent" base={`/api/v1/parent/me/children/${id}/guardians`} />
    </div>
  );
}
