"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { StudentProfile } from "@/features/students/types";
import { daysLeft, fileKind, fileSize, openFile, upload } from "./files";
import { StatusBadge, StudentSearch, type PickedStudent } from "./parts";
import {
  DOCUMENT_CATEGORIES,
  SCHOOL_CATEGORIES,
  STAFF_CATEGORIES,
  STUDENT_CATEGORIES,
  type Certificate,
  type Doc,
  type DocSummary,
  type OwnerType,
  type StaffRow,
} from "./types";

/**
 * SCR-256 Document Repository (scope "all"), SCR-257 Student Documents
 * ("student", optional ?id= student), SCR-258 Staff Documents ("staff",
 * optional ?id= staff) and SCR-259 Upload & Verification ("review",
 * optional ?doc=). One list over GET /api/v1/school/documents.
 */
export type Scope = "all" | "student" | "staff" | "review";

const CATEGORIES: Record<Scope, string[]> = {
  all: DOCUMENT_CATEGORIES,
  student: STUDENT_CATEGORIES,
  staff: STAFF_CATEGORIES,
  review: DOCUMENT_CATEGORIES,
};

const PLACEHOLDER: Record<Scope, string> = {
  all: "Search document repository…",
  student: "Search student documents…",
  staff: "Search staff documents…",
  review: "Search upload & verification…",
};

const ownerWord = (t: OwnerType) => (t === "student" ? "Student" : t === "staff" ? "Staff member" : "School");

