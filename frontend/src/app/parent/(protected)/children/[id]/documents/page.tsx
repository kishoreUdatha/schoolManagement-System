"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select, humanize } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";
import { PARENT_UPLOAD_CATEGORIES, fileSize } from "@/lib/documents";
import { openAuthed } from "@/lib/download";

type Doc = {
  id: number;
  category: string;
  title: string;
  size_bytes: number;
  uploaded_by_parent: boolean;
  verification_status: "pending" | "verified" | "rejected";
  remarks: string | null;
  created_at: string;
};

type Template = { id: number; name: string };

type Cert = {
  id: number;
  template_name: string | null;
  status: "requested" | "issued" | "rejected" | "cancelled";
  purpose: string | null;
  serial_no: string | null;
  issued_on: string | null;
  remarks: string | null;
  created_at: string;
};

const vTone = { pending: "amber", verified: "emerald", rejected: "rose" } as const;
const cTone = { requested: "amber", issued: "emerald", rejected: "rose", cancelled: "neutral" } as const;

export default function ChildDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const base = `/api/v1/parent/me/children/${id}`;
  const [docs, setDocs] = useState<Doc[]>([]);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [available, setAvailable] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState("birth_certificate");
  const [uploading, setUploading] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [purpose, setPurpose] = useState("");

  async function load() {
    try {
      const [d, c, a] = await Promise.all([
        api.get<Doc[]>(`${base}/documents`),
        api.get<Cert[]>(`${base}/certificates`),
        api.get<Template[]>(`${base}/certificates/available`),
      ]);
      setDocs(d.data);
      setCerts(c.data);
      setAvailable(a.data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category);
    fd.append("title", humanize(category));
    try {
      await api.post(`${base}/documents`, fd);
      setNotice("Uploaded. The school office will verify it.");
      setFile(null);
      (e.target as HTMLFormElement).reset();
      load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setUploading(false);
    }
  }

  async function withdraw(d: Doc) {
    try {
      await api.delete(`${base}/documents/${d.id}`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function requestCert(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`${base}/certificates`, { template_id: Number(templateId), purpose });
      setNotice("Request sent. You'll be able to download the certificate here once the school issues it.");
      setTemplateId("");
      setPurpose("");
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <div className="space-y-4">
      <Link href={`/parent/children/${id}`} className="text-sm text-brand-700 hover:underline">
        ← Back
      </Link>
      <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Documents & certificates</h1>
      {error && <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>}
      {notice && <div className="rounded-lg bg-[#E9F7F0] px-4 py-3 text-[13px] font-medium text-[#07845E] dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Certificates</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {available.length > 0 && (
            <form onSubmit={requestCert} className="grid items-end gap-3 sm:grid-cols-4">
              <Select label="Request a certificate" value={templateId} onChange={(e) => setTemplateId(e.target.value)} required>
                <option value="">Select</option>
                {available.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <div className="sm:col-span-2">
                <Input label="Purpose" placeholder="e.g. passport, scholarship" value={purpose} onChange={(e) => setPurpose(e.target.value)} required minLength={3} />
              </div>
              <Button type="submit">Request</Button>
            </form>
          )}
          <ul className="divide-y divide-slate-100 text-sm">
            {certs.length === 0 && <li className="py-2 text-slate-500">No certificates yet.</li>}
            {certs.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-medium text-slate-900">{c.template_name}</span>{" "}
                  <Badge tone={cTone[c.status]}>{c.status}</Badge>
                  <div className="text-xs text-slate-500">
                    {c.purpose}
                    {c.serial_no && ` · ${c.serial_no} · ${c.issued_on}`}
                    {c.remarks && ` · ${c.remarks}`}
                  </div>
                </div>
                {c.status === "issued" && (
                  <Button size="sm" variant="secondary" onClick={() => openAuthed(`${base}/certificates/${c.id}/pdf`).catch((e) => setError(apiError(e)))}>
                    Download
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <form onSubmit={upload} className="grid items-end gap-3 sm:grid-cols-4">
            <Select label="Document type" value={category} onChange={(e) => setCategory(e.target.value)}>
              {PARENT_UPLOAD_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </Select>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-medium text-slate-600">File (PDF or photo, max 10 MB)</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" required />
            </label>
            <Button type="submit" loading={uploading} disabled={!file}>
              Upload
            </Button>
          </form>
          <ul className="divide-y divide-slate-100 text-sm">
            {docs.length === 0 && <li className="py-2 text-slate-500">No documents yet.</li>}
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <button className="font-medium text-slate-900 hover:underline" onClick={() => openAuthed(`${base}/documents/${d.id}/file`).catch((e) => setError(apiError(e)))}>
                    {d.title}
                  </button>{" "}
                  <Badge tone={vTone[d.verification_status]}>{d.verification_status}</Badge>
                  <div className="text-xs text-slate-500">
                    {d.created_at.slice(0, 10)} · {fileSize(d.size_bytes)}
                    {d.uploaded_by_parent ? " · uploaded by you" : " · from school"}
                    {d.remarks && ` · ${d.remarks}`}
                  </div>
                </div>
                {d.uploaded_by_parent && d.verification_status !== "verified" && (
                  <Button size="sm" variant="ghost" onClick={() => withdraw(d)}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
