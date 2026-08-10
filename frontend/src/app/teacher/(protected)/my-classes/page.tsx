"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

type ClassTeacherCard = {
  section_id: number;
  class_id: number;
  section_name: string;
  class_name: string;
  section_label: string;
  academic_year_name: string;
  is_current_year: boolean;
  capacity: number;
  student_count: number;
};

type SectionBrief = {
  section_id: number;
  section_name: string;
  student_count: number;
};

type SubjectTeacherCard = {
  class_subject_id: number;
  class_id: number;
  class_name: string;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  is_optional: boolean;
  academic_year_name: string;
  is_current_year: boolean;
  sections: SectionBrief[];
  total_students: number;
};

type MyClasses = {
  class_teacher_of: ClassTeacherCard[];
  subject_teacher_of: SubjectTeacherCard[];
};

export default function MyClassesPage() {
  const [data, setData] = useState<MyClasses | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api
      .get<MyClasses>("/api/v1/teacher/my-classes")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const filteredClassTeacher = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase().trim();
    if (!q) return data.class_teacher_of;
    return data.class_teacher_of.filter(
      (c) =>
        c.section_label.toLowerCase().includes(q) ||
        c.academic_year_name.toLowerCase().includes(q)
    );
  }, [data, search]);

  const filteredSubjectTeacher = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase().trim();
    if (!q) return data.subject_teacher_of;
    return data.subject_teacher_of.filter(
      (c) =>
        c.class_name.toLowerCase().includes(q) ||
        c.subject_name.toLowerCase().includes(q) ||
        c.subject_code.toLowerCase().includes(q)
    );
  }, [data, search]);

  if (error)
    return (
      <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
    );
  if (!data) return <div className="text-sm text-slate-500">Loading…</div>;

  const empty =
    data.class_teacher_of.length === 0 && data.subject_teacher_of.length === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My classes</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every section and subject you&apos;re assigned to. Use the cards to
          jump into rosters, attendance, homework, and marks.
        </p>
      </div>

      <Input
        placeholder="Search class, subject, or code"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {empty && (
        <Card className="p-8 text-center text-slate-500">
          You haven&apos;t been assigned as a class teacher or subject teacher
          anywhere yet. Your school admin assigns these in <em>Classes</em> and{" "}
          <em>Subjects</em>.
        </Card>
      )}

      {filteredClassTeacher.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Class teacher of
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredClassTeacher.map((c) => (
              <Card key={c.section_id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {c.section_label}
                    </h3>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {c.academic_year_name}
                      {c.is_current_year && (
                        <Badge tone="emerald" className="ml-1">
                          current
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Badge tone="brand">{c.student_count} students</Badge>
                </div>
                <div className="mt-3 text-xs text-slate-500">
                  Capacity: {c.capacity || "—"}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/teacher/sections/${c.section_id}/roster`}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Roster
                  </Link>
                  <Link
                    href={`/teacher/attendance?section_id=${c.section_id}`}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Attendance
                  </Link>
                  <ComingSoonChip label="Homework" hint="Story 3.5" />
                  <ComingSoonChip label="Marks" hint="Story 3.7" />
                  <ComingSoonChip label="Behaviour" hint="Story 3.6" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {filteredSubjectTeacher.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Subject teacher of
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSubjectTeacher.map((c) => (
              <Card key={c.class_subject_id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {c.subject_name}
                    </h3>
                    <div className="mt-0.5 text-xs text-slate-500">
                      <span className="font-mono">{c.subject_code}</span> ·{" "}
                      {c.class_name} · {c.academic_year_name}
                      {c.is_optional && (
                        <Badge tone="amber" className="ml-2">
                          optional
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Badge tone="brand">{c.total_students} students</Badge>
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="font-medium text-slate-500">Sections:</div>
                  {c.sections.length === 0 ? (
                    <p className="text-slate-400">No sections yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {c.sections.map((s) => (
                        <li
                          key={s.section_id}
                          className="flex items-center justify-between"
                        >
                          <Link
                            href={`/teacher/sections/${s.section_id}/roster`}
                            className="text-brand-700 hover:underline"
                          >
                            {c.class_name} {s.section_name}
                          </Link>
                          <span className="text-slate-500">
                            {s.student_count} students
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ComingSoonChip label="Homework" hint="Story 3.5" />
                  <ComingSoonChip label="Marks" hint="Story 3.7" />
                  <ComingSoonChip label="Learning content" hint="Story 3.8" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ComingSoonChip({ label, hint }: { label: string; hint: string }) {
  return (
    <span
      title={`Coming in ${hint}`}
      className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-2.5 py-1 text-xs text-slate-500"
    >
      {label}
    </span>
  );
}
