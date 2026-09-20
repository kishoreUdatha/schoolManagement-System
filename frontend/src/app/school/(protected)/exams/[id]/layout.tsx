"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { ErrorBox } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";

type Exam = {
  id: number;
  name: string;
  kind: string;
  start_date: string;
  end_date: string;
  is_published: boolean;
};

/** One exam, from setting it up to deciding who goes up a year.
 *
 *  These are routed tabs rather than state, because the office deep-links to
 *  them — the datesheet gets mailed round, the seating plan gets opened on a
 *  phone in a corridor — and a tab you cannot send somebody is a tab they
 *  will screenshot instead.
 */
const TABS = [
  { slug: "", label: "Overview" },
  { slug: "datesheet", label: "Datesheet" },
  { slug: "halls", label: "Halls" },
  { slug: "invigilation", label: "Invigilation" },
  { slug: "admit-cards", label: "Admit cards" },
  { slug: "promotion", label: "Promotion" },
];

export default function ExamLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const [exam, setExam] = useState<Exam | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Exam>(`/api/v1/school/exams/${id}`)
      .then((r) => setExam(r.data))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  const base = `/school/exams/${id}`;
  const current = pathname === base ? "" : pathname.slice(base.length + 1);

  return (
    <div className="space-y-6">
      <Link
        href="/school/exams"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        All exams
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-1px] text-ink">
            {exam?.name ?? "Exam"}
          </h1>
          {exam && (
            <p className="mt-1 text-[13px] text-ink-muted">
              {exam.start_date} to {exam.end_date}
            </p>
          )}
        </div>
        {exam &&
          (exam.is_published ? (
            <Badge tone="emerald">Results published</Badge>
          ) : (
            <Badge tone="amber">Not published</Badge>
          ))}
      </div>

      <ErrorBox>{error}</ErrorBox>

      <nav className="flex flex-wrap gap-1 border-b border-surface-border">
        {TABS.map((t) => {
          const href = t.slug ? `${base}/${t.slug}` : base;
          const active = current === t.slug;
          return (
            <Link
              key={t.slug || "overview"}
              href={href}
              className={
                active
                  ? "border-b-2 border-brand-600 px-3 py-2 text-[13px] font-extrabold text-brand-600"
                  : "border-b-2 border-transparent px-3 py-2 text-[13px] font-bold text-ink-muted hover:text-ink"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
