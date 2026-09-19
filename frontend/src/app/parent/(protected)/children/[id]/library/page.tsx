"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

import { BorrowedBooks } from "@/components/library/BorrowedBooks";

export default function ChildLibraryPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-4">
      <Link href={`/parent/children/${id}`} className="text-sm text-brand-700 hover:underline">
        ← Back
      </Link>
      <h1 className="text-2xl font-bold text-slate-900">Library</h1>
      <BorrowedBooks endpoint={`/api/v1/parent/me/children/${id}/library`} />
    </div>
  );
}
