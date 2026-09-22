"use client";

/*
 * PM-056 · Learning resources. Teacher-approved lesson videos
 * (GET …/videos, mark watched with POST/DELETE …/videos/{id}/completion) and
 * study material shared with parents (GET …/resources, files from
 * …/resources/{id}/file), filtered by subject.
 */

import { useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading, useChildPath } from "../support/pm";

type Video = {
  id: number;
  subject_name: string | null;
  title: string;
  description: string | null;
  youtube_url: string;
  thumbnail_url: string;
  teacher_name: string | null;
  created_at: string;
  is_completed: boolean | null;
};

type Resource = {
  id: number;
  subject_name: string | null;
  chapter_title: string | null;
  title: string;
  description: string | null;
  kind: string;
  url: string | null;
  file_name: string | null;
  has_file: boolean;
  visible_to_parents: boolean;
  is_active: boolean;
  uploaded_by_name: string | null;
  created_at: string;
};

export function LearningResources() {
  return (
    <ChildGate>
      <Resources />
    </ChildGate>
  );
}

function Resources() {
  const { notify } = useParent();
  const base = useChildPath();
  const videos = useApi<Video[]>(base && `${base}/videos`);
  const resources = useApi<Resource[]>(base && `${base}/resources`);
  const [subject, setSubject] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const vids = videos.data ?? [];
  const docs = (resources.data ?? []).filter((r) => r.is_active && r.visible_to_parents);
  const subjects = Array.from(new Set([...vids, ...docs].map((x) => x.subject_name).filter((s): s is string => Boolean(s)))).sort();
  const match = (s: string | null) => !subject || s === subject;
  const shownVids = vids.filter((v) => match(v.subject_name));
  const shownDocs = docs.filter((r) => match(r.subject_name));
  const [feature, ...moreVids] = shownVids;

  async function toggleWatched(v: Video) {
    if (!base) return;
    setBusy(v.id);
    setErr(null);
    const path = `${base}/videos/${v.id}/completion`;
    try {
      if (v.is_completed) await api.delete(path);
      else await api.post(path);
      notify(v.is_completed ? "Marked as not watched." : "Marked as watched.");
      videos.reload();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  function openResource(r: Resource) {
    if (r.has_file) {
      const path = `${base}/resources/${r.id}/file`;
      const run = r.file_name && !r.file_name.toLowerCase().endsWith(".pdf") ? api.download(path, r.file_name) : api.open(path);
      run.catch((e) => setErr(errorText(e)));
    } else if (r.url) {
      window.open(r.url, "_blank", "noopener");
    }
  }

  const loading = (videos.loading && !videos.data) || (resources.loading && !resources.data);

  return (
    <>
      <label className="field">
        Subject
        <select value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      <PmError>{err || videos.error || resources.error}</PmError>
      {loading ? <PmLoading /> : null}

      {feature ? (
        <>
          <a
            className="resource-cover"
            href={feature.youtube_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "block" }}
          >
            <span className="play">▶</span>
            <small>TEACHER RESOURCE</small>
            <h2>{feature.title}</h2>
            <p>
              Video lesson{feature.subject_name ? ` · ${feature.subject_name}` : ""}
              {feature.teacher_name ? ` · ${feature.teacher_name}` : ""}
            </p>
          </a>
          <button className="action" onClick={() => toggleWatched(feature)} disabled={busy === feature.id}>
            {feature.is_completed ? "Watched ✓ · Mark as not watched" : "Mark as watched"}
          </button>
        </>
      ) : null}

      {moreVids.map((v) => (
        <div key={v.id} className="item">
          <a href={v.youtube_url} target="_blank" rel="noopener noreferrer" style={{ flex: 1 }}>
            <span>
              <strong>{v.title}</strong>
              <small>
                Video{v.subject_name ? ` · ${v.subject_name}` : ""} · {date(v.created_at)}
              </small>
            </span>
          </a>
          <span className={v.is_completed ? "value good" : "value"}>
            <button className="text-button" onClick={() => toggleWatched(v)} disabled={busy === v.id}>
              {v.is_completed ? "Watched" : "Mark watched"}
            </button>
          </span>
        </div>
      ))}

      {shownDocs.map((r) => (
        <button key={r.id} className="item" onClick={() => openResource(r)} disabled={!r.has_file && !r.url}>
          <span>
            <strong>{r.title}</strong>
            <small>
              {label(r.kind)}
              {r.subject_name ? ` · ${r.subject_name}` : ""}
              {r.chapter_title ? ` · ${r.chapter_title}` : ""}
            </small>
          </span>
          <span className="value">{r.has_file || r.url ? "Open" : "—"}</span>
        </button>
      ))}

      {!loading && shownVids.length === 0 && shownDocs.length === 0 ? (
        <PmEmpty title="No resources yet">
          {subject ? `No resources for ${subject} yet.` : "Videos and study material your child’s teachers share will appear here."}
        </PmEmpty>
      ) : null}
    </>
  );
}
