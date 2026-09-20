"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Select, humanize } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";

type Resource = {
  id: number;
  subject_name: string | null;
  chapter_title: string | null;
  topic_title: string | null;
  title: string;
  description: string | null;
  kind: string;
  url: string | null;
  file_name: string | null;
  size_bytes: number | null;
  has_file: boolean;
  uploaded_by_name: string | null;
  created_at: string;
};

export default function ChildResourcesPage() {
  const params = useParams<{ id: string }>();
  const [items, setItems] = useState<Resource[] | null>(null);
  const [subject, setSubject] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Resource[]>(`/api/v1/parent/me/children/${params.id}/resources`)
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, [params.id]);

  const subjects = useMemo(
    () => Array.from(new Set((items ?? []).map((i) => i.subject_name).filter(Boolean) as string[])),
    [items]
  );
  const shown = (items ?? []).filter((i) => !subject || i.subject_name === subject);

  return (
    <div className="space-y-6">
      <Link href={`/parent/children/${params.id}`} className="text-sm text-brand-500 hover:underline">
        ← Back
      </Link>
      <PageHeader title="Study material" subtitle="Worksheets and links the teachers have shared for this class." />
      <ErrorBox>{error}</ErrorBox>

      {subjects.length > 1 && (
        <div className="max-w-xs">
          <Select label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">All subjects</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      )}

      {items === null ? null : shown.length === 0 ? (
        <Card>
          <CardBody className="text-center text-sm text-ink-muted">Nothing has been shared yet.</CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {shown.map((r) => (
            <Card key={r.id}>
              <CardBody className="space-y-2">
                <div className="text-xs uppercase text-ink-subtle">
                  {r.subject_name ?? "—"} · {humanize(r.kind)}
                </div>
                <h3 className="font-semibold text-ink">{r.title}</h3>
                {r.description && <p className="text-sm text-ink-muted">{r.description}</p>}
                <p className="text-xs text-ink-subtle">
                  {[r.chapter_title, r.topic_title].filter(Boolean).join(" · ") || "General"}
                  {r.uploaded_by_name ? ` · ${r.uploaded_by_name}` : ""}
                </p>
                {r.has_file ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      openAuthed(`/api/v1/parent/me/children/${params.id}/resources/${r.id}/file`, r.file_name ?? undefined)
                    }
                  >
                    Download
                  </Button>
                ) : (
                  r.url && (
                    <a href={r.url} target="_blank" rel="noreferrer noopener" className="text-sm text-brand-500 hover:underline">
                      Open link →
                    </a>
                  )
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
