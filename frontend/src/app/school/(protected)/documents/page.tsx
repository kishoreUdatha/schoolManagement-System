"use client";

import { FormEvent, useEffect, useState } from "react";

import { PickedStudent, StudentPicker } from "@/components/StudentPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { DOCUMENT_CATEGORIES, fileSize } from "@/lib/documents";
import { openAuthed } from "@/lib/download";

type Doc = {
  id: number;
  owner_type: "student" | "staff" | "school";
  owner_id: number | null;
  owner_name: string | null;
  category: string;
  title: string;
  size_bytes: number;
  original_name: string;
  expires_on: string | null;
  visible_to_parent: boolean;
  uploaded_by_name: string | null;
  uploaded_by_parent: boolean;
  verification_status: "pending" | "verified" | "rejected";
  verified_by_name: string | null;
  remarks: string | null;
  created_at: string;
};

type Summary = { pending_verification: number; expiring_soon: number; by_owner: Record<string, number> };

const vTone = { pending: "amber", verified: "emerald", rejected: "rose" } as const;

export default function DocumentsPage() {
  const [owner, setOwner] = useState("");
  const [verification, setVerification] = useState("");
  const [category, setCategory] = useState("");
  const [expiring, setExpiring] = useState(false);
  const [items, setItems] = useState<Doc[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [rejecting, setRejecting] = useState<Doc | null>(null);

  async function load() {
    try {
      const params: Record<string, string | boolean> = {};
      if (owner) params.owner_type = owner;
      if (verification) params.verification = verification;
      if (category) params.category = category;
      if (expiring) params.expiring = true;
      const [list, sum] = await Promise.all([
        api.get<Doc[]>("/api/v1/school/documents", { params }),
        api.get<Summary>("/api/v1/school/documents/summary"),
      ]);
      setItems(list.data);
      setSummary(sum.data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, verification, category, expiring]);

  async function verify(d: Doc) {
    try {
      await api.post(`/api/v1/school/documents/${d.id}/verify`, { status: "verified" });
      setNotice(`${d.title} verified.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function remove(d: Doc) {
    if (!window.confirm(`Delete "${d.title}"? The file is removed permanently.`)) return;
    try {
      await api.delete(`/api/v1/school/documents/${d.id}`);
      setNotice(`Deleted ${d.title}.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        subtitle="Student and staff records, school policies and circulars. Parent uploads wait here for verification."
        actions={<Button onClick={() => setUploading(true)}>+ Upload</Button>}
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {summary && (
        <div className="grid gap-4 sm:grid-cols-4">
          <button className="text-left" onClick={() => setVerification("pending")}>
            <StatCard
              label="Awaiting verification"
              value={summary.pending_verification}
              accent={summary.pending_verification ? "amber" : "brand"}
            />
          </button>
          <button className="text-left" onClick={() => setExpiring(true)}>
            <StatCard label="Expiring in 30 days" value={summary.expiring_soon} accent={summary.expiring_soon ? "rose" : "brand"} />
          </button>
          <StatCard label="Student documents" value={summary.by_owner.student ?? 0} />
          <StatCard label="Staff & school" value={(summary.by_owner.staff ?? 0) + (summary.by_owner.school ?? 0)} />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Select label="Belongs to" value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Everyone</option>
          <option value="student">Students</option>
          <option value="staff">Staff</option>
          <option value="school">School</option>
        </Select>
        <Select label="Verification" value={verification} onChange={(e) => setVerification(e.target.value)}>
          <option value="">Any</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
        </Select>
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Any</option>
          {DOCUMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {humanize(c)}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 pb-2 text-sm text-ink-muted">
          <input type="checkbox" checked={expiring} onChange={(e) => setExpiring(e.target.checked)} />
          Expiring soon
        </label>
      </div>

      <Card>
        <Table
          head={["Document", "Belongs to", "Category", "Uploaded", "Status", ""]}
          empty={items.length === 0 && "No documents match."}
        >
          {items.map((d) => (
            <tr key={d.id} className="hover:bg-surface-hover">
              <td className={tdStrong}>
                <button className="text-left hover:underline" onClick={() => openAuthed(`/api/v1/school/documents/${d.id}/file`).catch((e) => setError(apiError(e)))}>
                  {d.title}
                </button>
                <div className="text-xs font-normal text-ink-subtle">
                  {d.original_name} · {fileSize(d.size_bytes)}
                  {d.expires_on && ` · expires ${d.expires_on}`}
                </div>
              </td>
              <td className={td}>
                {d.owner_type === "school" ? "School" : d.owner_name ?? "—"}
                {d.owner_type !== "school" && <div className="text-xs text-ink-subtle">{d.owner_type}</div>}
              </td>
              <td className={td}>{humanize(d.category)}</td>
              <td className={td}>
                {d.created_at.slice(0, 10)}
                <div className="text-xs text-ink-subtle">
                  {d.uploaded_by_name}
                  {d.uploaded_by_parent && " (parent)"}
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge tone={vTone[d.verification_status]}>{d.verification_status}</Badge>
                {d.remarks && <div className="text-xs text-ink-subtle">{d.remarks}</div>}
              </td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {d.verification_status !== "verified" && (
                  <Button size="sm" onClick={() => verify(d)}>
                    Verify
                  </Button>
                )}
                {d.verification_status === "pending" && (
                  <Button size="sm" variant="secondary" onClick={() => setRejecting(d)}>
                    Reject
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => remove(d)}>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {uploading && (
        <UploadModal
          onClose={() => setUploading(false)}
          onDone={(m) => {
            setUploading(false);
            setNotice(m);
            load();
          }}
        />
      )}
      {rejecting && (
        <RejectModal
          doc={rejecting}
          onClose={() => setRejecting(null)}
          onDone={() => {
            setRejecting(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function RejectModal({ doc, onClose, onDone }: { doc: Doc; onClose: () => void; onDone: () => void }) {
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/api/v1/school/documents/${doc.id}/verify`, { status: "rejected", remarks });
      onDone();
    } catch (err) {
      setError(apiError(err));
    }
  }
  return (
    <Modal open onClose={onClose} title={`Reject ${doc.title}`}>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Reason (shown to the parent) *" value={remarks} onChange={(e) => setRemarks(e.target.value)} required />
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger">
            Reject
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function UploadModal({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [ownerType, setOwnerType] = useState("student");
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [staff, setStaff] = useState<{ id: number; full_name: string }[]>([]);
  const [staffId, setStaffId] = useState("");
  const [category, setCategory] = useState("birth_certificate");
  const [title, setTitle] = useState("");
  const [expires, setExpires] = useState("");
  const [visible, setVisible] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ id: number; full_name: string }[]>("/api/v1/school/staff").then((r) => setStaff(r.data)).catch(() => undefined);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("owner_type", ownerType);
    if (ownerType === "student" && student) fd.append("owner_id", String(student.id));
    if (ownerType === "staff" && staffId) fd.append("owner_id", staffId);
    fd.append("category", category);
    fd.append("title", title);
    if (expires) fd.append("expires_on", expires);
    fd.append("visible_to_parent", String(visible));
    try {
      await api.post("/api/v1/school/documents", fd);
      onDone(`Uploaded ${title || file.name}.`);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  const ownerReady = ownerType === "school" || (ownerType === "student" ? !!student : !!staffId);

  return (
    <Modal open onClose={onClose} title="Upload document">
      <form onSubmit={submit} className="space-y-4">
        <Select label="Belongs to" value={ownerType} onChange={(e) => setOwnerType(e.target.value)}>
          <option value="student">A student</option>
          <option value="staff">A staff member</option>
          <option value="school">The school (policy, circular)</option>
        </Select>
        {ownerType === "student" && <StudentPicker value={student} onChange={setStudent} />}
        {ownerType === "staff" && (
          <Select label="Staff member *" value={staffId} onChange={(e) => setStaffId(e.target.value)} required>
            <option value="">Select</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </Select>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </Select>
          <Input label="Title" placeholder="Defaults to the file name" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input label="Expires on" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          {ownerType === "student" && (
            <label className="flex items-center gap-2 pt-5 text-sm text-ink-muted">
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
              Parents can see it
            </label>
          )}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">File * (PDF, JPG, PNG, WEBP · max 10 MB)</span>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-ink-muted"
            required
          />
        </label>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy} disabled={!file || !ownerReady}>
            Upload
          </Button>
        </div>
      </form>
    </Modal>
  );
}
