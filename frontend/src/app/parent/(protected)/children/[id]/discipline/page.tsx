"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { Incident } from "@/components/pastoral/Discipline";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { humanize } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";

const sevTone = { low: "neutral", medium: "amber", high: "rose" } as const;

export default function ChildDisciplinePage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<Incident[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Incident[]>(`/api/v1/parent/me/children/${id}/discipline`)
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  return (
    <div className="space-y-4">
      <Link href={`/parent/children/${id}`} className="text-sm text-brand-700 hover:underline">
        ← Back
      </Link>
      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">School incidents</h1>
      <p className="text-sm text-ink-muted">Incidents the school has shared with you, and what was done about them.</p>
      {error && <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>}
      {items.length === 0 && !error && <p className="text-sm text-ink-muted">Nothing to show — that&apos;s good news.</p>}
      {items.map((i) => (
        <Card key={i.id}>
          <CardBody className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{i.occurred_on}</span>
              <Badge tone={sevTone[i.severity]}>{i.severity}</Badge>
              <Badge>{humanize(i.category)}</Badge>
              {(i.status === "closed" || i.status === "dismissed") && <Badge tone="emerald">{humanize(i.status)}</Badge>}
            </div>
            <p className="whitespace-pre-line text-sm text-ink-muted">{i.description}</p>
            {i.actions.length > 0 && (
              <ul className="space-y-1 text-sm">
                {i.actions.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">{humanize(a.kind)}</Badge>
                    <span className="text-ink-muted">{a.details}</span>
                    {a.start_date && (
                      <span className="text-xs text-ink-muted">
                        {a.start_date}
                        {a.end_date && ` → ${a.end_date}`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {i.resolution && <div className="rounded bg-surface-subtle p-2 text-sm text-ink-muted">Outcome: {i.resolution}</div>}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
