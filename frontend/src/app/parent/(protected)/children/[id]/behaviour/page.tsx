"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { StarRating } from "@/components/StarRating";
import { api, apiError } from "@/lib/api";

type Rating = {
  id: number;
  period_kind: "weekly" | "monthly";
  period_key: string;
  punctuality: number;
  participation: number;
  discipline: number;
  respect: number;
  average: number;
  teacher_note: string | null;
  rated_by_name: string | null;
  created_at: string;
};

export default function ChildBehaviourPage() {
  const params = useParams<{ id: string }>();
  const [items, setItems] = useState<Rating[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Rating[]>(`/api/v1/parent/me/children/${params.id}/behaviour`)
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, [params.id]);

  return (
    <div className="space-y-4">
      <Link
        href={`/parent/children/${params.id}`}
        className="text-sm text-brand-700 hover:underline"
      >
        ← Back to child profile
      </Link>
      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Behaviour ratings</h1>

      {error && (
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}

      {items.length === 0 && !error && (
        <Card className="p-8 text-center text-slate-500">
          No ratings posted yet.
        </Card>
      )}

      <div className="space-y-3">
        {items.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>
                {r.period_kind === "weekly" ? "Week" : "Month"}: {r.period_key}
              </CardTitle>
              <span className="text-xs text-slate-500">avg {r.average}</span>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <DimensionRow label="Punctuality" value={r.punctuality} />
                <DimensionRow label="Participation" value={r.participation} />
                <DimensionRow label="Discipline" value={r.discipline} />
                <DimensionRow label="Respect" value={r.respect} />
              </div>
              {r.teacher_note && (
                <blockquote className="border-l-2 border-brand-300 bg-brand-50/40 px-3 py-2 text-sm italic text-slate-700">
                  “{r.teacher_note}”
                </blockquote>
              )}
              <div className="text-xs text-slate-500">
                Rated by {r.rated_by_name ?? "teacher"} ·{" "}
                {new Date(r.created_at).toLocaleDateString()}
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}

function DimensionRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
      <span className="text-slate-700">{label}</span>
      <StarRating value={value} size="sm" readOnly />
    </div>
  );
}
