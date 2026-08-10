"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type Video = {
  id: number;
  subject_name: string | null;
  subject_code: string | null;
  class_name: string | null;
  title: string;
  description: string | null;
  youtube_video_id: string;
  youtube_url: string;
  thumbnail_url: string;
  embed_url: string;
  teacher_name: string | null;
  created_at: string;
  is_completed: boolean | null;
  completed_at: string | null;
  completion_count: number;
  eligible_student_count: number;
};

export default function ChildVideosPage() {
  const params = useParams<{ id: string }>();
  const [items, setItems] = useState<Video[] | null>(null);
  const [active, setActive] = useState<Video | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [toggling, setToggling] = useState<number | null>(null);

  useEffect(() => {
    api
      .get<Video[]>(`/api/v1/parent/me/children/${params.id}/videos`)
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, [params.id]);

  async function toggleCompleted(v: Video) {
    setToggling(v.id);
    try {
      const path = `/api/v1/parent/me/children/${params.id}/videos/${v.id}/completion`;
      if (v.is_completed) {
        await api.delete(path);
      } else {
        await api.post(path);
      }
      const { data } = await api.get<Video[]>(
        `/api/v1/parent/me/children/${params.id}/videos`
      );
      setItems(data);
      if (active && active.id === v.id) {
        setActive(data.find((x) => x.id === v.id) ?? null);
      }
    } catch (e) {
      setError(apiError(e));
    } finally {
      setToggling(null);
    }
  }

  if (error)
    return (
      <div className="space-y-4">
        <Link
          href={`/parent/children/${params.id}`}
          className="text-sm text-brand-700 hover:underline"
        >
          ← Back
        </Link>
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      </div>
    );
  if (!items) return <div className="text-sm text-slate-500">Loading…</div>;

  const subjects = Array.from(
    new Set(items.map((v) => v.subject_code).filter(Boolean) as string[]),
  );
  const visible = subjectFilter
    ? items.filter((v) => v.subject_code === subjectFilter)
    : items;

  return (
    <div className="space-y-6">
      <Link
        href={`/parent/children/${params.id}`}
        className="text-sm text-brand-700 hover:underline"
      >
        ← Back to child
      </Link>

      <header>
        <h1 className="text-2xl font-bold text-slate-900">Learning videos</h1>
        <p className="text-sm text-slate-500">
          Videos shared by your child&apos;s teachers. Tap any thumbnail to watch
          inline.
        </p>
      </header>

      {subjects.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSubjectFilter("")}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              !subjectFilter
                ? "bg-brand-600 text-white"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            All
          </button>
          {subjects.map((s) => (
            <button
              key={s}
              onClick={() => setSubjectFilter(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                subjectFilter === s
                  ? "bg-brand-600 text-white"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <Card>
          <CardBody className="text-sm text-slate-500">
            No videos posted yet.
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((v) => (
            <Card key={v.id} className="overflow-hidden">
              <button
                onClick={() => setActive(v)}
                className="block w-full bg-slate-100 text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={v.thumbnail_url}
                  alt={v.title}
                  className="aspect-video w-full object-cover transition hover:opacity-90"
                />
              </button>
              <div className="p-3">
                <div className="flex items-center gap-2">
                  <Badge tone="brand">{v.subject_code}</Badge>
                  {v.is_completed && (
                    <Badge tone="emerald">watched ✓</Badge>
                  )}
                  <span className="ml-auto text-xs text-slate-500">
                    by {v.teacher_name ?? "teacher"}
                  </span>
                </div>
                <h3 className="mt-2 font-semibold text-slate-900 line-clamp-2">
                  {v.title}
                </h3>
                {v.description && (
                  <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                    {v.description}
                  </p>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCompleted(v);
                  }}
                  disabled={toggling === v.id}
                  className={
                    "mt-3 w-full rounded-md border px-2 py-1.5 text-xs font-medium transition " +
                    (v.is_completed
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  {toggling === v.id
                    ? "…"
                    : v.is_completed
                    ? "Watched — undo"
                    : "Mark as watched"}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {active && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setActive(null)}
        >
          <div
            className="w-full max-w-3xl rounded-lg bg-white p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-slate-900">{active.title}</h3>
              <button
                onClick={() => setActive(null)}
                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 aspect-video w-full overflow-hidden rounded">
              <iframe
                src={active.embed_url}
                title={active.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
            {active.description && (
              <p className="mt-3 text-sm text-slate-700 whitespace-pre-line">
                {active.description}
              </p>
            )}
            <div className="mt-2 text-xs text-slate-500">
              {active.subject_name} · {active.class_name} · by{" "}
              {active.teacher_name ?? "teacher"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
