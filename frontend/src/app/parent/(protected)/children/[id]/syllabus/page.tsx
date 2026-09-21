"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Card, CardBody } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type Subject = {
  subject_name: string;
  teacher_name: string | null;
  covered: number;
  total: number;
  percent: number;
  chapters: { title: string; planned_start: string | null; planned_end: string | null; topics: { title: string; covered_on: string | null }[] }[];
};

export default function ChildSyllabusPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<Subject[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Subject[]>(`/api/v1/parent/me/children/${id}/syllabus`)
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  return (
    <div className="space-y-4">
      <Link href={`/parent/children/${id}`} className="text-sm text-brand-700 hover:underline">
        ← Back
      </Link>
      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Syllabus progress</h1>
      <p className="text-sm text-ink-muted">What has been taught so far in your child&apos;s class, subject by subject.</p>
      {error && <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>}
      {items.length === 0 && !error && <p className="text-sm text-ink-muted">The school hasn&apos;t published a syllabus yet.</p>}
      {items.map((s) => (
        <Card key={s.subject_name}>
          <CardBody>
            <button type="button" className="w-full text-left" onClick={() => setOpen(open === s.subject_name ? null : s.subject_name)}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-ink">{s.subject_name}</span>
                <span className="text-sm text-ink-muted">
                  {s.covered} of {s.total} topics · {s.percent}%
                </span>
              </div>
              {s.teacher_name && <div className="text-xs text-ink-muted">{s.teacher_name}</div>}
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-hover">
                <div className="h-full rounded-full bg-success" style={{ width: `${s.percent}%` }} />
              </div>
            </button>
            {open === s.subject_name && (
              <div className="mt-3 space-y-3">
                {s.chapters.map((c) => (
                  <div key={c.title}>
                    <div className="text-sm font-medium text-ink">
                      {c.title}
                      {c.planned_end && <span className="ml-2 text-xs font-normal text-ink-muted">planned by {c.planned_end}</span>}
                    </div>
                    <ul className="mt-1 space-y-0.5 pl-3 text-sm">
                      {c.topics.map((t) => (
                        <li key={t.title} className={t.covered_on ? "text-ink" : "text-ink-subtle"}>
                          {t.covered_on ? "✓" : "○"} {t.title}
                          {t.covered_on && <span className="ml-2 text-xs text-ink-muted">{t.covered_on}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
