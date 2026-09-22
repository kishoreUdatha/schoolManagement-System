"use client";

/*
 * PM-103 · Photo gallery. The albums the school has published for this
 * parent (GET /parent/me/gallery), one album's photos (GET …/gallery/{id},
 * ?album=<id>), and each photo from GET …/gallery/photos/{id}/file. Photos
 * need the bearer token, so they are fetched as blobs, not linked directly.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { parentRoute } from "@/lib/parentScreens";
import { useApi } from "@/lib/useApi";
import { PmEmpty, PmError, PmLoading } from "../support/pm";

type Album = {
  id: number;
  title: string;
  description: string | null;
  album_date: string;
  audience_label?: string;
  photo_count?: number;
  cover_photo_id?: number | null;
};

type Photo = { id: number; caption: string | null; content_type: string; size_bytes: number };
type AlbumDetail = Album & { photos: Photo[] };

const fileOf = (photo: number) => `/api/v1/parent/me/gallery/photos/${photo}/file`;

/** An object URL for a protected photo; revoked when the photo leaves the page. */
function usePhoto(id: number | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!id) return;
    let href: string | null = null;
    let live = true;
    setUrl(null);
    setFailed(false);
    api
      .blob(fileOf(id))
      .then((b) => {
        href = URL.createObjectURL(b);
        if (live) setUrl(href);
        else URL.revokeObjectURL(href);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (href) URL.revokeObjectURL(href);
    };
  }, [id]);
  return { url, failed };
}

function Thumb({ id, alt, onClick }: { id: number | null | undefined; alt: string; onClick?: () => void }) {
  const { url, failed } = usePhoto(id);
  const box = { width: "100%", aspectRatio: "1 / 1", borderRadius: 12, background: "#edf3ff", display: "grid", placeItems: "center", overflow: "hidden", border: 0, padding: 0 } as const;
  const inner = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  ) : (
    <span className="micro">{!id ? "No photos" : failed ? "Could not load" : "Loading…"}</span>
  );
  return onClick ? (
    <button type="button" style={box} onClick={onClick} aria-label={alt}>
      {inner}
    </button>
  ) : (
    <div style={box}>{inner}</div>
  );
}

export function PhotoGallery() {
  const id = Number(useSearchParams().get("album")) || 0;
  return id ? <AlbumView id={id} /> : <Albums />;
}

function Albums() {
  const router = useRouter();
  const albums = useApi<Album[]>("/api/v1/parent/me/gallery");
  const list = [...(albums.data ?? [])].sort((a, b) => b.album_date.localeCompare(a.album_date));

  if (albums.loading && !albums.data) return <PmLoading />;
  return (
    <>
      <PmError>{albums.error}</PmError>
      <p className="lead">Photos from school events and activities, shared by the school.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {list.map((a) => (
          <button
            key={a.id}
            type="button"
            className="panel"
            style={{ margin: 0, padding: 8, textAlign: "left", cursor: "pointer" }}
            onClick={() => router.push(`${parentRoute(103)}?album=${a.id}`)}
          >
            <Thumb id={a.cover_photo_id} alt={`${a.title} cover`} />
            <strong style={{ display: "block", marginTop: 8 }}>{a.title}</strong>
            <small className="micro">{`${date(a.album_date)} · ${a.photo_count ?? 0} photo${a.photo_count === 1 ? "" : "s"}`}</small>
          </button>
        ))}
      </div>
      {!list.length && !albums.error ? <PmEmpty title="No albums yet">Albums the school shares with parents will appear here.</PmEmpty> : null}
    </>
  );
}

function AlbumView({ id }: { id: number }) {
  const { go } = useParent();
  const album = useApi<AlbumDetail>(`/api/v1/parent/me/gallery/${id}`);
  const [open, setOpen] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (album.loading && !album.data) return <PmLoading />;
  if (album.error || !album.data)
    return (
      <>
        <PmError>{album.error ?? "Album not found."}</PmError>
        <button className="action" onClick={() => go(103)}>
          All albums
        </button>
      </>
    );

  const a = album.data;
  const photos = a.photos;
  const i = open === null ? -1 : photos.findIndex((p) => p.id === open);
  const current = i >= 0 ? photos[i] : null;

  async function save(p: Photo) {
    setErr(null);
    const ext = p.content_type.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    try {
      await api.download(fileOf(p.id), `${a.title.replace(/[^\w -]+/g, "").trim() || "photo"}-${p.id}.${ext}`);
    } catch (e) {
      setErr(errorText(e));
    }
  }

  return (
    <>
      <div className="panel soft">
        <span className="eyebrow">{date(a.album_date).toUpperCase()}</span>
        <h3>{a.title}</h3>
        {a.description ? <p>{a.description}</p> : null}
        <p className="micro">{`${photos.length} photo${photos.length === 1 ? "" : "s"}${a.audience_label ? ` · ${a.audience_label}` : ""}`}</p>
      </div>
      <PmError>{err}</PmError>

      {current ? (
        <div className="panel" style={{ padding: 10 }}>
          <Thumb id={current.id} alt={current.caption ?? `Photo ${i + 1}`} />
          {current.caption ? <p>{current.caption}</p> : null}
          <div className="between" style={{ marginTop: 8 }}>
            <button className="text-button" onClick={() => setOpen(photos[i - 1]?.id ?? null)} disabled={i === 0}>
              ‹ Previous
            </button>
            <span className="micro">{`${i + 1} of ${photos.length}`}</span>
            <button className="text-button" onClick={() => setOpen(photos[i + 1]?.id ?? null)} disabled={i === photos.length - 1}>
              Next ›
            </button>
          </div>
          <div className="between" style={{ marginTop: 8 }}>
            <button className="text-button" onClick={() => void save(current)}>
              Save photo
            </button>
            <button className="text-button" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {photos.map((p, k) => (
          <Thumb key={p.id} id={p.id} alt={p.caption ?? `Photo ${k + 1}`} onClick={() => setOpen(p.id)} />
        ))}
      </div>
      {!photos.length ? <PmEmpty title="No photos in this album yet" /> : null}

      <button className="action" onClick={() => go(103)}>
        All albums
      </button>
    </>
  );
}
