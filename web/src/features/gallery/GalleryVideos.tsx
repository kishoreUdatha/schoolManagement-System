"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { EVENT_AUDIENCE, useCurrentClasses, useRole, type EventAudience, type SchoolEvent } from "@/features/communication/shared";
import { Field, Kv, SearchBox, confirmed, formNum, formText, today, useNewFlag } from "@/features/transport/kit";
import type { Album, AlbumDetail, Photo, TeacherClasses, Video } from "./types";

const GALLERY = "/api/v1/school/gallery";
const photoFile = (id: number) => `${GALLERY}/photos/${id}/file`;
const MAX_UPLOAD = 30;

/** Rewrites one query parameter and keeps the rest (tab, album). */
function useQuery() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const set = (changes: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    router.replace(s ? `${path}?${s}` : path, { scroll: false });
  };
  return { params, set };
}

/**
 * NEW-025 Gallery & Videos. Photo albums: GET/POST /school/gallery,
 * GET/PUT/DELETE /gallery/{id}, POST …/publish, POST …/photos (multipart),
 * PATCH/DELETE /gallery/photos/{id}, GET …/file for the pictures. Videos:
 * the office lists and removes (GET /school/videos, DELETE /school/videos/{id});
 * a teacher adds their own (POST /teacher/videos), which the school API does not offer.
 */
export function GalleryVideos() {
  const role = useRole();
  const { params, set } = useQuery();
  const tab = params.get("tab") === "videos" ? "videos" : "albums";
  const albumId = params.get("album");
  if (role === null) return <Loading />;
  const office = role === "school_admin";
  return (
    <>
      <nav className="module-tabs">
        <button type="button" className={tab === "albums" ? "active" : ""} onClick={() => set({ tab: null, album: null, new: null })}>
          Photo albums
        </button>
        <button type="button" className={tab === "videos" ? "active" : ""} onClick={() => set({ tab: "videos", album: null, new: null })}>
          Learning videos
        </button>
      </nav>
      {tab === "videos" ? (
        role === "teacher" ? <TeacherVideos /> : <SchoolVideos canRemove={office} />
      ) : albumId ? (
        <AlbumView id={albumId} canManage={office} onBack={() => set({ album: null })} />
      ) : (
        <AlbumList canManage={office} onOpen={(id) => set({ album: String(id), new: null })} />
      )}
    </>
  );
}

