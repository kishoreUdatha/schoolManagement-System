"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { DocumentList } from "./ApplicationForm";
import { appClass, APPS, emitChange, todayIso, uploadDocument, useOnChange } from "./shared";
import { DOC_KINDS, type Application } from "./types";

/** Application · Documents · Assessment · Approval, carrying ?id= along. */
export function ApplicationTabs({ id, active }: { id: number | string; active: number }) {
  const tabs: [number, string][] = [
    [50, "Application"],
    [51, "Documents"],
    [52, "Assessment"],
    [53, "Approval"],
  ];
  return (
    <nav className="module-tabs profile-tabs">
      {tabs.map(([n, t]) => (
        <Link key={n} href={`${routeOf(n)}?id=${id}`} className={n === active ? "active" : ""}>
          {t}
        </Link>
      ))}
    </nav>
  );
}

/** Load the application named by ?id=. Reloads when another panel changes it. */
export function useApplication() {
  const id = useSearchParams().get("id");
  const res = useApi<Application>(id ? `${APPS}/${id}` : null);
  const reload = res.reload;
  useOnChange(useCallback(() => void reload(), [reload]));
  return { id, ...res };
}

/**
 * SCR-050, live: GET /admissions/applications/{id} (?id=) with documents,
 * assessments and history; the next step posts /submit, /status, /fee or
 * /withdraw. Edit opens SCR-049 with ?id= (PUT /applications/{id});
 * documents upload, open and delete here.
 */
