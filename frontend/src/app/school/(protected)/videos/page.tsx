"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type Video = {
  id: number;
  class_subject_id: number;
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
  is_active: boolean;
  created_at: string;
};

export default function SchoolVideosModeration() {
  const [items, setItems] = useState<Video[]>([]);
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      const { data } = await api.get<Video[]>("/api/v1/school/videos", {
        params: { include_removed: includeRemoved },
      });
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [includeRemoved]);

  async function remove(v: Video) {
    if (
      !window.confirm(
        `Remove "${v.title}" by ${v.teacher_name ?? "teacher"}? Parents will no longer see it.`,
      )
    )
      return;
    try {
      await api.delete(`/api/v1/school/videos/${v.id}`);
      setNotice("Video removed.");
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">
          Learning videos — moderation
        </h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Review what teachers have posted. Use <strong>Remove</strong> for any
          link that violates school policy.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={includeRemoved}
          onChange={(e) => setIncludeRemoved(e.target.checked)}
          className="rounded border-surface-border"
        />
        Show already-removed videos
      </label>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">
          {notice}
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <table className="min-w-full divide-y divide-surface-border text-[13px]">
          <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-bold">Thumb</th>
              <th className="px-4 py-3 font-bold">Title</th>
              <th className="px-4 py-3 font-bold">Class · subject</th>
              <th className="px-4 py-3 font-bold">Teacher</th>
              <th className="px-4 py-3 font-bold">Posted</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {items.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-3">
                  <a href={v.youtube_url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={v.thumbnail_url}
                      alt=""
                      className="h-12 w-20 rounded object-cover"
                    />
                  </a>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{v.title}</div>
                  {v.description && (
                    <div className="text-xs text-ink-muted line-clamp-1">
                      {v.description}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {v.class_name} · {v.subject_name}
                </td>
                <td className="px-4 py-3 text-ink-muted">{v.teacher_name}</td>
                <td className="px-4 py-3 text-ink-muted">
                  {v.created_at.slice(0, 10)}
                </td>
                <td className="px-4 py-3">
                  {v.is_active ? (
                    <Badge tone="emerald">Live</Badge>
                  ) : (
                    <Badge tone="neutral">Removed</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {v.is_active && (
                    <Button size="sm" variant="danger" onClick={() => remove(v)}>
                      Remove
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-muted">
                  No videos to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
