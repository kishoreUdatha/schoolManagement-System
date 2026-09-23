"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { EmptyGuide, ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Dialog, openFile, postForm, usePageAction } from "./planKit";
import { RESOURCE_KINDS, type ClassSubject, type Resource, type SyllabusDetail } from "./planTypes";

import { ask } from "@/lib/dialog";
const base = "/api/v1/school/teaching-resources";

const ICON: Record<string, [string, string]> = {
  document: ["DOC", ""],
  worksheet: ["PDF", "pdf"],
  presentation: ["PPT", "pdf"],
  link: ["URL", ""],
  video: ["VID", "xls"],
  image: ["IMG", "xls"],
  other: ["FILE", ""],
};

function fileLabel(r: Resource): [string, string] {
  const ext = r.file_name?.split(".").pop()?.toUpperCase();
  const [text, tone] = ICON[r.kind] ?? ICON.other;
  return [ext && ext.length <= 4 ? ext : text, tone];
}

function size(n: number | null) {
  if (!n) return "";
  return n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** SCR-106, live: GET /api/v1/school/teaching-resources (class_subject_id, kind, search); upload, share and remove. */
export function TeachingResources() {
  const syllabus = useApi<ClassSubject[]>("/api/v1/school/syllabus");
  const [csId, setCsId] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [managing, setManaging] = useState<Resource | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const list = useApi<Resource[]>(base, { class_subject_id: csId, kind, search, include_inactive: status === "inactive" ? true : undefined });
  const items = (list.data ?? []).filter((r) => (status === "shared" ? r.is_active && r.visible_to_parents : status === "staff" ? r.is_active && !r.visible_to_parents : status === "inactive" ? !r.is_active : true));
  const live = (list.data ?? []).filter((r) => r.is_active);
  const n = (v: number) => (list.loading && !list.data ? (list.loading ? "…" : "—") : String(v));
  const stats = [
    { label: "Resources", value: n(live.length), note: `for ${new Set(live.map((r) => r.class_subject_id)).size} class subjects` },
    { label: "Shared with parents", value: n(live.filter((r) => r.visible_to_parents).length), note: `${live.filter((r) => !r.visible_to_parents).length} staff only` },
    { label: "Downloads", value: n(live.reduce((s, r) => s + r.downloads, 0)), note: "across these resources" },
    { label: "Added this month", value: n(live.filter((r) => r.created_at.slice(0, 7) === new Date().toISOString().slice(0, 7)).length), note: "new uploads and links" },
  ];
  const canEdit = (r: Resource) => Boolean(syllabus.data?.find((s) => s.class_subject_id === r.class_subject_id)?.can_edit);

  usePageAction(
    "resources:upload",
    useCallback(() => setUploading(true), []),
  );

  async function preview(r: Resource) {
    setError(null);
    try {
      if (r.has_file) await openFile(`${base}/${r.id}/file`);
      else if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function run(fn: () => Promise<unknown>, done: string) {
    setError(null);
    try {
      await fn();
      notify(done);
      setManaging(null);
      list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search teaching resources…" aria-label="Search teaching resources" />
        </div>
        <select aria-label="Filter by subject" value={csId} onChange={(e) => setCsId(e.target.value)}>
          <option value="">All classes</option>
          {syllabus.data?.map((s) => (
            <option key={s.class_subject_id} value={s.class_subject_id}>
              {`${s.class_name} · ${s.subject_name}`}
            </option>
          ))}
        </select>
        <select aria-label="Filter by kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>
          {RESOURCE_KINDS.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="shared">Shared with parents</option>
          <option value="staff">Staff only</option>
          <option value="inactive">Removed</option>
        </select>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      {items.length === 0 ? (
        <section className="panel">
          {list.loading || search || csId || kind || status ? (
            <div className="panel-pad muted">{list.loading ? "Loading resources…" : "No resources match these filters."}</div>
          ) : (
            <div className="panel-pad">
              <EmptyGuide
                title="No teaching resources yet"
                note="Notes, worksheets and links kept here sit against a class subject, and can be shared with parents."
                action={
                  <button type="button" className="btn primary" onClick={() => setUploading(true)}>
                    Upload resource
                  </button>
                }
              />
            </div>
          )}
        </section>
      ) : null}
      <div className="resource-grid">
        {items.map((r) => {
          const [text, tone] = fileLabel(r);
          return (
            <article className="resource-tile" key={r.id}>
              <div className={`file-icon ${tone}`}>{text}</div>
              <h3>{r.title}</h3>
              <p>
                {[r.subject_name, r.chapter_title, r.topic_title].filter(Boolean).join(" · ") || "—"}
                <br />
                {`Added ${date(r.created_at)}${r.uploaded_by_name ? ` by ${r.uploaded_by_name}` : ""}${r.has_file ? ` · ${size(r.size_bytes)} · ${r.downloads} downloads` : ""}`}
              </p>
              <div className="spread">
                <Badge>{!r.is_active ? "Inactive" : r.visible_to_parents ? "Published" : "Staff only"}</Badge>
                <div className="row" style={{ gap: 6 }}>
                  {canEdit(r) ? (
                    <button type="button" className="btn" onClick={() => setManaging(r)}>
                      Manage
                    </button>
                  ) : null}
                  {r.has_file || r.url ? (
                    <button type="button" className="btn" onClick={() => preview(r)}>
                      {r.has_file ? "Preview" : "Open link"}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <UploadDialog open={uploading} subjects={(syllabus.data ?? []).filter((s) => s.can_edit)} onClose={() => setUploading(false)} onSaved={() => { setUploading(false); list.reload(); }} />
      <Dialog title={managing?.title ?? ""} open={managing !== null} onClose={() => setManaging(null)}>
        {managing ? (
          <>
            <p>{managing.description || "No description."}</p>
            <div className="actions row" style={{ gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn"
                onClick={() => run(() => api.patch(`${base}/${managing.id}`, { visible_to_parents: !managing.visible_to_parents }), managing.visible_to_parents ? "Now staff only." : "Shared with parents.")}
              >
                {managing.visible_to_parents ? "Make staff only" : "Share with parents"}
              </button>
              {managing.is_active ? (
                <button type="button" className="btn" onClick={async () => (await ask(`Remove ${managing.title}?`)) && run(() => api.delete(`${base}/${managing.id}`), "Resource removed.")}>
                  Remove
                </button>
              ) : (
                <button type="button" className="btn" onClick={() => run(() => api.patch(`${base}/${managing.id}`, { is_active: true }), "Resource restored.")}>
                  Restore
                </button>
              )}
              <button type="button" className="btn primary" onClick={() => setManaging(null)}>
                Done
              </button>
            </div>
          </>
        ) : null}
      </Dialog>
    </>
  );
}

function UploadDialog({ open, subjects, onClose, onSaved }: { open: boolean; subjects: ClassSubject[]; onClose: () => void; onSaved: () => void }) {
  const [csId, setCsId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detail = useApi<SyllabusDetail>(open && csId ? `/api/v1/school/syllabus/${csId}` : null);

  useEffect(() => {
    if (open) {
      setError(null);
      setCsId((c) => c || (subjects[0] ? String(subjects[0].class_subject_id) : ""));
    }
  }, [open, subjects]);

  const chapters = detail.data?.items ?? [];
  const topics = chapters.find((c) => String(c.id) === chapterId)?.topics ?? [];

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const file = f.get("file");
    const url = String(f.get("url") ?? "").trim();
    const hasFile = file instanceof File && file.size > 0;
    if (!hasFile && !url) {
      setError("Attach a file or give a link.");
      return;
    }
    const fd = new FormData();
    fd.append("class_subject_id", csId);
    fd.append("title", String(f.get("title") ?? "").trim());
    fd.append("kind", String(f.get("kind") ?? "document"));
    const description = String(f.get("description") ?? "").trim();
    if (description) fd.append("description", description);
    if (url) fd.append("url", url);
    if (chapterId) fd.append("chapter_id", chapterId);
    const topic = String(f.get("topic_id") ?? "");
    if (topic) fd.append("topic_id", topic);
    fd.append("visible_to_parents", String(f.get("visible_to_parents") === "on"));
    if (hasFile) fd.append("file", file);
    setBusy(true);
    setError(null);
    try {
      await postForm(base, fd);
      notify("Resource added.");
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Upload resource" open={open} onClose={onClose} wide>
      <form onSubmit={submit}>
        <ErrorNote>{error ?? (!subjects.length ? "You can add resources only to subjects you teach." : null)}</ErrorNote>
        <fieldset disabled={busy || !subjects.length} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="form-grid">
            <label className="field">
              <span>
                Subject<span className="req">*</span>
              </span>
              <select required value={csId} onChange={(e) => { setCsId(e.target.value); setChapterId(""); }}>
                {subjects.map((s) => (
                  <option key={s.class_subject_id} value={s.class_subject_id}>
                    {`${s.class_name} · ${s.subject_name}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Kind</span>
              <select name="kind" defaultValue="document">
                {RESOURCE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {label(k)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field full">
              <span>
                Title<span className="req">*</span>
              </span>
              <input name="title" required minLength={2} placeholder="e.g. Fractions practice pack" />
            </label>
            <label className="field">
              <span>Unit</span>
              <select value={chapterId} onChange={(e) => setChapterId(e.target.value)}>
                <option value="">Whole subject</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Topic</span>
              <select name="topic_id" disabled={!topics.length}>
                <option value="">Any topic</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field full">
              <span>Description</span>
              <textarea name="description" placeholder="What it is and how to use it" />
            </label>
            <label className="field full">
              <span>Link</span>
              <input name="url" type="url" placeholder="https://… (or attach a file below)" />
            </label>
            <div className="field full">
              <div className="upload-zone">
                <Icon name="folder" />
                <strong>Choose a file to upload</strong>
                <span className="small muted">PDF, image, document or presentation</span>
                <input type="file" name="file" aria-label="Choose file" />
              </div>
            </div>
            <label className="field full" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <input type="checkbox" name="visible_to_parents" />
              <span>Share with parents</span>
            </label>
          </div>
        </fieldset>
        <div className="actions row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !subjects.length}>
            <Icon name="check" className="sm" />
            {busy ? "Uploading…" : "Upload resource"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
