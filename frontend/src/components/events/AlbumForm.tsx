"use client";

import { FormEvent, useEffect, useState } from "react";

import { AudienceFields, type Audience } from "@/components/events/AudienceFields";
import type { Album } from "@/components/events/Gallery";
import { Button } from "@/components/ui/Button";
import { ErrorBox, Textarea } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

export function AlbumForm({
  open,
  album,
  onClose,
  onSaved,
}: {
  open: boolean;
  album: Album | null;
  onClose: () => void;
  onSaved: (a: Album) => void;
}) {
  const blank = {
    title: "",
    description: "",
    album_date: new Date().toISOString().slice(0, 10),
    audience: "everyone" as Audience,
    classId: "",
    sectionId: "",
  };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setF(
      album
        ? {
            title: album.title,
            description: album.description ?? "",
            album_date: album.album_date,
            audience: album.audience,
            classId: album.class_id ? String(album.class_id) : "",
            sectionId: album.section_id ? String(album.section_id) : "",
          }
        : blank
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [album, open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = {
      title: f.title,
      description: f.description.trim() || null,
      album_date: f.album_date,
      audience: f.audience,
      class_id: f.classId ? Number(f.classId) : null,
      section_id: f.sectionId ? Number(f.sectionId) : null,
      event_id: album?.event_id ?? null,
    };
    try {
      const r = album
        ? await api.put<Album>(`/api/v1/school/gallery/${album.id}`, body)
        : await api.post<Album>("/api/v1/school/gallery", body);
      onSaved(r.data);
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={album ? "Edit album" : "New album"}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorBox>{error}</ErrorBox>
        <Input label="Title *" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required minLength={2} />
        <Input label="Date *" type="date" value={f.album_date} onChange={(e) => setF({ ...f, album_date: e.target.value })} required />
        <AudienceFields audience={f.audience} classId={f.classId} sectionId={f.sectionId} onChange={(v) => setF({ ...f, ...v })} />
        <Textarea label="Description" rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
