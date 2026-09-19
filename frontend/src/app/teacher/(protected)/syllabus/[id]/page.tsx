"use client";

import { useParams } from "next/navigation";

import { SyllabusEditor } from "@/components/syllabus/SyllabusEditor";

export default function TeacherSyllabusDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <SyllabusEditor csId={id} backHref="/teacher/syllabus" />;
}
