"use client";

/*
 * Uploaded files on a record (homework, a submission, a leave request, an
 * event…). The backend serves each one from the record's own …/files/{id}
 * path, behind that record's access check, so opening goes through api.open /
 * api.download with the bearer token rather than a plain link.
 */

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { api, errorText } from "@/lib/api";
import { Icon } from "./Icon";

export type Attachment = {
  id: number;
  file_name: string;
  content_type: string;
  size_bytes: number;
  uploaded_by_name?: string | null;
  created_at: string;
};

/** What the attachment endpoints take (backend: storage.ATTACHMENT_TYPES, 10 MB, 5 per record). */
export const ATTACH_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx";
export const ATTACH_RULES = "PDF, JPG, PNG, WEBP or Word · up to 10 MB each · 5 files at most";

const INLINE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

export function fileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** PDFs and images open in a tab; Word files download. */
export function openAttachment(path: string, a: Attachment): Promise<void> {
  return INLINE.has(a.content_type) ? api.open(path) : api.download(path, a.file_name);
}

/** Multipart body with each file under `files`. */
export function filesForm(files: File[], field = "files"): FormData {
  const fd = new FormData();
  for (const f of files) fd.append(field, f);
  return fd;
}

/** One row per file, in the mock's document-card style: open, and remove when allowed. */
export function FileCards({
  files,
  pathOf,
  note,
  onRemove,
  onError,
}: {
  files: Attachment[];
  pathOf: (a: Attachment) => string;
  note?: string;
  onRemove?: (a: Attachment) => void;
  onError?: (msg: string) => void;
}) {
  return (
    <>
      {files.map((a) => {
        const ext = (a.file_name.split(".").pop() ?? "").toUpperCase();
        return (
          <div className="document-card" key={a.id}>
            <div className={`file-icon ${ext === "PDF" ? "pdf" : ""}`}>{ext.length && ext.length <= 4 ? ext : "FILE"}</div>
            <div className="document-info">
              <h4>{a.file_name}</h4>
              <p>{[note, fileSize(a.size_bytes), a.uploaded_by_name].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="row">
              <button type="button" className="btn" onClick={() => openAttachment(pathOf(a), a).catch((e) => onError?.(errorText(e)))}>
                Open
              </button>
              {onRemove ? (
                <button type="button" className="btn text" aria-label={`Remove ${a.file_name}`} onClick={() => onRemove(a)}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </>
  );
}

/** The mock's upload zone: click to choose, or drop files on it. Calls `onFiles` right away. */
export function UploadZone({
  onFiles,
  busy = false,
  disabled = false,
  title = "Choose a file to upload",
  rules = ATTACH_RULES,
  accept = ATTACH_ACCEPT,
  multiple = true,
}: {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  disabled?: boolean;
  title?: string;
  rules?: string;
  accept?: string;
  multiple?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const off = disabled || busy;

  function take(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length && !off) onFiles(files);
    if (input.current) input.current.value = "";
  }

  return (
    <div
      className="upload-zone"
      style={over ? { borderColor: "var(--blue)" } : undefined}
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        if (!off) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
    >
      <Icon name="folder" />
      <strong>{busy ? "Uploading…" : title}</strong>
      or drag and drop it here
      <br />
      <span className="small muted">{rules}</span>
      <input
        ref={input}
        type="file"
        aria-label="Choose file"
        accept={accept}
        multiple={multiple}
        disabled={off}
        onChange={(e: ChangeEvent<HTMLInputElement>) => take(e.target.files)}
      />
    </div>
  );
}
