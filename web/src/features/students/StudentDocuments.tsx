"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { download, upload } from "./files";
import { StudentFrame } from "./StudentFrame";
import { DOC_CATEGORIES, type Doc } from "./records";
import type { StudentProfile } from "./types";

/**
 * SCR-063, live: GET /documents?owner_type=student&owner_id={id},
 * GET /documents/{doc}/file (open), POST /documents (multipart upload).
 */
export function StudentDocuments() {
  return <StudentFrame active={63}>{(s) => <Body s={s} />}</StudentFrame>;
}

function size(n: number | null) {
  if (!n) return "—";
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

function kindOf(d: Doc) {
  const ext = (d.original_name ?? "").split(".").pop()?.toUpperCase() ?? "";
  return ext && ext.length <= 4 ? ext : (d.content_type?.split("/").pop()?.toUpperCase() ?? "FILE");
}

function Body({ s }: { s: StudentProfile }) {
  const docs = useApi<Doc[]>("/api/v1/school/documents", { owner_type: "student", owner_id: s.id });
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = docs.data ?? [];
  const list = all.filter(
    (d) =>
      (!q || `${d.title} ${d.original_name ?? ""}`.toLowerCase().includes(q.toLowerCase())) &&
      (!category || d.category === category) &&
      (!status || d.verification_status === status),
  );
  const count = (v: Doc["verification_status"]) => String(all.filter((d) => d.verification_status === v).length);
  const stats = [
    { label: "Verified", value: docs.data ? count("verified") : "…", note: "Review completed" },
    { label: "Pending", value: docs.data ? count("pending") : "…", note: "Needs review" },
  ];

  // Uploads and verifications, newest first.
  const events = all
    .flatMap((d) => [
      { at: d.created_at, icon: "file" as const, title: `${d.title} uploaded`, by: d.uploaded_by_name ?? "School office" },
      ...(d.verified_at ? [{ at: d.verified_at, icon: "check" as const, title: `${d.title} ${d.verification_status}`, by: d.verified_by_name ?? "School office" }] : []),
    ])
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);

  async function open(d: Doc) {
    try {
      await download(`/api/v1/school/documents/${d.id}/file`, d.original_name ?? `${d.title}`);
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) {
      setError("Choose a file to upload.");
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("owner_type", "student");
    fd.append("owner_id", String(s.id));
    fd.append("category", String(f.get("category")));
    fd.append("title", String(f.get("title") ?? "").trim() || file.name);
    fd.append("visible_to_parent", f.get("visible_to_parent") ? "true" : "false");
    setBusy(true);
    setError(null);
    try {
      await upload("/api/v1/school/documents", fd);
      notify(`Uploaded ${file.name}.`);
      form.reset();
      docs.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student documents…" aria-label="Search documents" />
        </div>
        <select aria-label="Filter category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {DOC_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {label(c)}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <ErrorNote>{error ?? docs.error}</ErrorNote>
      <div className="two-col">
        <div className="stack">
          <Panel title="Documents" sub={`${s.full_name} · ${s.class_name ?? ""} ${s.section_name ?? ""}`}>
            {list.length ? (
              list.map((d) => (
                <div className="document-card" key={d.id}>
                  <div className={`file-icon ${kindOf(d).toLowerCase()}`}>{kindOf(d)}</div>
                  <div className="document-info">
                    <h4>{d.title}</h4>
                    <p>{`${label(d.category)} · ${date(d.created_at)} · ${size(d.size_bytes)}`}</p>
                  </div>
                  <Badge>{label(d.verification_status)}</Badge>
                  <button type="button" className="btn" onClick={() => open(d)}>
                    Open
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">{docs.loading ? "Loading documents…" : all.length ? "No documents match these filters." : "No documents have been uploaded for this student yet."}</p>
            )}
          </Panel>
          <Panel title="Recent activity">
            {events.length ? (
              events.map((ev, i) => (
                <div className="timeline-item" key={i}>
                  <span className="timeline-dot">
                    <Icon name={ev.icon} />
                  </span>
                  <div>
                    <h4>{ev.title}</h4>
                    <p>{ev.by}</p>
                  </div>
                  <time>{date(ev.at).slice(0, 6)}</time>
                </div>
              ))
            ) : (
              <p className="muted">No document activity yet.</p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Upload document" sub="Attach the correct record">
            <form id="upload-document" onSubmit={submit} className="stack">
              <label className="upload-zone">
                <Icon name="folder" />
                <strong>Choose a file to upload</strong>
                or drag and drop it here
                <br />
                <span className="small muted">PDF, PNG, JPG, DOCX or CSV</span>
                <input type="file" name="file" aria-label="Choose file" required />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>
                    Category<span className="req">*</span>
                  </span>
                  <select name="category" defaultValue="birth_certificate">
                    {DOC_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {label(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Title</span>
                  <input name="title" maxLength={200} placeholder="Defaults to the file name" />
                </label>
                <label className="field full">
                  <span>
                    <input type="checkbox" name="visible_to_parent" /> Parents can see this document
                  </span>
                </label>
              </div>
              <button type="submit" className="btn primary" disabled={busy}>
                <Icon name="check" className="sm" />
                {busy ? "Uploading…" : "Upload document"}
              </button>
            </form>
          </Panel>
          <Panel title="Document status">
            <StatStrip items={stats} compact />
          </Panel>
        </aside>
      </div>
    </>
  );
}
