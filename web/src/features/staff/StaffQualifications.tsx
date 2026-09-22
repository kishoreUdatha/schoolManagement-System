"use client";

import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { StaffBanner, useStaffProfile } from "./StaffProfile";
import type { QualificationsPage, StaffDocument } from "./types";
import { openFile, uploadForm } from "./util";

import { ask } from "@/lib/dialog";
const CATEGORIES = ["qualification", "experience", "id_proof", "address_proof", "photo", "medical", "other"];

const ext = (title: string) => {
  const m = /\.([a-z0-9]{2,4})$/i.exec(title);
  return (m?.[1] ?? "doc").toUpperCase();
};

/**
 * SCR-087, live: GET /staff-ops/{id}/qualifications; POST to add one, verify
 * and DELETE; documents upload through POST /documents (owner_type=staff).
 */
export function StaffQualifications() {
  const { id, data: p, error: pError, loading } = useStaffProfile();
  const page = useApi<QualificationsPage>(id ? `/api/v1/school/staff-ops/${id}/qualifications` : null);
  const [typed, setTyped] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  if (!id) return <PickFirst what="member of staff" href={routeOf(80)} cta="Open the staff directory" />;
  if (loading && !p) return <Loading what="Loading qualifications…" />;
  if (!p) return <ErrorNote>{pError ?? "Staff member not found."}</ErrorNote>;

  const data = page.data;
  const q = typed.trim().toLowerCase();
  const quals = (data?.qualifications ?? []).filter(
    (x) =>
      (!status || (status === "verified") === Boolean(x.verified_at)) &&
      (!q || `${x.qualification} ${x.institution ?? ""} ${x.subject_area ?? ""}`.toLowerCase().includes(q)),
  );
  const docs = (data?.documents ?? []).filter(
    (d) => (!status || (status === "verified") === (d.verification_status === "verified")) && (!q || `${d.title} ${d.category}`.toLowerCase().includes(q)),
  );
  const verified = (data?.qualifications ?? []).filter((x) => x.verified_at).length;
  const stats = [
    { label: "Verified", value: data ? String(verified) : "…", note: "Qualifications checked" },
    { label: "Pending", value: data ? String(data.unverified) : "…", note: "Needs review" },
  ];

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      notify(done);
      page.reload();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function addQualification(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const ok = await run(
      () =>
        api.post(`/api/v1/school/staff-ops/${id}/qualifications`, {
          qualification: text("qualification"),
          institution: text("institution"),
          year_awarded: text("year_awarded") ? Number(text("year_awarded")) : null,
          subject_area: text("subject_area"),
          document_id: text("document_id") ? Number(text("document_id")) : null,
        }),
      "Qualification recorded. It stays unchecked until the certificate is verified.",
    );
    if (ok) form.reset();
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const body = new FormData();
    body.append("file", file);
    body.append("owner_type", "staff");
    body.append("owner_id", String(id));
    body.append("category", String(f.get("category") || "qualification"));
    body.append("title", String(f.get("title") ?? "").trim());
    if (f.get("expires_on")) body.append("expires_on", String(f.get("expires_on")));
    body.append("visible_to_parent", "false");
    const ok = await run(() => uploadForm("/api/v1/school/documents", body), `Uploaded ${String(f.get("title") || file.name)}.`);
    if (ok) {
      form.reset();
      setFile(null);
    }
  }

  const open = (d: StaffDocument) => openFile(`/api/v1/school/documents/${d.id}/file`).catch((err) => setError(errorText(err)));

  return (
    <>
      <StaffBanner p={p} active={87} />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search qualifications & documents…" aria-label="Search records" />
        </div>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="verified">Verified</option>
          <option value="pending">Pending</option>
        </select>
      </div>
      <ErrorNote>{error ?? page.error}</ErrorNote>
      <div className="two-col">
        <div className="stack">
          <Panel title="Documents" sub={`${docs.length} on file`}>
            {docs.length ? (
              docs.map((d) => (
                <div className="document-card" key={d.id}>
                  <div className={`file-icon ${ext(d.title).toLowerCase()}`}>{ext(d.title)}</div>
                  <div className="document-info">
                    <h4>{d.title}</h4>
                    <p>{[label(d.category), d.uploaded_at ? date(d.uploaded_at) : null, d.expires_on ? `expires ${date(d.expires_on)}` : null].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Badge>{label(d.verification_status)}</Badge>
                  <button type="button" className="btn" onClick={() => open(d)}>
                    Open
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">{page.loading ? "Loading…" : "No documents on file."}</p>
            )}
          </Panel>
          <Panel title="Qualifications" sub={`${quals.length} recorded`}>
            {quals.length ? (
              quals.map((x) => (
                <div className="timeline-item" key={x.id}>
                  <span className="timeline-dot">
                    <Icon name={x.verified_at ? "check" : "file"} />
                  </span>
                  <div>
                    <h4>{x.qualification}</h4>
                    <p>
                      {[x.institution, x.year_awarded, x.subject_area, x.document_title ? `certificate: ${x.document_title}` : "no certificate linked"].filter(Boolean).join(" · ")}
                      {x.verified_at ? ` · verified ${date(x.verified_at)}${x.verified_by ? ` by ${x.verified_by}` : ""}` : ""}
                    </p>
                    <div className="row" style={{ marginTop: 6 }}>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => run(() => api.post(`/api/v1/school/staff-ops/qualifications/${x.id}/verify`, { verified: !x.verified_at }), x.verified_at ? "Marked unverified." : "Qualification verified.")}
                      >
                        {x.verified_at ? "Unverify" : "Verify"}
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={async () => (await ask(`Remove ${x.qualification}?`)) && run(() => api.delete(`/api/v1/school/staff-ops/qualifications/${x.id}`), "Qualification removed.")}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <Badge>{x.verified_at ? "Verified" : "Pending"}</Badge>
                </div>
              ))
            ) : (
              <p className="muted">{page.loading ? "Loading…" : "No qualifications recorded."}</p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Add qualification" sub="Recorded unverified until checked">
            <form id="qualification-form" className="form-grid" onSubmit={addQualification}>
              <label className="field full">
                <span>
                  Qualification
                  <span className="req">*</span>
                </span>
                <input name="qualification" required maxLength={120} placeholder="e.g. M.Sc Mathematics, B.Ed" />
              </label>
              <label className="field full">
                <span>Institution</span>
                <input name="institution" maxLength={200} placeholder="Enter institution" />
              </label>
              <label className="field">
                <span>Year awarded</span>
                <input name="year_awarded" type="number" min={1900} max={2100} placeholder="YYYY" />
              </label>
              <label className="field">
                <span>Subject area</span>
                <input name="subject_area" maxLength={120} placeholder="e.g. Physics" />
              </label>
              <label className="field full">
                <span>Certificate</span>
                <select name="document_id" defaultValue="">
                  <option value="">None on file</option>
                  {data?.documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="btn primary" disabled={busy}>
                <Icon name="check" className="sm" />
                Save qualification
              </button>
            </form>
          </Panel>
          <Panel title="Upload document" sub="Attach the correct record">
            <form className="stack" onSubmit={upload}>
              <label className="upload-zone">
                <Icon name="folder" />
                <strong>{file ? file.name : "Choose a file to upload"}</strong>
                {file ? null : "or drag and drop it here"}
                <br />
                <span className="small muted">PDF, PNG, JPG, DOCX or CSV</span>
                <input type="file" aria-label="Choose file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span>Category</span>
                  <select name="category" defaultValue="qualification">
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {label(c)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Expires on</span>
                  <input type="date" name="expires_on" />
                </label>
                <label className="field full">
                  <span>Title</span>
                  <input name="title" placeholder="Defaults to the file name" />
                </label>
              </div>
              <button type="submit" className="btn" disabled={!file || busy}>
                <Icon name="download" className="sm" />
                Upload
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
