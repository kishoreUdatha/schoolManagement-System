"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AlbumForm } from "@/components/events/AlbumForm";
import { AlbumGrid, type Album } from "@/components/events/Gallery";
import { Button } from "@/components/ui/Button";
import { ErrorBox, PageHeader } from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";

export default function GalleryAdminPage() {
  const router = useRouter();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Album[]>("/api/v1/school/gallery")
      .then((r) => setAlbums(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Photo gallery"
        subtitle="Share event photos with parents and staff. Albums stay private until you publish them."
        actions={<Button onClick={() => setOpen(true)}>New album</Button>}
      />
      <ErrorBox>{error}</ErrorBox>
      <AlbumGrid
        albums={albums}
        showStatus
        photoUrl={(id) => `/api/v1/school/gallery/photos/${id}/file`}
        onOpen={(a) => router.push(`/school/gallery/${a.id}`)}
      />
      <AlbumForm open={open} album={null} onClose={() => setOpen(false)} onSaved={(a) => router.push(`/school/gallery/${a.id}`)} />
    </div>
  );
}
