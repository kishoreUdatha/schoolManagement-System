"use client";

import { useParams } from "next/navigation";

import { Curriculum } from "@/components/curriculum/Curriculum";

export default function PrincipalCurriculumPage() {
  const { id } = useParams<{ id: string }>();
  return <Curriculum csId={id} backHref="/principal/syllabus" />;
}