export function DocumentList({ scope }: { scope: Scope }) {
  const router = useRouter();
  const params = useSearchParams();
  const ownerId = scope === "student" || scope === "staff" ? params.get("id") : null;
  const docParam = scope === "review" ? params.get("doc") : null;

  const [owner, setOwner] = useState<string>(scope === "student" || scope === "staff" ? scope : "");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState(scope === "review" ? "pending" : "");
  const [expiring, setExpiring] = useState(false);
  const [typed, setTyped] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(docParam ? Number(docParam) : null);
  const [error, setError] = useState<string | null>(null);

  const list = useApi<Doc[]>("/api/v1/school/documents", {
    owner_type: owner,
    owner_id: ownerId,
    category,
    verification: status,
    expiring: expiring ? true : undefined,
  });
  const summary = useApi<DocSummary>("/api/v1/school/documents/summary");
  const issued = useApi<Certificate[]>(scope === "review" ? null : "/api/v1/school/certificates", { status: "issued" });
  const student = useApi<StudentProfile>(scope === "student" && ownerId ? `/api/v1/school/students/${ownerId}` : null);
  // A document opened from elsewhere (?doc=) may not be in the pending list.
  const linked = useApi<Doc[]>(scope === "review" && docParam ? "/api/v1/school/documents" : null, {});

  const docs = useMemo(() => {
    const q = typed.trim().toLowerCase();
    const all = list.data ?? [];
    return q ? all.filter((d) => [d.title, d.owner_name, d.original_name].some((v) => (v ?? "").toLowerCase().includes(q))) : all;
  }, [list.data, typed]);

  const reload = () => {
    list.reload();
    summary.reload();
    if (docParam) linked.reload();
  };

  const selected = selectedId !== null ? (list.data?.find((d) => d.id === selectedId) ?? linked.data?.find((d) => d.id === selectedId) ?? null) : null;

  const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));
  const verified = docs.filter((d) => d.verification_status === "verified").length;
  const pending = docs.filter((d) => d.verification_status === "pending").length;
  const stats = [
    { label: "Verified", value: list.data ? n(verified) : "…", note: "Among the documents listed" },
    { label: "Pending", value: list.data ? n(pending) : "…", note: summary.data ? `${summary.data.pending_verification} across the school` : "Needs review" },
  ];

  let sub = "All owners";
  if (scope === "student") sub = ownerId ? (student.data ? `${student.data.full_name} · ${student.data.class_name ?? ""} ${student.data.section_name ?? ""}`.trim() : "Loading…") : "All students";
  if (scope === "staff") sub = ownerId ? (list.data?.[0]?.owner_name ?? "Staff member") : "All staff";
  if (scope === "review") sub = status ? `${label(status)} documents` : "Every verification state";
  if (scope === "all" && owner) sub = owner === "school" ? "School papers" : `${ownerWord(owner as OwnerType)} documents`;

  const activity = useMemo(() => {
    const ev: { at: string; icon: "file" | "check"; title: string; who: string }[] = [];
    (list.data ?? []).forEach((d) => {
      ev.push({ at: d.created_at, icon: "file", title: `${d.title} uploaded`, who: `${d.uploaded_by_name ?? "—"}${d.uploaded_by_parent ? " (parent)" : ""} · ${d.owner_type === "school" ? "School" : (d.owner_name ?? ownerWord(d.owner_type))}` });
      if (d.verified_at && d.verification_status !== "pending") {
        ev.push({ at: d.verified_at, icon: "check", title: `${d.title} ${d.verification_status}`, who: `${d.verified_by_name ?? "—"}${d.remarks ? ` · ${d.remarks}` : ""}` });
      }
    });
    return ev.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  }, [list.data]);

  const open = (d: Doc) => openFile(`/api/v1/school/documents/${d.id}/file`).catch((e) => setError(errorText(e)));

  async function remove(d: Doc) {
    if (!window.confirm(`Delete "${d.title}"? The file is removed permanently.`)) return;
    try {
      await api.delete(`/api/v1/school/documents/${d.id}`);
      notify(`Deleted ${d.title}.`);
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const folders = scope !== "review";

  return (
    <>
      {folders ? (
        <div className="folder-row">
          <Link className="folder-card" href={routeOf(257)}>
            <Icon name="folder" />
            <span>
              <strong>Student records</strong>
              <small>{summary.data ? `${n(summary.data.by_owner.student ?? 0)} files` : "…"}</small>
            </span>
          </Link>
          <Link className="folder-card" href={routeOf(258)}>
            <Icon name="folder" />
            <span>
              <strong>Staff documents</strong>
              <small>{summary.data ? `${n(summary.data.by_owner.staff ?? 0)} files` : "…"}</small>
            </span>
          </Link>
          <Link className="folder-card" href={routeOf(263)}>
            <Icon name="folder" />
            <span>
              <strong>Certificates</strong>
              <small>{issued.data ? `${n(issued.data.length)} issued` : "…"}</small>
            </span>
          </Link>
        </div>
      ) : null}
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={PLACEHOLDER[scope]} aria-label="Search documents" />
        </div>
        {scope === "all" || scope === "review" ? (
          <select aria-label="Belongs to" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Everyone</option>
            <option value="student">Students</option>
            <option value="staff">Staff</option>
            <option value="school">School</option>
          </select>
        ) : null}
        <select aria-label="Filter category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES[scope].map((c) => (
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
        <button type="button" className={`btn ${expiring ? "selected" : ""}`} aria-pressed={expiring} onClick={() => setExpiring(!expiring)}>
          <Icon name="calendar" className="sm" />
          {summary.data ? `Expiring in 30 days (${summary.data.expiring_soon})` : "Expiring in 30 days"}
        </button>
      </div>
      <ErrorNote>{error ?? list.error ?? summary.error}</ErrorNote>
      <div className="two-col">
        <div className="stack">
          <Panel title={scope === "review" ? "Documents for review" : "Documents"} sub={`${sub}${list.loading ? " · Loading…" : ""}`}>
            {docs.length ? (
              docs.map((d) => {
                const left = daysLeft(d.expires_on);
                const kind = fileKind(d);
                const meta = [
                  date(d.created_at),
                  fileSize(d.size_bytes),
                  scope !== "student" || !ownerId ? (d.owner_type === "school" ? "School" : (d.owner_name ?? ownerWord(d.owner_type))) : null,
                  label(d.category),
                  d.expires_on ? (left !== null && left < 0 ? `expired ${date(d.expires_on)}` : `expires ${date(d.expires_on)}`) : null,
                ].filter(Boolean);
                return (
                  <div className="document-card" key={d.id} style={selectedId === d.id ? { background: "#f5f9ff" } : undefined}>
                    <div className={`file-icon ${kind === "PDF" ? "pdf" : kind === "CSV" || kind === "XLSX" ? "xls" : ""}`}>{kind}</div>
                    <div className="document-info">
                      <h4>{d.title}</h4>
                      <p>{meta.join(" · ")}</p>
                    </div>
                    {left !== null && left < 0 ? <StatusBadge status="expired" /> : null}
                    <StatusBadge status={d.verification_status} />
                    <button type="button" className="btn" onClick={() => open(d)}>
                      Open
                    </button>
                    {scope === "review" ? (
                      <button type="button" className={`btn ${selectedId === d.id ? "primary" : ""}`} onClick={() => setSelectedId(d.id)}>
                        Review
                      </button>
                    ) : d.verification_status === "pending" ? (
                      <Link className="btn" href={`${routeOf(259)}?doc=${d.id}`}>
                        Review
                      </Link>
                    ) : null}
                    {scope !== "review" ? (
                      <button type="button" className="btn danger" onClick={() => remove(d)} aria-label={`Delete ${d.title}`}>
                        Delete
                      </button>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="muted">{list.loading ? "Loading documents…" : typed || category || status || expiring ? "No documents match these filters." : "No documents have been uploaded yet."}</p>
            )}
          </Panel>
          <Panel title="Recent activity">
            {activity.length ? (
              activity.map((a, i) => (
                <div className="timeline-item" key={i}>
                  <span className="timeline-dot">
                    <Icon name={a.icon} />
                  </span>
                  <div>
                    <h4>{a.title}</h4>
                    <p>{a.who}</p>
                  </div>
                  <time>{date(a.at).slice(0, 6)}</time>
                </div>
              ))
            ) : (
              <p className="muted">{list.loading ? "Loading…" : "No uploads or checks among these documents yet."}</p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          {scope === "review" ? (
            <ReviewPanels
              doc={selected}
              onDone={(m) => {
                notify(m);
                reload();
                if (docParam) router.replace(routeOf(259));
              }}
            />
          ) : (
            <div id="upload">
              <UploadPanel scope={scope} ownerId={ownerId} ownerName={scope === "student" ? (student.data?.full_name ?? null) : null} onDone={(m) => { notify(m); reload(); }} />
            </div>
          )}
          <Panel title="Document status">
            <StatStrip items={stats} compact />
          </Panel>
        </aside>
      </div>
    </>
  );
}

/** Upload (POST /api/v1/school/documents, multipart), as the old frontend's modal. */
function UploadPanel({ scope, ownerId, ownerName, onDone }: { scope: Scope; ownerId: string | null; ownerName: string | null; onDone: (m: string) => void }) {
  const fixedOwner = scope === "student" || scope === "staff" ? scope : null;
  const [ownerType, setOwnerType] = useState<OwnerType>(fixedOwner ?? "student");
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [staffId, setStaffId] = useState(scope === "staff" && ownerId ? ownerId : "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const staff = useApi<StaffRow[]>(ownerType === "staff" ? "/api/v1/school/staff" : null);
  const cats = ownerType === "student" ? STUDENT_CATEGORIES : ownerType === "staff" ? STAFF_CATEGORIES : SCHOOL_CATEGORIES;
  const presetStudent = scope === "student" && ownerId;

  useEffect(() => setError(null), [ownerType]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!file) return setError("Choose a file to upload.");
    let owner: string | null = null;
    if (ownerType === "student") owner = presetStudent ? ownerId : student ? String(student.id) : null;
    if (ownerType === "staff") owner = staffId || null;
    if (ownerType !== "school" && !owner) return setError(ownerType === "student" ? "Choose the student." : "Choose the staff member.");
    const body = new FormData();
    body.append("file", file);
    body.append("owner_type", ownerType);
    if (owner) body.append("owner_id", owner);
    body.append("category", String(f.get("category")));
    const title = String(f.get("title") ?? "").trim();
    body.append("title", title);
    const expires = String(f.get("expires_on") ?? "");
    if (expires) body.append("expires_on", expires);
    body.append("visible_to_parent", String(ownerType === "student" && f.get("visible_to_parent") === "on"));
    setBusy(true);
    setError(null);
    try {
      await upload("/api/v1/school/documents", body);
      setFile(null);
      setStudent(null);
      setFormKey((k) => k + 1);
      onDone(`Uploaded ${title || file.name}.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Upload document" sub="Attach the correct record">
      <form key={formKey} onSubmit={submit}>
        <div className="upload-zone">
          <Icon name="folder" />
          <strong>{file ? file.name : "Choose a file to upload"}</strong>
          {file ? fileSize(file.size) : "or drag and drop it here"}
          <br />
          <span className="small muted">PDF, JPG, PNG or WEBP · up to 10 MB</span>
          <input type="file" aria-label="Choose file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        </div>
        <div className="stack" style={{ marginTop: 14 }}>
          {!fixedOwner ? (
            <label className="field">
              <span>Belongs to</span>
              <select value={ownerType} onChange={(e) => setOwnerType(e.target.value as OwnerType)}>
                <option value="student">A student</option>
                <option value="staff">A staff member</option>
                <option value="school">The school (policy, circular)</option>
              </select>
            </label>
          ) : null}
          {ownerType === "student" ? (
            <label className="field">
              <span>
                Student
                <span className="req">*</span>
              </span>
              {presetStudent ? <input value={ownerName ?? "Loading…"} readOnly /> : <StudentSearch value={student} onChange={setStudent} required />}
            </label>
          ) : null}
          {ownerType === "staff" ? (
            <label className="field">
              <span>
                Staff member
                <span className="req">*</span>
              </span>
              <select value={staffId} onChange={(e) => setStaffId(e.target.value)} required>
                <option value="">{staff.loading ? "Loading staff…" : "Select staff member"}</option>
                {staff.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {`${s.full_name}${s.designation ? ` · ${s.designation}` : ""}`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="field">
            <span>
              Category
              <span className="req">*</span>
            </span>
            <select name="category" key={ownerType} defaultValue={cats[0]}>
              {cats.map((c) => (
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
          <label className="field">
            <span>Expires on</span>
            <input type="date" name="expires_on" />
          </label>
          {ownerType === "student" ? (
            <label className="check-item" style={{ padding: "4px 0" }}>
              <input type="checkbox" name="visible_to_parent" defaultChecked />
              Parents can see it
            </label>
          ) : null}
          <ErrorNote>{error}</ErrorNote>
          <button type="submit" className="btn primary" disabled={busy}>
            <Icon name="check" className="sm" />
            {busy ? "Uploading…" : "Upload document"}
          </button>
        </div>
      </form>
    </Panel>
  );
}

const CHECKS = ["Name matches the record", "Document is readable", "Dates and reference checked"];

/** Review details and the verify / reject decision (POST …/documents/{id}/verify). */
function ReviewPanels({ doc, onDone }: { doc: Doc | null; onDone: (m: string) => void }) {
  const [ticked, setTicked] = useState<boolean[]>(CHECKS.map(() => false));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTicked(CHECKS.map(() => false));
    setReason("");
    setError(null);
  }, [doc?.id]);

  async function decide(status: "verified" | "rejected") {
    if (!doc) return;
    if (status === "rejected" && reason.trim().length < 2) return setError("Give the reason for rejecting; the parent sees it.");
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/documents/${doc.id}/verify`, status === "verified" ? { status } : { status, remarks: reason.trim() });
      onDone(status === "verified" ? `${doc.title} verified.` : `${doc.title} rejected.`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const kv = (rows: [string, string][]) => (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );

  return (
    <>
      <Panel title="Review details">
        {doc ? (
          kv([
            [ownerWord(doc.owner_type), doc.owner_type === "school" ? "Whole school" : (doc.owner_name ?? "—")],
            ["Category", label(doc.category)],
            ["Document type", doc.original_name],
            ["Uploaded on", `${date(doc.created_at)}${doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}${doc.uploaded_by_parent ? " (parent)" : ""}` : ""}`],
            ["Expires", date(doc.expires_on)],
            ["Status", `${label(doc.verification_status)}${doc.verified_by_name ? ` · ${doc.verified_by_name}` : ""}`],
          ])
        ) : (
          <p className="muted">Choose Review on a document to check it.</p>
        )}
      </Panel>
      <div id="verification">
        <Panel title="Verification">
          <div className="checklist">
            {CHECKS.map((c, i) => (
              <div className="check-item" key={c}>
                <input
                  type="checkbox"
                  id={`check-${i}`}
                  aria-label={c}
                  checked={ticked[i]}
                  disabled={!doc}
                  onChange={(e) => setTicked(ticked.map((t, j) => (j === i ? e.target.checked : t)))}
                />
                <label htmlFor={`check-${i}`}>{c}</label>
              </div>
            ))}
          </div>
          <div className="gap" />
          <ErrorNote>{error}</ErrorNote>
          <button type="button" className="btn primary" disabled={!doc || busy || !ticked.every(Boolean) || doc.verification_status === "verified"} onClick={() => decide("verified")}>
            <Icon name="check" className="sm" />
            Verify selected
          </button>
          <div className="gap" />
          <label className="field">
            <span>Reason for rejecting (shown to the parent)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} disabled={!doc} placeholder="e.g. The scan is not readable" />
          </label>
          <button type="button" className="btn danger" style={{ marginTop: 10 }} disabled={!doc || busy || doc.verification_status === "rejected"} onClick={() => decide("rejected")}>
            Reject
          </button>
        </Panel>
      </div>
    </>
  );
}
