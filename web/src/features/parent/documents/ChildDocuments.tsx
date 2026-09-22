"use client";

/*
 * PM-041 · Documents. The child's documents the school has released to
 * parents, plus the ones this parent uploaded for verification, and issued
 * certificates. Uploads go to the school for verification.
 */

import { useState, type FormEvent } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { ChildGate, PmEmpty, PmError, PmLoading, useChildPath, valueClass, type Tone } from "../support/pm";
import type { Certificate } from "./types";

import { ask } from "@/lib/dialog";
type Doc = {
  id: number;
  category: string;
  title: string;
  original_name: string;
  size_bytes: number;
  uploaded_by_parent?: boolean;
  verification_status: "pending" | "verified" | "rejected";
  remarks: string | null;
  expires_on: string | null;
  created_at: string;
};

/** Categories a parent may upload (as the old parent portal offered). */
const UPLOAD_CATEGORIES = [
  "birth_certificate",
  "aadhaar",
  "photo",
  "address_proof",
  "transfer_certificate",
  "previous_marksheet",
  "medical",
  "caste_certificate",
  "other",
];

const docTone: Record<Doc["verification_status"], Tone> = { pending: "warning", verified: "good", rejected: "bad" };

export function ChildDocuments() {
  return (
    <ChildGate>
      <Documents />
    </ChildGate>
  );
}

function Documents() {
  const { notify, go } = useParent();
  const base = useChildPath();
  const docs = useApi<Doc[]>(base && `${base}/documents`);
  const certs = useApi<Certificate[]>(base && `${base}/certificates`);
  const [category, setCategory] = useState("birth_certificate");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const open = (path: string) => api.open(path).catch((e) => setErr(errorText(e)));

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!base || !file) return;
    setBusy(true);
    setErr(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);
    fd.append("title", label(category));
    try {
      await api.upload(`${base}/documents`, fd);
      notify("Uploaded. The school office will verify it.");
      setFile(null);
      setFormKey((k) => k + 1);
      docs.reload();
    } catch (e2) {
      setErr(errorText(e2));
    } finally {
      setBusy(false);
    }
  }

  async function remove(d: Doc) {
    if (!base || !(await ask(`Remove “${d.title}”?`))) return;
    try {
      await api.delete(`${base}/documents/${d.id}`);
      notify("Document removed.");
      docs.reload();
    } catch (e) {
      setErr(errorText(e));
    }
  }

  const issued = (certs.data ?? []).filter((c) => c.status === "issued");

  return (
    <>
      <PmError>{err || docs.error || certs.error}</PmError>
      {docs.loading && !docs.data ? <PmLoading /> : null}

      {issued.map((c) => (
        <button key={`c${c.id}`} className="item" onClick={() => open(`${base}/certificates/${c.id}/pdf`)}>
          <span>
            <strong>{c.template_name ?? label(c.kind)}</strong>
            <small>
              {c.serial_no ? `${c.serial_no} · ` : ""}Issued {date(c.issued_on)}
            </small>
          </span>
          <span className="value">View</span>
        </button>
      ))}

      {(docs.data ?? []).map((d) => (
        <div key={d.id} className="item">
          <button className="text-button" style={{ textAlign: "left", flex: 1 }} onClick={() => open(`${base}/documents/${d.id}/file`)}>
            <span>
              <strong>{d.title}</strong>
              <small>
                {d.uploaded_by_parent ? "Uploaded by you" : "From school"} · {date(d.created_at)}
                {d.expires_on ? ` · Expires ${date(d.expires_on)}` : ""}
                {d.remarks ? ` · ${d.remarks}` : ""}
              </small>
            </span>
          </button>
          <span className={valueClass(docTone[d.verification_status])}>
            {label(d.verification_status)}
            {d.uploaded_by_parent && d.verification_status !== "verified" ? (
              <>
                {" · "}
                <button className="text-button" onClick={() => remove(d)}>
                  Remove
                </button>
              </>
            ) : null}
          </span>
        </div>
      ))}

      {docs.data && docs.data.length === 0 && issued.length === 0 ? (
        <PmEmpty title="No documents yet">Documents the school releases to you will appear here.</PmEmpty>
      ) : null}

      <form key={formKey} onSubmit={upload}>
        <label className="field">
          Document type
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {UPLOAD_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Upload requested document
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <button className="action" type="submit" disabled={busy || !file}>
          {busy ? "Uploading…" : "Submit document for verification"}
        </button>
      </form>
      <button className="action secondary" onClick={() => go(42)}>
        Request a certificate
      </button>
    </>
  );
}