/** A protected photo, fetched with the token and shown from a local object URL. */
function Thumb({ id, alt, height = 150 }: { id: number | null; alt: string; height?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (id === null) return;
    let url: string | null = null;
    let live = true;
    api
      .blob(photoFile(id))
      .then((b) => {
        if (!live) return;
        url = URL.createObjectURL(b);
        setSrc(url);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  const box = { width: "100%", height, borderRadius: 10, background: "#eef3fb", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" } as const;
  if (id === null || failed || !src) {
    return (
      <div style={box} aria-label={alt}>
        <span className="muted small">{id === null ? "No photos yet" : failed ? "Photo unavailable" : "Loading…"}</span>
      </div>
    );
  }
  return (
    <div style={box}>
      <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );
}

function AlbumList({ canManage, onOpen }: { canManage: boolean; onOpen: (id: number) => void }) {
  const albums = useApi<Album[]>(GALLERY);
  const [adding, closeAdd] = useNewFlag();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const all = albums.data ?? [];
  const q = search.trim().toLowerCase();
  const items = all.filter((a) => (!status || (status === "published" ? a.is_published : !a.is_published)) && (!q || `${a.title} ${a.description ?? ""} ${a.audience_label}`.toLowerCase().includes(q)));
  const stats = [
    { label: "Albums", value: albums.data ? String(all.length) : "…", note: "All albums" },
    { label: "Published", value: albums.data ? String(all.filter((a) => a.is_published).length) : "…", note: "Visible to their audience" },
    { label: "Drafts", value: albums.data ? String(all.filter((a) => !a.is_published).length) : "…", note: "Only staff can see these" },
    { label: "Photos", value: albums.data ? String(all.reduce((n, a) => n + a.photo_count, 0)) : "…", note: "Across all albums" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search albums…" />
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </select>
      </div>
      <ErrorNote>{albums.error}</ErrorNote>
      {!items.length ? (
        <section className="panel">
          <div className="panel-pad muted">{albums.loading ? "Loading albums…" : all.length ? "No albums match these filters." : canManage ? "No albums yet. Create the first one with New album." : "No albums yet."}</div>
        </section>
      ) : null}
      <div className="resource-grid">
        {items.map((a) => (
          <article className="resource-tile" key={a.id}>
            <Thumb id={a.cover_photo_id} alt={a.title} />
            <h3>{a.title}</h3>
            <p>
              {`${date(a.album_date)} · ${a.audience_label || EVENT_AUDIENCE[a.audience]}`}
              <br />
              {`${a.photo_count} photo(s)`}
            </p>
            <div className="spread">
              <Badge>{a.is_published ? "Published" : "Draft"}</Badge>
              <button type="button" className="btn" onClick={() => onOpen(a.id)}>
                Open
              </button>
            </div>
          </article>
        ))}
      </div>
      {canManage && adding ? (
        <AlbumForm
          album={null}
          onClose={closeAdd}
          onSaved={(a) => {
            albums.reload();
            onOpen(a.id);
          }}
        />
      ) : null}
    </>
  );
}

function AlbumForm({ album, onClose, onSaved }: { album: Album | null; onClose: () => void; onSaved: (a: Album) => void }) {
  const { classes } = useCurrentClasses();
  const events = useApi<SchoolEvent[]>("/api/v1/school/events");
  const [audience, setAudience] = useState<EventAudience>(album?.audience ?? "everyone");
  const [classId, setClassId] = useState(album?.class_id ? String(album.class_id) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sections = classes.find((c) => String(c.id) === classId)?.sections ?? [];
  const needsClass = audience === "class_parents" || audience === "section_parents";

  async function save(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const body = {
      title: formText(f, "title"),
      description: formText(f, "description"),
      album_date: formText(f, "album_date"),
      audience,
      class_id: needsClass ? formNum(f, "class_id") : null,
      section_id: audience === "section_parents" ? formNum(f, "section_id") : null,
      event_id: formNum(f, "event_id"),
    };
    setSaving(true);
    setError(null);
    try {
      const saved = album ? await api.put<Album>(`${GALLERY}/${album.id}`, body) : await api.post<Album>(GALLERY, body);
      notify(album ? "Album updated." : "Album created as a draft. Add photos, then publish it.");
      onSaved(saved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      title={album ? `Edit · ${album.title}` : "New album"}
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Save album"}
          </button>
        </>
      }
    >
      <ErrorNote>{error ?? events.error}</ErrorNote>
      <div className="form-grid">
        <Field label="Title" required full>
          <input name="title" required minLength={2} maxLength={200} defaultValue={album?.title ?? ""} placeholder="e.g. Annual Day 2026" />
        </Field>
        <Field label="Date" required>
          <input type="date" name="album_date" required defaultValue={album?.album_date ?? today()} />
        </Field>
        <Field label="Event">
          <select name="event_id" defaultValue={album?.event_id ?? ""}>
            <option value="">Not linked to an event</option>
            {events.data?.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {`${ev.title} · ${date(ev.start_date)}`}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Who can see it" required>
          <select value={audience} onChange={(e) => setAudience(e.target.value as EventAudience)}>
            {Object.entries(EVENT_AUDIENCE).map(([k, t]) => (
              <option key={k} value={k}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        {needsClass ? (
          <Field label="Class" required>
            <select name="class_id" required value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {audience === "section_parents" ? (
          <Field label="Section" required>
            <select name="section_id" required defaultValue={album?.section_id ?? ""}>
              <option value="">Select section</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Description" full>
          <textarea name="description" maxLength={5000} defaultValue={album?.description ?? ""} />
        </Field>
      </div>
    </Dialog>
  );
}

function AlbumView({ id, canManage, onBack }: { id: string; canManage: boolean; onBack: () => void }) {
  const album = useApi<AlbumDetail>(`${GALLERY}/${id}`);
  const file = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [captioning, setCaptioning] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (album.loading && !album.data) return <Loading what="Loading the album…" />;
  const a = album.data;
  if (!a) {
    return (
      <>
        <ErrorNote>{album.error ?? "Album not found."}</ErrorNote>
        <button type="button" className="btn" onClick={onBack}>
          <Icon name="arrow" className="sm" />
          All albums
        </button>
      </>
    );
  }

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      notify(done);
      album.reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (files.length > MAX_UPLOAD) {
      setError(`Choose at most ${MAX_UPLOAD} photos at a time.`);
      return;
    }
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    await run(() => api.upload(`${GALLERY}/${a!.id}/photos`, form), `${files.length} photo(s) added.`);
    if (file.current) file.current.value = "";
  }

  async function removeAlbum() {
    if (!confirmed(`Delete “${a!.title}” and all ${a!.photos.length} of its photos? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api.delete(`${GALLERY}/${a!.id}`);
      notify("Album deleted.");
      onBack();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  function saveCaption(e: FormEvent<HTMLFormElement>) {
    const caption = formText(new FormData(e.currentTarget), "caption");
    run(() => api.patch(`${GALLERY}/photos/${captioning!.id}`, { caption }), "Caption saved.").then((ok) => ok && setCaptioning(null));
  }

  return (
    <>
      <section className="panel profile-banner">
        <div className="profile-hero">
          <div className="row">
            <span className="avatar large">
              <Icon name="folder" />
            </span>
            <div>
              <h2>{a.title}</h2>
              <p>{`${date(a.album_date)} · ${a.audience_label || EVENT_AUDIENCE[a.audience]} · ${a.photos.length} photo(s)`}</p>
            </div>
          </div>
          <Badge>{a.is_published ? "Published" : "Draft"}</Badge>
        </div>
      </section>
      <ErrorNote>{error ?? album.error}</ErrorNote>
      <div className="filterbar">
        <button type="button" className="btn" onClick={onBack}>
          <Icon name="arrow" className="sm" />
          All albums
        </button>
        {canManage ? (
          <>
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
            <button type="button" className="btn" disabled={busy} onClick={() => file.current?.click()}>
              <Icon name="plus" className="sm" />
              {busy ? "Working…" : "Add photos"}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={() => setEditing(true)}>
              Edit album
            </button>
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() => run(() => api.post(`${GALLERY}/${a.id}/publish`, undefined, { published: !a.is_published }), a.is_published ? "Album hidden from its audience." : "Published. The audience was notified.")}
            >
              <Icon name="check" className="sm" />
              {a.is_published ? "Unpublish" : "Publish"}
            </button>
            <button type="button" className="btn" disabled={busy} onClick={removeAlbum}>
              Delete album
            </button>
          </>
        ) : null}
      </div>
      {canManage ? <p className="muted small" style={{ marginBottom: 12 }}>{`JPG, PNG or WEBP · up to ${MAX_UPLOAD} photos at a time.`}</p> : null}
      <div className="two-col">
        <div>
          {!a.photos.length ? (
            <section className="panel">
              <div className="panel-pad muted">{canManage ? "No photos yet. Add some with Add photos." : "No photos yet."}</div>
            </section>
          ) : null}
          <div className="resource-grid">
            {a.photos.map((p) => (
              <article className="resource-tile" key={p.id}>
                <Thumb id={p.id} alt={p.caption ?? a.title} height={170} />
                <p style={{ marginTop: 10 }}>{p.caption ?? <span className="muted">No caption</span>}</p>
                {canManage ? (
                  <div className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn" onClick={() => setCaptioning(p)}>
                      Caption
                    </button>
                    <button type="button" className="btn" disabled={busy} onClick={() => confirmed("Delete this photo?") && run(() => api.delete(`${GALLERY}/photos/${p.id}`), "Photo deleted.")}>
                      Delete
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
        <aside className="stack">
          <div className="aside-panel">
            <h3>About this album</h3>
            <Kv
              rows={[
                ["Date", date(a.album_date)],
                ["Audience", a.audience_label || EVENT_AUDIENCE[a.audience]],
                ["Status", a.is_published ? "Published" : "Draft"],
                ["Photos", String(a.photos.length)],
              ]}
            />
            {a.description ? (
              <>
                <div className="gap" />
                <p>{a.description}</p>
              </>
            ) : null}
            <div className="gap" />
            <p>A draft is visible only to staff. Publishing shows it to its audience and notifies them.</p>
          </div>
        </aside>
      </div>
      {editing ? <AlbumForm album={a} onClose={() => setEditing(false)} onSaved={() => {
            setEditing(false);
            album.reload();
          }} /> : null}
      <Dialog
        open={captioning !== null}
        title="Photo caption"
        onClose={() => setCaptioning(null)}
        onSubmit={saveCaption}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setCaptioning(null)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              Save caption
            </button>
          </>
        }
      >
        <Field label="Caption" full>
          <input name="caption" maxLength={300} defaultValue={captioning?.caption ?? ""} key={captioning?.id} placeholder="Leave blank for no caption" />
        </Field>
      </Dialog>
    </>
  );
}

function videoRows(items: Video[]): Row[] {
  return items.map((v) => [
    v.title,
    [v.class_name, v.subject_name].filter(Boolean).join(" · ") || "—",
    v.teacher_name ?? "—",
    date(v.created_at),
    `${v.completion_count} of ${v.eligible_student_count}`,
    v.is_active ? "Active" : "Removed",
  ]);
}

const VIDEO_COLUMNS = ["Title", "Class & subject", "Teacher", "Added", "Watched", "Status"];

/** The office's view: every teacher's videos, with Remove (DELETE /school/videos/{id}). */
function SchoolVideos({ canRemove }: { canRemove: boolean }) {
  const [removed, setRemoved] = useState(false);
  const videos = useApi<Video[]>("/api/v1/school/videos", { include_removed: removed || undefined });
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const all = videos.data ?? [];
  const q = search.trim().toLowerCase();
  const items = useMemo(() => all.filter((v) => !q || `${v.title} ${v.class_name ?? ""} ${v.subject_name ?? ""} ${v.teacher_name ?? ""}`.toLowerCase().includes(q)), [all, q]);
  const active = all.filter((v) => v.is_active);
  const stats = [
    { label: "Videos", value: videos.data ? String(active.length) : "…", note: "Active learning videos" },
    { label: "Teachers", value: videos.data ? String(new Set(active.map((v) => v.teacher_user_id)).size) : "…", note: "Sharing videos" },
    { label: "Subjects", value: videos.data ? String(new Set(active.map((v) => v.class_subject_id)).size) : "…", note: "Class subjects covered" },
    { label: "Completions", value: videos.data ? String(active.reduce((n, v) => n + v.completion_count, 0)) : "…", note: "Students who marked a video watched" },
  ];

  async function remove(v: Video) {
    if (!confirmed(`Remove “${v.title}”? Students will no longer see it.`)) return;
    setError(null);
    try {
      await api.delete(`/api/v1/school/videos/${v.id}`);
      notify("Video removed.");
      videos.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <SearchBox value={search} onChange={setSearch} placeholder="Search videos…" />
        <select aria-label="Show removed videos" value={removed ? "all" : ""} onChange={(e) => setRemoved(e.target.value === "all")}>
          <option value="">Active videos</option>
          <option value="all">Include removed</option>
        </select>
      </div>
      <ErrorNote>{error ?? videos.error}</ErrorNote>
      <Panel title="Learning videos" sub="YouTube videos teachers share with their classes. Teachers add them from their own login." flush>
        <DataTable
          columns={VIDEO_COLUMNS}
          rows={videoRows(items)}
          selectable={false}
          actions={(i) => (
            <>
              <a className="btn" href={items[i].youtube_url} target="_blank" rel="noreferrer">
                Watch
              </a>
              {canRemove && items[i].is_active ? (
                <button type="button" className="btn" onClick={() => remove(items[i])}>
                  Remove
                </button>
              ) : null}
            </>
          )}
          empty={videos.loading ? "Loading videos…" : "No learning videos yet."}
        />
      </Panel>
    </>
  );
}

/** A teacher's own videos: GET/POST /teacher/videos, DELETE /teacher/videos/{id}. */
function TeacherVideos() {
  const videos = useApi<Video[]>("/api/v1/teacher/videos");
  const mine = useApi<TeacherClasses>("/api/v1/teacher/my-classes");
  const [adding, closeAdd] = useNewFlag();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subjects = (mine.data?.subject_teacher_of ?? []).filter((s) => s.is_current_year);
  const items = videos.data ?? [];

  async function add(e: FormEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api.post("/api/v1/teacher/videos", {
        title: formText(f, "title"),
        description: formText(f, "description"),
        youtube_url: formText(f, "youtube_url"),
        class_subject_id: formNum(f, "class_subject_id"),
      });
      notify("Video shared with the class.");
      closeAdd();
      videos.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove(v: Video) {
    if (!confirmed(`Remove “${v.title}”? Students will no longer see it.`)) return;
    try {
      await api.delete(`/api/v1/teacher/videos/${v.id}`);
      notify("Video removed.");
      videos.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <ErrorNote>{!adding ? (error ?? videos.error ?? mine.error) : null}</ErrorNote>
      <Panel title="My learning videos" sub={`${items.length} video(s) · YouTube links shared with your classes`} flush>
        <DataTable
          columns={VIDEO_COLUMNS}
          rows={videoRows(items)}
          selectable={false}
          actions={(i) => (
            <>
              <a className="btn" href={items[i].youtube_url} target="_blank" rel="noreferrer">
                Watch
              </a>
              {items[i].is_active ? (
                <button type="button" className="btn" onClick={() => remove(items[i])}>
                  Remove
                </button>
              ) : null}
            </>
          )}
          empty={videos.loading ? "Loading videos…" : "You have not shared any videos yet."}
        />
      </Panel>
      <Dialog
        open={adding}
        title="Share a video"
        onClose={closeAdd}
        onSubmit={add}
        actions={
          <>
            <button type="button" className="btn" onClick={closeAdd}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving || !subjects.length}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Share video"}
            </button>
          </>
        }
      >
        <ErrorNote>{error}</ErrorNote>
        {mine.data && !subjects.length ? <p className="muted">You do not teach a subject this year, so there is no class to share a video with.</p> : null}
        <div className="form-grid">
          <Field label="Class & subject" required>
            <select name="class_subject_id" required defaultValue="">
              <option value="">{mine.loading ? "Loading your subjects…" : "Select"}</option>
              {subjects.map((s) => (
                <option key={s.class_subject_id} value={s.class_subject_id}>
                  {`${s.class_name} · ${s.subject_name}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Title" required>
            <input name="title" required maxLength={200} />
          </Field>
          <Field label="YouTube link" required full>
            <input name="youtube_url" type="url" required placeholder="https://www.youtube.com/watch?v=…" />
          </Field>
          <Field label="Description" full>
            <textarea name="description" />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

/** Page-head button: "New album" on the albums tab, "Share a video" for a teacher on the videos tab. */
export function GalleryHeadAction() {
  const role = useRole();
  const { params, set } = useQuery();
  const videos = params.get("tab") === "videos";
  if (videos ? role !== "teacher" : role !== "school_admin") return null;
  return (
    <button type="button" className="btn primary" onClick={() => set({ new: "1", album: null })}>
      <Icon name="plus" className="sm" />
      {videos ? "Share a video" : "New album"}
    </button>
  );
}
