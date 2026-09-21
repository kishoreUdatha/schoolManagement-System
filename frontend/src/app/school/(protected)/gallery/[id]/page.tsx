"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AlbumForm } from "@/components/events/AlbumForm";
import { PhotoGrid, type AlbumDetail } from "@/components/events/Gallery";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorBox, NoticeBox, PageHeader } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";

export default function AlbumAdminPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const base = `/api/v1/school/gallery/${id}`;
  const [a, setA] = useState<AlbumDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () =>
    api
      .get<AlbumDetail>(base)
      .then((r) => setA(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    try {
      await fn();
      setError(null);
      if (done) setNotice(done);
      await load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    setUploading(true);
    await run(() => api.post(`${base}/photos`, form, { timeout: 120_000 }), `${files.length} photo(s) added.`);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  if (!a) return <ErrorBox>{error}</ErrorBox>;

  return (
    <div className="space-y-6">
      <Link href="/school/gallery" className="text-sm text-brand-500 hover:underline">
        ← All albums
      </Link>
      <PageHeader
        title={a.title}
        subtitle={`${a.album_date} · ${a.audience_label}`}
        actions={
          <>
            <Button
              onClick={() =>
                run(
                  () => api.post(`${base}/publish`, null, { params: { published: !a.is_published } }),
                  a.is_published ? "Album hidden." : "Published. The audience was notified."
                )
              }
            >
              {a.is_published ? "Unpublish" : "Publish"}
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                if (!window.confirm(`Delete "${a.title}" and all its photos?`)) return;
                try {
                  await api.delete(base);
                  router.push("/school/gallery");
                } catch (e) {
                  setError(apiError(e));
                }
              }}
            >
              Delete
            </Button>
          </>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={a.is_published ? "emerald" : "neutral"}>{a.is_published ? "published" : "draft"}</Badge>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
        <Button size="sm" variant="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? "Uploading…" : "Add photos"}
        </Button>
        <span className="text-xs text-ink-subtle">JPG, PNG or WEBP · up to 30 at a time</span>
      </div>
      {a.description && <p className="text-sm text-ink-muted">{a.description}</p>}
      {a.photos.length === 0 ? (
        <p className="text-sm text-ink-subtle">No photos yet.</p>
      ) : (
        <PhotoGrid
          photos={a.photos}
          photoUrl={(pid) => `/api/v1/school/gallery/photos/${pid}/file`}
          actions={(p) => (
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className="text-brand-500 hover:underline"
                onClick={() => {
                  const caption = window.prompt("Caption", p.caption ?? "");
                  if (caption === null) return;
                  run(() => api.patch(`/api/v1/school/gallery/photos/${p.id}`, { caption: caption.trim() || null }));
                }}
              >
                Caption
              </button>
              <button
                type="button"
                className="text-danger hover:underline"
                onClick={() =>
                  window.confirm("Delete this photo?") && run(() => api.delete(`/api/v1/school/gallery/photos/${p.id}`))
                }
              >
                Delete
              </button>
            </div>
          )}
        />
      )}
      <AlbumForm
        open={editing}
        album={a}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          load();
        }}
      />
    </div>
  );
}
