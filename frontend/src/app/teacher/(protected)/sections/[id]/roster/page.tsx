"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

type Student = {
  id: number;
  admission_no: string;
  roll_no: number;
  full_name: string;
  gender: string | null;
  dob: string | null;
  photo_url: string | null;
};

export default function SectionRosterPage() {
  const params = useParams<{ id: string }>();
  const [students, setStudents] = useState<Student[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .get<Student[]>(`/api/v1/teacher/sections/${params.id}/students`)
      .then((r) => setStudents(r.data))
      .catch((e) => setError(apiError(e)));
  }, [params.id]);

  const filtered = students.filter(
    (s) =>
      !search.trim() ||
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.admission_no.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Link
        href="/teacher/my-classes"
        className="text-sm text-brand-700 hover:underline"
      >
        ← Back to My classes
      </Link>

      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Roster</h1>

      {error && (
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Input
          placeholder="Search name or admission #"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <span className="text-sm text-slate-500">
          {filtered.length} of {students.length} student(s)
        </span>
      </div>

      <Card>
        <table className="min-w-full divide-y divide-surface-border text-[13px]">
          <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-bold">Roll</th>
              <th className="px-4 py-3 font-bold">Admission #</th>
              <th className="px-4 py-3 font-bold">Name</th>
              <th className="px-4 py-3 font-bold">Gender</th>
              <th className="px-4 py-3 font-bold">DOB</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-[12px] tabular-nums text-ink-muted">
                  {s.roll_no}
                </td>
                <td className="px-4 py-3 text-[12px] font-mono">{s.admission_no}</td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {s.full_name}
                </td>
                <td className="px-4 py-3 text-slate-600">{s.gender ?? "—"}</td>
                <td className="px-4 py-3 text-slate-600">{s.dob ?? "—"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No students match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
