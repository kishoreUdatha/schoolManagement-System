"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { appClass, APPS, emitChange, openDocument, size, uploadDocument, useOnAction, useOnChange } from "./shared";
import { DOC_KINDS, type AppDocument, type Application } from "./types";

const LIVE = ["submitted", "verification", "assessment", "approved", "fee_pending"];
const CHECKS = ["Name matches the record", "Document is readable", "Dates and reference checked"];

const ext = (name: string) => (name.split(".").pop() ?? "file").slice(0, 4).toUpperCase();

/**
 * SCR-051, live: GET /admissions/applications (the open ones) and
 * GET /applications/{id} for the documents; POST /documents/{doc}/verify to
 * accept or reject, multipart POST /applications/{id}/documents to add one,
 * POST /applications/{id}/status to finish.
 */
export function DocumentVerification() {
  const router = useRouter();
  const idParam = useSearchParams().get("id");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [docFilter, setDocFilter] = useState("");
  const [focus, setFocus] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [checks, setChecks] = useState<boolean[]>(CHECKS.map(() => false));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);

  const list = useApi<Application[]>(APPS, { search });
  const queue = useMemo(() => (list.data ?? []).filter((a) => LIVE.includes(a.status) || String(a.id) === idParam), [list.data, idParam]);
  const auto = queue.find((a) => a.documents_verified < a.documents_total) ?? queue[0];
  const appId = idParam ?? (auto ? String(auto.id) : null);
  const detail = useApi<Application>(appId ? `${APPS}/${appId}` : null);
  const a = detail.data;
  const reload = useCallback(() => {
    detail.reload();
    list.reload();
  }, [detail, list]);
  useOnChange(reload);

  useEffect(() => {
    setPicked(new Set());
    setFocus(null);
    setChecks(CHECKS.map(() => false));
  }, [appId]);

  const docs = a?.documents ?? [];
  const shown = docs.filter((d) => (docFilter === "pending" ? !d.is_verified : docFilter === "verified" ? d.is_verified : true));
  const current: AppDocument | undefined = docs.find((d) => d.id === focus) ?? docs[0];
  const verified = docs.filter((d) => d.is_verified).length;

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      notify(done);
      emitChange();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const verifySelected = async () => {
    const ids = [...picked];
    if (await run(() => Promise.all(ids.map((d) => api.post(`${APPS}/documents/${d}/verify`, { verified: true }))), `${ids.length} document${ids.length === 1 ? "" : "s"} verified.`)) {
      setPicked(new Set());
      setChecks(CHECKS.map(() => false));
    }
  };

  const reject = (d: AppDocument) => {
    const remark = window.prompt(`Why is the ${label(d.category).toLowerCase()} not acceptable?`);
    if (!remark?.trim()) return;
    run(() => api.post(`${APPS}/documents/${d.id}/verify`, { verified: false, remark: remark.trim() }), "Sent back with your remark.");
  };

  // Documents all checked: the application moves on to assessment.
  useOnAction("complete-verification", () => {
    if (!a) return;
    if (!docs.length || verified < docs.length) {
      setError("Verify every document before completing verification.");
      return;
    }
    run(async () => {
      if (a.status === "submitted") await api.post(`${APPS}/${a.id}/status`, { status: "verification" });
      await api.post(`${APPS}/${a.id}/status`, { status: "assessment", note: "Documents verified" });
    }, "Verification complete. The application moves to assessment.");
  });

  const upload = async (file: File | undefined, category: string) => {
    if (!file || !a) return;
    await run(() => uploadDocument(a.id, file, category), "Document uploaded.");
  };

  const history = [...(a?.history ?? [])].sort((x, z) => z.changed_at.localeCompare(x.changed_at)).slice(0, 5);
  const stats = [
    { label: "Verified", value: a ? String(verified) : "…", note: "Review completed" },
    { label: "Pending", value: a ? String(docs.length - verified) : "…", note: "Needs review" },
  ];
  const allChecked = checks.every(Boolean);

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search applications…" aria-label="Search applications" />
        </div>
        <select aria-label="Application" value={appId ?? ""} onChange={(e) => router.replace(`${routeOf(51)}?id=${e.target.value}`)}>
          {!queue.length ? <option value="">{list.loading ? "Loading…" : "No open applications"}</option> : null}
          {queue.map((q) => (
            <option key={q.id} value={q.id}>
              {`${q.student_name} · ${q.application_no} · ${q.documents_verified}/${q.documents_total} verified`}
            </option>
          ))}
        </select>
        <select aria-label="Filter by document status" value={docFilter} onChange={(e) => setDocFilter(e.target.value)}>
          <option value="">All documents</option>
          <option value="pending">Pending</option>
          <option value="verified">Verified</option>
        </select>
      </div>
      <ErrorNote>{error ?? detail.error ?? list.error}</ErrorNote>
      <div className="two-col">
        <div className="stack">
          <Panel
            title="Documents for review"
            sub={a ? `${a.student_name} · ${appClass(a)} · ${label(a.status)}` : "Choose an application"}
            action={a ? <UploadButton busy={busy} onUpload={upload} /> : undefined}
          >
            {shown.length ? (
              shown.map((d) => (
                <div className="document-card" key={d.id} onClick={() => setFocus(d.id)} style={d.id === current?.id ? { outline: "2px solid var(--line)" } : undefined}>
                  {!d.is_verified ? (
                    <input
                      type="checkbox"
                      aria-label={`Select ${d.file_name}`}
                      checked={picked.has(d.id)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(d.id);
                        else next.delete(d.id);
                        setPicked(next);
                      }}
                    />
                  ) : null}
                  <div className="file-icon pdf">{ext(d.file_name)}</div>
                  <div className="document-info">
                    <h4>{`${label(d.category)} · ${d.file_name}`}</h4>
                    <p>{[size(d.size_bytes), d.verified_at ? `verified ${date(d.verified_at)}` : null, d.remark].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Badge>{d.is_verified ? "Verified" : d.remark ? "Returned" : "Pending"}</Badge>
                  <button type="button" className="btn" onClick={() => openDocument(d.id).catch((e) => setError(errorText(e)))}>
                    Open
                  </button>
                  {!d.is_verified ? (
                    <button type="button" className="btn text" disabled={busy} onClick={() => reject(d)}>
                      Reject
                    </button>
                  ) : null}
                </div>
              ))
            ) : (
              <p className="muted">{detail.loading ? "Loading documents…" : a ? "No documents uploaded yet." : "No application to review."}</p>
            )}
          </Panel>
          <Panel title="Recent activity">
            {history.length ? (
              history.map((h, i) => (
                <div className="timeline-item" key={i}>
                  <span className="timeline-dot">
                    <Icon name="file" />
                  </span>
                  <div>
                    <h4>{h.from_status ? `${label(h.from_status)} → ${label(h.to_status)}` : label(h.to_status)}</h4>
                    <p>{[h.note, h.changed_by_name ?? "School office"].filter(Boolean).join(" · ")}</p>
                  </div>
                  <time>{dateTime(h.changed_at)}</time>
                </div>
              ))
            ) : (
              <p className="muted">No changes yet.</p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Review details">
            <dl className="kv">
              <div>
                <dt>Student</dt>
                <dd>{a?.student_name ?? "—"}</dd>
              </div>
              <div>
                <dt>Class</dt>
                <dd>{a ? appClass(a) : "—"}</dd>
              </div>
              <div>
                <dt>Document type</dt>
                <dd>{current ? label(current.category) : "—"}</dd>
              </div>
              {/* The API gives no upload date for a document; the file name and verification date stand in. */}
              <div>
                <dt>File</dt>
                <dd>{current ? `${current.file_name} · ${size(current.size_bytes)}` : "—"}</dd>
              </div>
            </dl>
          </Panel>
          <Panel title="Verification">
            <div className="checklist">
              {CHECKS.map((c, i) => (
                <div className="check-item" key={c}>
                  <input
                    type="checkbox"
                    id={`check-${i}`}
                    aria-label={c}
                    checked={checks[i]}
                    onChange={(e) => setChecks(checks.map((v, j) => (j === i ? e.target.checked : v)))}
                  />
                  <label htmlFor={`check-${i}`}>{c}</label>
                </div>
              ))}
            </div>
            <div className="gap" />
            <button type="button" className="btn primary" disabled={busy || !picked.size || !allChecked} onClick={verifySelected}>
              <Icon name="check" className="sm" />
              {picked.size ? `Verify selected (${picked.size})` : "Verify selected"}
            </button>
          </Panel>
          <Panel title="Document status">
            <StatStrip items={stats} compact />
          </Panel>
        </aside>
      </div>
    </>
  );
}

function UploadButton({ busy, onUpload }: { busy: boolean; onUpload: (f: File | undefined, category: string) => void }) {
  const [category, setCategory] = useState("birth_certificate");
  return (
    <div className="row">
      <select aria-label="Document type" value={category} onChange={(e) => setCategory(e.target.value)}>
        {DOC_KINDS.map((k) => (
          <option key={k} value={k}>
            {label(k)}
          </option>
        ))}
      </select>
      <label className="btn">
        <Icon name="plus" className="sm" />
        {busy ? "Uploading…" : "Upload"}
        <input
          type="file"
          hidden
          disabled={busy}
          onChange={(e) => {
            onUpload(e.target.files?.[0], category);
            e.target.value = "";
          }}
        />
      </label>
    </div>
  );
}
