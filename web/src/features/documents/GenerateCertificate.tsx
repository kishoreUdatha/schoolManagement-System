"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { AcademicYear } from "@/features/students/types";
import { openFile } from "./files";
import { StudentSearch, type PickedStudent } from "./parts";
import type { Certificate, Preview, Template } from "./types";

/**
 * SCR-261, live. Template and student, a preview rendered by the server
 * (POST /certificates/preview), then issue (POST /certificates) and open
 * the numbered PDF. ?request=<id> issues a parent's request instead
 * (POST /certificates/{id}/decide). Transfer certificates are issued on
 * SCR-262, which asks for the leaving details.
 */
export function GenerateCertificate() {
  const router = useRouter();
  const requestId = useSearchParams().get("request");
  const templates = useApi<Template[]>("/api/v1/school/certificates/templates");
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const requests = useApi<Certificate[]>(requestId ? "/api/v1/school/certificates" : null, { status: "requested" });
  const request = requestId ? (requests.data?.find((c) => String(c.id) === requestId) ?? null) : null;

  const [templateId, setTemplateId] = useState("");
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [purpose, setPurpose] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) return;
    setTemplateId(request.template_id ? String(request.template_id) : "");
    setStudent({ id: request.student_id, full_name: request.student_name, admission_no: request.admission_no, section_label: request.section_label });
    setPurpose(request.purpose ?? "");
  }, [request]);

  // Any change makes the preview stale.
  useEffect(() => setPreview(null), [templateId, student, purpose]);

  const usable = (templates.data ?? []).filter((t) => t.is_active && t.kind !== "transfer");
  const template = templates.data?.find((t) => String(t.id) === templateId);
  const year = years.data?.find((y) => y.is_current);
  const today = new Date().toISOString().slice(0, 10);

  if (request?.kind === "transfer") {
    return (
      <section className="panel">
        <div className="panel-pad">
          <p className="muted" style={{ marginBottom: 14 }}>This is a transfer certificate request. It needs the leaving details.</p>
          <Link href={`${routeOf(262)}?request=${request.id}`} className="btn primary">
            <Icon name="arrow" className="sm" />
            Open the transfer certificate
          </Link>
        </div>
      </section>
    );
  }

  async function makePreview(e: FormEvent) {
    e.preventDefault();
    if (!template || !student) return setError("Choose the certificate and the student.");
    setBusy(true);
    setError(null);
    try {
      setPreview(
        await api.post<Preview>("/api/v1/school/certificates/preview", {
          template_id: template.id,
          student_id: student.id,
          purpose: purpose.trim() || null,
          tc: null,
        }),
      );
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
      const cert = request
        ? await api.post<Certificate>(`/api/v1/school/certificates/${request.id}/decide`, { approve: true, tc: null })
        : await api.post<Certificate>("/api/v1/school/certificates", {
            template_id: template.id,
            student_id: student.id,
            purpose: purpose.trim() || null,
            tc: null,
          });
      notify(`Issued ${cert.serial_no ?? "the certificate"}.`);
      openFile(`/api/v1/school/certificates/${cert.id}/pdf`).catch(() => undefined);
      router.push(routeOf(263));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (text: string, control: JSX.Element, required = false, full = false) => (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {text}
        {required ? <span className="req">*</span> : null}
      </span>
      {control}
    </label>
  );

  return (
    <div className="two-col">
      <form id="certificate-form" className="panel" onSubmit={makePreview}>
        <div className="panel-pad">
          <ErrorNote>{error ?? templates.error ?? requests.error}</ErrorNote>
          {requestId && requests.data && !request ? <ErrorNote>This request is no longer waiting for a decision.</ErrorNote> : null}
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                {field(
                  "Certificate type",
                  <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} required disabled={!!request}>
                    <option value="">{templates.loading ? "Loading…" : "Select certificate"}</option>
                    {usable.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>,
                  true,
                )}
                {field("Student", <StudentSearch value={student} onChange={setStudent} required disabled={!!request} />, true)}
                {field("Academic year", <input value={year?.name ?? "—"} readOnly />)}
                {field("Issue date", <input type="date" value={today} readOnly />)}
                {field("Certificate number", <input value={template ? `${template.serial_prefix}/${today.slice(0, 4)}/…  assigned on issue` : "Assigned on issue"} readOnly />)}
                {/* Not wired: signatory — the API has no signatory; the PDF carries the school's own signature block. Purpose takes its place. */}
                {field("Purpose", <input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={200} placeholder="e.g. passport application" disabled={!!request} />)}
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              <Icon name="check" className="sm" />
              Generate preview
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>{request ? "Parent request" : "Documents"}</h3>
          <dl className="kv">
            <div>
              <dt>Academic year</dt>
              <dd>{year?.name ?? "—"}</dd>
            </div>
            <div>
              <dt>Certificate</dt>
              <dd>{template ? `${template.name} · ${label(template.kind)}` : "—"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{request ? `Requested by ${request.requested_by_name ?? "a parent"}` : preview ? "Preview ready · not issued" : "Draft · not issued"}</dd>
            </div>
          </dl>
          <div className="gap" />
          {preview && template ? (
            <>
              <h3 style={{ textAlign: "center", textDecoration: "underline" }}>{preview.title ?? template.title}</h3>
              {preview.body.split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {preview.missing.length ? (
                <div className="tip warn" style={{ marginTop: 10 }}>
                  <Icon name="bell" className="sm" />
                  <span>{`Blank on the certificate: ${preview.missing.map(label).join(", ")}. Fill these on the student or parent record first if needed.`}</span>
                </div>
              ) : null}
              <button type="button" className="btn primary" disabled={busy} onClick={issue}>
                <Icon name="check" className="sm" />
                {busy ? "Issuing…" : "Issue & print"}
              </button>
            </>
          ) : (
            <p>
              {"Review the information, then generate a preview. Issuing gives the certificate its serial number. "}
              <Link href={routeOf(262)}>Transfer certificates</Link>
              {" are issued with the leaving details."}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
