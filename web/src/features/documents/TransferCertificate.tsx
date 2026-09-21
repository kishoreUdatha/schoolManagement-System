"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { StudentProfile } from "@/features/students/types";
import { openFile } from "./files";
import { StatusBadge, StudentSearch, type PickedStudent } from "./parts";
import type { Certificate, Preview, SchoolProfile, TcFields, Template } from "./types";

/**
 * SCR-262, live. With ?id=<certificate> it shows that issued transfer
 * certificate (GET /certificates?kind=transfer). Otherwise it issues one:
 * leaving details, server preview (POST /certificates/preview), then
 * POST /certificates, or POST /certificates/{id}/decide for a parent's
 * request (?request=). The server refuses while fees are pending unless
 * "issue even if fees are pending" is ticked.
 */
export function TransferCertificate() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const requestId = params.get("request");

  const profile = useApi<SchoolProfile>("/api/v1/school/profile");
  const templates = useApi<Template[]>("/api/v1/school/certificates/templates");
  const issued = useApi<Certificate[]>(id ? "/api/v1/school/certificates" : null, { kind: "transfer" });
  const requests = useApi<Certificate[]>(requestId ? "/api/v1/school/certificates" : null, { status: "requested", kind: "transfer" });
  const cert = id ? (issued.data?.find((c) => String(c.id) === id) ?? null) : null;
  const request = requestId ? (requests.data?.find((c) => String(c.id) === requestId) ?? null) : null;
  const template = templates.data?.find((t) => t.kind === "transfer" && t.is_active) ?? null;

  const [student, setStudent] = useState<PickedStudent | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [tc, setTc] = useState({
    date_of_leaving: today,
    reason_for_leaving: "",
    last_class_studied: "",
    promoted_to: "",
    conduct: "Good",
    fees_paid_up_to: "",
    remarks: "",
    deactivate_student: true,
    allow_with_dues: false,
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (request) setStudent({ id: request.student_id, full_name: request.student_name, admission_no: request.admission_no, section_label: request.section_label });
  }, [request]);
  useEffect(() => setPreview(null), [student, tc]);

  const studentId = cert?.student_id ?? student?.id ?? null;
  const s = useApi<StudentProfile>(studentId ? `/api/v1/school/students/${studentId}` : null);

  useEffect(() => {
    // Start "last class studied" from the student's record.
    if (!cert && s.data?.class_name && !tc.last_class_studied) setTc((t) => ({ ...t, last_class_studied: `${s.data?.class_name ?? ""} ${s.data?.section_name ?? ""}`.trim() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.data?.id]);

  if (id && issued.loading && !issued.data) return <Loading what="Loading the certificate…" />;
  if (id && issued.data && !cert) return <ErrorNote>Transfer certificate not found.</ErrorNote>;

  const payload = (): TcFields => {
    const n = (v: string) => (v.trim() ? v.trim() : null);
    return { ...tc, reason_for_leaving: tc.reason_for_leaving.trim(), last_class_studied: n(tc.last_class_studied), promoted_to: n(tc.promoted_to), fees_paid_up_to: n(tc.fees_paid_up_to), remarks: n(tc.remarks) };
  };

  async function makePreview(e: FormEvent) {
    e.preventDefault();
    if (!template) return setError("There is no active transfer certificate template. Add one under Certificate Templates.");
    if (!student) return setError("Choose the student.");
    setBusy(true);
    setError(null);
    try {
      setPreview(await api.post<Preview>("/api/v1/school/certificates/preview", { template_id: template.id, student_id: student.id, purpose: null, tc: payload() }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function issue() {
    if (!template || !student) return;
    setBusy(true);
    setError(null);
    try {
      const c = request
        ? await api.post<Certificate>(`/api/v1/school/certificates/${request.id}/decide`, { approve: true, tc: payload() })
        : await api.post<Certificate>("/api/v1/school/certificates", { template_id: template.id, student_id: student.id, purpose: null, tc: payload() });
      notify(`Issued ${c.serial_no ?? "the transfer certificate"}.`);
      router.replace(`${routeOf(262)}?id=${c.id}`);
      issued.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const set = (k: keyof typeof tc) => (e: { target: { value: string } }) => setTc({ ...tc, [k]: e.target.value });
  const field = (text: string, control: JSX.Element, required = false, full = false) => (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {text}
        {required ? <span className="req">*</span> : null}
      </span>
      {control}
    </label>
  );

  const school = profile.data;
  const title = cert?.title ?? template?.title ?? "TRANSFER CERTIFICATE";
  const body = cert?.rendered_body ?? preview?.body ?? null;
  const dues = s.data?.fees_pending_amount ?? 0;
  const parent = s.data?.parents?.[0]?.full_name;

  return (
    <>
      {/* The issuing form stays off the printed page. */}
      <style>{"@media print{.tc-form{display:none!important}}"}</style>
      {!cert ? (
        <form className="panel tc-form" onSubmit={makePreview} style={{ marginBottom: 20 }}>
          <div className="panel-head">
            <div>
              <h2>{request ? `Issue requested transfer certificate · ${request.student_name}` : "Issue a transfer certificate"}</h2>
              <p>Leaving details go on the certificate. Issuing numbers it and cannot be undone except by cancelling.</p>
            </div>
          </div>
          <div className="panel-pad">
            <ErrorNote>{error ?? templates.error ?? requests.error}</ErrorNote>
            {requestId && requests.data && !request ? <ErrorNote>This request is no longer waiting for a decision.</ErrorNote> : null}
            {dues > 0 ? (
              <div className="tip warn" role="status" style={{ marginBottom: 16 }}>
                <Icon name="money" className="sm" />
                <span>{`Fees pending: ${money(dues)}. The certificate will not issue unless "Issue even if fees are pending" is ticked.`}</span>
              </div>
            ) : null}
            <div className="form-grid">
              {field("Student", <StudentSearch value={student} onChange={setStudent} required disabled={!!request} />, true)}
              {field("Date of leaving", <input type="date" value={tc.date_of_leaving} onChange={set("date_of_leaving")} required />, true)}
              {field("Reason for leaving", <input value={tc.reason_for_leaving} onChange={set("reason_for_leaving")} required minLength={2} placeholder="e.g. Family relocating" />, true)}
              {field("Last class studied", <input value={tc.last_class_studied} onChange={set("last_class_studied")} />)}
              {field("Promoted to", <input value={tc.promoted_to} onChange={set("promoted_to")} />)}
              {field("Conduct", <input value={tc.conduct} onChange={set("conduct")} />)}
              {field("Fees paid up to", <input value={tc.fees_paid_up_to} onChange={set("fees_paid_up_to")} placeholder="e.g. March 2027" />)}
              {field("Remarks", <input value={tc.remarks} onChange={set("remarks")} />)}
            </div>
            <div className="checklist" style={{ marginTop: 8 }}>
              <label className="check-item">
                <input type="checkbox" checked={tc.deactivate_student} onChange={(e) => setTc({ ...tc, deactivate_student: e.target.checked })} />
                Mark the student as left (inactive) and stop their transport
              </label>
              <label className="check-item">
                <input type="checkbox" checked={tc.allow_with_dues} onChange={(e) => setTc({ ...tc, allow_with_dues: e.target.checked })} />
                Issue even if fees are pending
              </label>
            </div>
          </div>
          <div className="form-footer">
            <span>Fields marked * are required</span>
            <div className="actions">
              <button type="submit" className="btn" disabled={busy}>
                Preview
              </button>
              <button type="button" className="btn primary" disabled={busy || !preview} onClick={issue}>
                <Icon name="check" className="sm" />
                {busy ? "Working…" : "Issue transfer certificate"}
              </button>
            </div>
          </div>
        </form>
      ) : null}
      <article className="certificate">
        <Link href="/screens" className="brand">
          <span className="brand-mark">
            <Icon name="book" />
          </span>
          <span>
            BrightCampus
            <small>SCHOOL ERP</small>
          </span>
        </Link>
        <p>{school ? [school.name, school.address].filter(Boolean).join(" · ") : "…"}</p>
        <h2>{title}</h2>
        <p>
          {cert
            ? `Certificate no. ${cert.serial_no ?? "—"} · Issued ${date(cert.issued_on)}`
            : preview
              ? "Preview · not issued yet"
              : "Choose a student and fill in the leaving details to preview the certificate."}
        </p>
        {cert && cert.status !== "issued" ? (
          <p>
            <StatusBadge status={cert.status} />
            {cert.remarks ? ` ${cert.remarks}` : ""}
          </p>
        ) : null}
        <div className="cert-name">{cert?.student_name ?? s.data?.full_name ?? student?.full_name ?? ""}</div>
        {body
          ? body.split("\n\n").map((p, i) => (
              <p key={i} style={{ marginBottom: 8 }}>
                {p}
              </p>
            ))
          : null}
        {preview && preview.missing.length > 0 && !cert ? (
          <p className="tc-form" style={{ color: "#be3244" }}>{`Blank on the certificate: ${preview.missing.map(label).join(", ")}.`}</p>
        ) : null}
        <div className="gap" />
        {s.data ? (
          <dl className="kv">
            <div>
              <dt>Date of birth</dt>
              <dd>{date(s.data.dob)}</dd>
            </div>
            <div>
              <dt>Parent name</dt>
              <dd>{parent ?? "—"}</dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>{s.data.class_name ?? "—"}</dd>
            </div>
            <div>
              <dt>Academic year</dt>
              <dd>{s.data.academic_year_name ?? "—"}</dd>
            </div>
          </dl>
        ) : null}
        <div className="cert-sign">
          <div>
            <strong>{cert?.issued_by_name ?? "School Office"}</strong>
            Prepared by
          </div>
          <div>
            <strong>{school?.principal_name ?? "Principal"}</strong>
            Principal
          </div>
        </div>
      </article>
    </>
  );
}

/** Page-head buttons: print this page, or open the numbered PDF (each opening is counted as a print). */
export function TcActions() {
  const id = useSearchParams().get("id");
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="btn" onClick={() => window.print()}>
        <Icon name="download" className="sm" />
        Print
      </button>
      <button
        type="button"
        className="btn primary"
        disabled={!id}
        title={error ?? (id ? "Open the numbered PDF" : "Issue the certificate first")}
        onClick={() => id && openFile(`/api/v1/school/certificates/${id}/pdf`).catch((e) => { setError(errorText(e)); notify(errorText(e)); })}
      >
        <Icon name="download" className="sm" />
        Print certificate
      </button>
    </>
  );
}