export function ApplicationDetails() {
  const { id, data: a, error, loading } = useApplication();
  if (!id) return <PickFirst what="application" href={routeOf(48)} cta="Open the applications" />;
  if (loading && !a) return <Loading what="Loading the application…" />;
  if (!a) return <ErrorNote>{error ?? "Application not found."}</ErrorNote>;

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
  const tests = a.assessments ?? [];
  const done = tests.filter((t) => t.status === "done");
  const history = [...(a.history ?? [])].sort((x, z) => z.changed_at.localeCompare(x.changed_at));

  return (
    <>
      <section className="panel profile-banner">
        <div className="profile-hero">
          <div className="row">
            <span className="avatar mint large">{initials(a.student_name)}</span>
            <div>
              <h2>{a.student_name}</h2>
              <p>{`${appClass(a)} · Application no. ${a.application_no}`}</p>
              <div className="profile-meta">
                <span>
                  <Icon name="users" className="sm" />
                  {` ${a.guardian_name}`}
                </span>
                <span>
                  <Icon name="calendar" className="sm" />
                  {` ${a.academic_year_name ?? "—"}`}
                </span>
                <Badge>{label(a.status)}</Badge>
              </div>
            </div>
          </div>
          <div className="profile-badge">
            <strong>{`${a.documents_verified} / ${a.documents_total}`}</strong>
            <small>Documents verified</small>
          </div>
        </div>
        <ApplicationTabs id={a.id} active={50} />
      </section>
      <div className="two-col">
        <div className="stack">
          <Panel
            title="Personal information"
            action={
              a.status !== "admitted" && a.status !== "withdrawn" ? (
                <Link href={`${routeOf(49)}?id=${a.id}`} className="btn text">
                  Edit
                </Link>
              ) : undefined
            }
          >
            {kv([
              ["Application number", a.application_no],
              ["Student", a.student_name],
              ["Applying for", appClass(a)],
              ["Parent", a.guardian_name],
              ["Previous school", a.previous_school ?? "—"],
              ["Submitted on", date(a.submitted_at)],
              ["Date of birth", date(a.dob)],
              ["Gender", label(a.gender)],
            ])}
          </Panel>
          <Panel title="Contact information">
            {kv([
              ["Email address", a.email ?? "—"],
              ["Mobile number", a.phone],
              ["Address", a.address ?? "—"],
              ["Emergency contact", `${a.guardian_name} · ${a.phone}`],
            ])}
          </Panel>
          <DocumentsPanel a={a} />
        </div>
        <aside className="stack">
          <Panel title="At a glance">
            <div className="progress-stack">
              <div className="progress-label">
                <span>Documents verified</span>
                <strong>{`${a.documents_verified} / ${a.documents_total}`}</strong>
              </div>
              <div className="progress-label">
                <span>Assessments marked</span>
                <strong>{`${done.length} / ${tests.length}`}</strong>
              </div>
              <div className="progress-label">
                <span>Application fee</span>
                <strong>{a.fee_paid_on ? `${money(a.application_fee)} · paid ${date(a.fee_paid_on)}` : a.status === "fee_pending" ? "Due" : "—"}</strong>
              </div>
              <div className="progress-label">
                <span>Decision</span>
                <strong>{a.decided_at ? `${label(a.status === "rejected" ? "rejected" : "approved")} · ${date(a.decided_at)}` : "Pending"}</strong>
              </div>
            </div>
            {a.student_id ? (
              <p className="small" style={{ marginTop: 12 }}>
                <Link href={`${routeOf(57)}?id=${a.student_id}`}>Admitted · open the student</Link>
              </p>
            ) : null}
          </Panel>
          <NextStep a={a} />
          <Panel title="Recent activity">
            {history.length ? (
              history.map((h, i) => (
                <div className="timeline-item" key={i}>
                  <span className="timeline-dot">
                    <Icon name={h.to_status === "rejected" || h.to_status === "withdrawn" ? "bell" : h.to_status === "admitted" ? "cap" : "check"} />
                  </span>
                  <div>
                    <h4>{h.from_status ? `${label(h.from_status)} → ${label(h.to_status)}` : label(h.to_status)}</h4>
                    <p>{[h.note, `${dateTime(h.changed_at)} · ${h.changed_by_name ?? "School office"}`].filter(Boolean).join(" · ")}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No changes yet.</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

/**
 * The application's documents: multipart POST /applications/{id}/documents to
 * add one, GET …/documents/{doc}/file to open, DELETE …/documents/{doc}.
 * Verification itself happens on SCR-051.
 */
function DocumentsPanel({ a }: { a: Application }) {
  const [category, setCategory] = useState("birth_certificate");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputKey, setInputKey] = useState(0);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadDocument(a.id, file, category);
      notify(`${label(category)} uploaded.`);
      setFile(null);
      setInputKey((k) => k + 1);
      emitChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Documents"
      sub={`${a.documents_verified} of ${a.documents_total} verified`}
      action={
        <Link href={`${routeOf(51)}?id=${a.id}`} className="btn text">
          Verify
        </Link>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <div className="form-grid">
        <label className="field">
          <span>Document type</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {DOC_KINDS.map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>File</span>
          <input key={inputKey} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} aria-label="Document file" />
        </label>
      </div>
      <div className="gap" />
      <button type="button" className="btn" disabled={busy || !file} onClick={upload}>
        <Icon name="plus" className="sm" />
        {busy ? "Uploading…" : "Upload document"}
      </button>
      <DocumentList a={a} onChange={emitChange} />
    </Panel>
  );
}

/** What the office can do next with this application. */
function NextStep({ a }: { a: Application }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState("");

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      notify(done);
      emitChange();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const closed = ["admitted", "rejected", "withdrawn"].includes(a.status);
  const withdraw = () => {
    const note = window.prompt("Why is the application being withdrawn?");
    if (note === null) return;
    run(() => api.post(`${APPS}/${a.id}/withdraw`, {}, { note: note.trim() || null }), "Application withdrawn.");
  };

  return (
    <Panel title="Next step">
      <ErrorNote>{error}</ErrorNote>
      {a.status === "draft" ? (
        <button type="button" className="btn primary" disabled={busy} onClick={() => run(() => api.post(`${APPS}/${a.id}/submit`), "Application submitted.")}>
          <Icon name="check" className="sm" />
          Submit application
        </button>
      ) : null}
      {a.status === "submitted" ? (
        <button type="button" className="btn primary" disabled={busy} onClick={() => run(() => api.post(`${APPS}/${a.id}/status`, { status: "verification" }), "Now checking documents.")}>
          <Icon name="check" className="sm" />
          Start checking documents
        </button>
      ) : null}
      {a.status === "verification" || a.status === "assessment" ? (
        <Link href={`${routeOf(53)}?id=${a.id}`} className="btn primary">
          <Icon name="arrow" className="sm" />
          Review for approval
        </Link>
      ) : null}
      {a.status === "fee_pending" && !a.fee_paid_on ? (
        <div className="form-grid">
          <label className="field">
            <span>
              Fee amount
              <span className="req">*</span>
            </span>
            <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 5000" />
          </label>
          <label className="field">
            <span>Receipt no.</span>
            <input value={receipt} onChange={(e) => setReceipt(e.target.value)} placeholder="Optional" />
          </label>
          <button
            type="button"
            className="btn primary"
            disabled={busy || !amount}
            onClick={() => run(() => api.post(`${APPS}/${a.id}/fee`, { amount, paid_on: todayIso(), receipt_no: receipt.trim() || null }), "Fee recorded.")}
          >
            <Icon name="money" className="sm" />
            Record fee
          </button>
        </div>
      ) : null}
      {a.status === "approved" || (a.status === "fee_pending" && a.fee_paid_on) ? (
        <Link href={`${routeOf(54)}?id=${a.id}`} className="btn primary">
          <Icon name="cap" className="sm" />
          Create student
        </Link>
      ) : null}
      {closed ? <p className="muted">{`This application is ${label(a.status).toLowerCase()}.${a.decision_note ? ` ${a.decision_note}` : ""}`}</p> : null}
      {!closed ? (
        <>
          <div className="gap" />
          <button type="button" className="btn text" disabled={busy} onClick={withdraw}>
            Withdraw application
          </button>
        </>
      ) : null}
    </Panel>
  );
}
