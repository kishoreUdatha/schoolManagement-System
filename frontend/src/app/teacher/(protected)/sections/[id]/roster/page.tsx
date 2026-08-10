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

      <h1 className="text-2xl font-bold text-slate-900">Roster</h1>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
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
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Roll</th>
              <th className="px-4 py-2 font-medium">Admission #</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Gender</th>
              <th className="px-4 py-2 font-medium">DOB</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-mono text-xs text-slate-500">
                  {s.roll_no}
                </td>
                <td className="px-4 py-2 font-mono text-xs">{s.admission_no}</td>
                <td className="px-4 py-2 font-medium text-slate-900">
                  {s.full_name}
                </td>
                <td className="px-4 py-2 text-slate-600">{s.gender ?? "—"}</td>
                <td className="px-4 py-2 text-slate-600">{s.dob ?? "—"}</td>
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
