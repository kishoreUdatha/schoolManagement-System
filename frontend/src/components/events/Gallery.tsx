"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBox } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

export type Photo = { id: number; caption: string | null; content_type: string; size_bytes: number };
export type Album = {
  id: number;
  title: string;
  description: string | null;
  album_date: string;
  event_id: number | null;
  audience: "everyone" | "staff" | "parents" | "class_parents" | "section_parents";
  class_id: number | null;
  section_id: number | null;
  audience_label: string;
  is_published: boolean;
  photo_count: number;
  cover_photo_id: number | null;
};
export type AlbumDetail = Album & { photos: Photo[] };

/** <img> for an authenticated file: fetched with the bearer token, shown via a blob URL. */
export function AuthImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    api
      .get<Blob>(src, { responseType: "blob" })
      .then((r) => {
        if (!live) return;
        made = URL.createObjectURL(r.data);
        setUrl(made);
      })
      .catch(() => setUrl(null));
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [src]);
  if (!url) return <div className={`animate-pulse bg-surface-subtle ${className ?? ""}`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}

export function AlbumGrid({
  albums,
  photoUrl,
  onOpen,
  showStatus = false,
}: {
  albums: Album[];
  photoUrl: (id: number) => string;
  onOpen: (a: Album) => void;
  showStatus?: boolean;
}) {
  if (albums.length === 0) return <p className="text-sm text-ink-subtle">No albums yet.</p>;
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {albums.map((a) => (
        <button key={a.id} type="button" onClick={() => onOpen(a)} className="text-left">
          <Card className="overflow-hidden transition hover:ring-2 hover:ring-brand-500/40">
            {a.cover_photo_id ? (
              <AuthImage src={photoUrl(a.cover_photo_id)} alt={a.title} className="h-36 w-full object-cover" />
            ) : (
              <div className="flex h-36 items-center justify-center bg-surface-subtle text-xs text-ink-subtle">No photos</div>
            )}
            <div className="p-3">
              <div className="truncate font-medium text-ink">{a.title}</div>
              <div className="text-xs text-ink-subtle">
                {a.album_date} · {a.photo_count} photo{a.photo_count === 1 ? "" : "s"}
              </div>
              {showStatus && (
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge tone={a.is_published ? "emerald" : "neutral"}>{a.is_published ? "published" : "draft"}</Badge>
                  <Badge>{a.audience_label}</Badge>
                </div>
              )}
            </div>
          </Card>
        </button>
      ))}
    </div>
  );
}

export function PhotoGrid({
  photos,
  photoUrl,
  actions,
}: {
  photos: Photo[];
  photoUrl: (id: number) => string;
  actions?: (p: Photo) => React.ReactNode;
}) {
  const [view, setView] = useState<number | null>(null);
  const idx = photos.findIndex((p) => p.id === view);
  const cur = idx >= 0 ? photos[idx] : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {photos.map((p) => (
          <div key={p.id} className="space-y-1">
            <button type="button" className="block w-full" onClick={() => setView(p.id)}>
              <AuthImage src={photoUrl(p.id)} alt={p.caption ?? "Photo"} className="h-32 w-full rounded-md object-cover" />
            </button>
            {p.caption && <div className="truncate text-xs text-ink-muted">{p.caption}</div>}
            {actions?.(p)}
          </div>
        ))}
      </div>
      <Modal open={!!cur} onClose={() => setView(null)} title={cur?.caption || "Photo"} size="lg">
        {cur && (
          <div className="space-y-3">
            <AuthImage src={photoUrl(cur.id)} alt={cur.caption ?? "Photo"} className="max-h-[70vh] w-full rounded-md object-contain" />
            <div className="flex justify-between">
              <Button size="sm" variant="secondary" disabled={idx <= 0} onClick={() => setView(photos[idx - 1].id)}>
                ← Previous
              </Button>
              <span className="text-xs text-ink-subtle">
                {idx + 1} / {photos.length}
              </span>
              <Button size="sm" variant="secondary" disabled={idx >= photos.length - 1} onClick={() => setView(photos[idx + 1].id)}>
                Next →
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/** Read-only gallery for parents and staff. `base` is /api/v1/parent/me/gallery
 * or /api/v1/school/gallery. */
export function GalleryViewer({ base }: { base: string }) {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [open, setOpen] = useState<AlbumDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoUrl = (id: number) => `${base}/photos/${id}/file`;

  useEffect(() => {
    api
      .get<Album[]>(base)
      .then((r) => setAlbums(r.data.filter((a) => a.is_published)))
      .catch((e) => setError(apiError(e)));
  }, [base]);

  async function show(a: Album) {
    try {
      const r = await api.get<AlbumDetail>(`${base}/${a.id}`);
      setOpen(r.data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-4">
      <ErrorBox>{error}</ErrorBox>
      {open ? (
        <div className="space-y-3">
          <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
            ← All albums
          </Button>
          <div>
            <h2 className="text-xl font-semibold text-ink">{open.title}</h2>
            <div className="text-sm text-ink-subtle">{open.album_date}</div>
            {open.description && <p className="mt-1.5 text-[13px] text-ink-muted">{open.description}</p>}
          </div>
          <PhotoGrid photos={open.photos} photoUrl={photoUrl} />
        </div>
      ) : (
        <AlbumGrid albums={albums} photoUrl={photoUrl} onOpen={show} />
      )}
    </div>
  );
}
