"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { SchoolClass } from "@/features/students/types";
import { APPS, ENQ, openDocument, size, uploadDocument, useYears } from "./shared";
import { DOC_KINDS, type Application, type EnquiryDetail } from "./types";

/** The page-head button: "Save changes" when editing (?id=), else "Submit application". */
export function ApplicationFormAction() {
  const editing = Boolean(useSearchParams().get("id"));
  return (
    <button type="submit" form="application-form" className="btn primary">
      <Icon name="check" className="sm" />
      {editing ? "Save changes" : "Submit application"}
    </button>
  );
}

/**
 * SCR-049, live: POST /admissions/applications (?submitted=true to submit,
 * ?enquiry_id= when started from an enquiry), then the optional document as
 * multipart POST /applications/{id}/documents. With ?id= it edits instead:
 * GET /applications/{id}, PUT /applications/{id} (the whole record, so fields
 * this form does not show are sent back unchanged), POST /{id}/submit for a
 * draft, and the documents: upload, GET …/documents/{doc}/file, DELETE
 * …/documents/{doc}.
 */
export function ApplicationForm() {
  const router = useRouter();
  const params = useSearchParams();
  const enquiryId = params.get("enquiry");
  const editId = params.get("id");
  const enquiry = useApi<EnquiryDetail>(enquiryId && !editId ? `${ENQ}/${enquiryId}` : null);
  const existing = useApi<Application>(editId ? `${APPS}/${editId}` : null);
  const years = useYears();
  const [yearId, setYearId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const a = existing.data;
  useEffect(() => {
    if (yearId !== null) return;
    if (editId) {
      if (a) setYearId(a.academic_year_id ?? years.current?.id ?? null);
    } else if (years.current) setYearId(years.current.id);
  }, [years.current, yearId, editId, a]);
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });

  if (enquiryId && !editId && enquiry.loading && !enquiry.data) return <Loading what="Loading the enquiry…" />;
  if (editId && existing.loading && !a) return <Loading what="Loading the application…" />;
  if (editId && !a) return <ErrorNote>{existing.error ?? "Application not found."}</ErrorNote>;
  const e = enquiry.data;
  const locked = a ? a.status === "admitted" || a.status === "withdrawn" : false;
  // What the free-text class was, so choosing no class keeps it.
  const givenClass = a ? a.applying_for_class : (e?.applying_for_class ?? null);

  async function save(form: HTMLFormElement, submitted: boolean) {
    if (!form.reportValidity()) return;
    const f = new FormData(form);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const classId = text("class_id") ? Number(text("class_id")) : null;
    const file = f.get("document") as File | null;
    const body = {
      academic_year_id: yearId,
      class_id: classId,
      applying_for_class: classId ? null : givenClass,
      student_name: text("student_name"),
      dob: text("dob"),
      gender: text("gender"),
      previous_school: text("previous_school"),
      guardian_name: text("guardian_name"),
      phone: text("phone"),
      email: text("email"),
      address: text("address"),
      transport_required: f.get("transport_required") === "yes",
    };
    setSaving(true);
    setError(null);
    try {
      if (a) {
        await api.put(`${APPS}/${a.id}`, {
          // Not on this form: keep what the record already has.
          sibling_in_school: a.sibling_in_school,
          category: a.category,
          father_name: a.father_name,
          mother_name: a.mother_name,
          notes: a.notes,
          ...body,
        });
        if (file && file.size) await uploadDocument(a.id, file, text("category") ?? "other");
        if (submitted && a.status === "draft") await api.post(`${APPS}/${a.id}/submit`);
        notify(submitted && a.status === "draft" ? `Application ${a.application_no} saved and submitted.` : `Application ${a.application_no} saved.`);
        router.push(`${routeOf(50)}?id=${a.id}`);
        return;
      }
      const created = await api.post<{ id: number; application_no: string }>(APPS, body, { submitted, enquiry_id: e?.id });
      if (file && file.size) {
        try {
          await uploadDocument(created.id, file, text("category") ?? "other");
        } catch (err) {
          notify(`Application ${created.application_no} saved, but the document was not uploaded: ${errorText(err)}`);
          router.push(`${routeOf(50)}?id=${created.id}`);
          return;
        }
      }
      notify(submitted ? `Application ${created.application_no} submitted.` : `Application ${created.application_no} saved as a draft.`);
      router.push(`${routeOf(50)}?id=${created.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const field = (text: string, control: JSX.Element, required = false) => (
    <label className="field">
      <span>
        {text}
        {required ? <span className="req">*</span> : null}
      </span>
      {control}
    </label>
  );

  return (
    <div className="two-col">
      <form
        id="application-form"
        className="panel"
        onSubmit={(ev: FormEvent<HTMLFormElement>) => {
          ev.preventDefault();
          if (!locked) save(ev.currentTarget, true);
        }}
      >
        <div className="steps">
          {["Basic details", "Academic & contact", "Documents", "Review"].map((t, i) => (
            <div key={t} className={`step ${i === 0 ? "active" : ""}`}>
              <b>{i + 1}</b>
              {t}
            </div>
          ))}
        </div>
        <div className="panel-pad">
          <ErrorNote>{error ?? enquiry.error ?? years.error}</ErrorNote>
          {e ? <p className="muted" style={{ marginBottom: 12 }}>{`From enquiry ENQ-${e.id} · applying for ${e.applying_for_class ?? "—"}`}</p> : null}
          {a ? (
            <p className="muted" style={{ marginBottom: 12 }}>
              {locked ? `Application ${a.application_no} is ${label(a.status).toLowerCase()} and can no longer be edited.` : `Editing application ${a.application_no} · ${label(a.status)}`}
            </p>
          ) : null}
          <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">01</span>
                  <h3>Application information</h3>
                </div>
                <div className="form-grid">
                  {field("Student name", <input type="text" name="student_name" placeholder="Enter student name" required minLength={2} defaultValue={a?.student_name ?? e?.student_name} />, true)}
                  {/* Required for a new application; one sent from the public form may lack them, so an edit need not add them. */}
                  {field("Date of birth", <input type="date" name="dob" required={!a} defaultValue={a?.dob ?? e?.dob ?? ""} />, !a)}
                  {field(
                    "Gender",
                    <select name="gender" required={!a} defaultValue={a?.gender ?? e?.gender ?? ""}>
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>,
                    !a,
                  )}
                  {field(
                    "Applying for",
                    <select name="class_id" required={!givenClass} defaultValue={a?.class_id ?? ""} key={classes.data ? `c${yearId}` : "loading"}>
                      <option value="">{classes.loading ? "Loading classes…" : givenClass ? `As given: ${givenClass}` : "Select class"}</option>
                      {classes.data?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>,
                    true,
                  )}
                  {field(
                    "Academic year",
                    <select value={yearId ?? ""} onChange={(x) => setYearId(Number(x.target.value))}>
                      {years.data?.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </select>,
                  )}
                  {field("Previous school", <input type="text" name="previous_school" placeholder="Enter previous school" defaultValue={a?.previous_school ?? e?.previous_school ?? ""} />)}
                </div>
              </section>
              <section>
                <div className="form-section-title">
                  <span className="number">02</span>
                  <h3>Contact & additional information</h3>
                </div>
                <div className="form-grid">
                  {field("Parent name", <input type="text" name="guardian_name" placeholder="Enter parent name" required minLength={2} defaultValue={a?.guardian_name ?? e?.parent_name} />, true)}
                  {field("Mobile number", <input type="tel" name="phone" placeholder="Enter mobile number" required minLength={6} defaultValue={a?.phone ?? e?.parent_phone} />, true)}
                  {field("Email address", <input type="email" name="email" placeholder="Enter email address" defaultValue={a?.email ?? e?.parent_email ?? ""} />)}
                  {field("Address", <input type="text" name="address" placeholder="Enter address" defaultValue={a?.address ?? e?.address ?? ""} />)}
                  {field(
                    "Transport required",
                    <select name="transport_required" defaultValue={a?.transport_required ? "yes" : "no"}>
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>,
                  )}
                  {field(
                    "Document type",
                    <select name="category" defaultValue="birth_certificate">
                      {DOC_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {label(k)}
                        </option>
                      ))}
                    </select>,
                  )}
                  {field(a ? "Add a document" : "Documents", <input type="file" name="document" aria-label="Documents" />)}
                </div>
                {a ? <DocumentList a={a} onChange={existing.reload} /> : null}
              </section>
            </div>
          </fieldset>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
            {!a || a.status === "draft" ? (
              <button type="button" className="btn" disabled={saving || locked} onClick={(ev) => save(ev.currentTarget.form as HTMLFormElement, false)}>
                {a ? "Save draft" : "Save as draft"}
              </button>
            ) : null}
            <button type="submit" className="btn primary" disabled={saving || locked}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : a && a.status !== "draft" ? "Save changes" : "Submit application"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>Complete the record</h3>
          <div className="stepper">
            {[
              ["Basic details", "Identity and enrollment"],
              ["Academic details", "Class and academic year"],
              ["Contact information", "Parent and emergency contact"],
              ["Review & save", "Submit, or save as a draft"],
            ].map(([t, p], i) => (
              <div key={t} className={`stepper-row ${i === 0 ? "done" : ""}`}>
                <span>{i === 0 ? <Icon name="check" className="sm" /> : i + 1}</span>
                <div>
                  <strong>{t}</strong>
                  <p>{p}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}

/** The application's uploaded documents: open (GET …/file) or delete (DELETE …/documents/{id}). */
export function DocumentList({ a, onChange }: { a: Application; onChange: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const docs = a.documents ?? [];

  async function remove(id: number, name: string) {
    if (!window.confirm(`Delete ${name}? The file is removed for good.`)) return;
    setBusy(id);
    setError(null);
    try {
      await api.delete(`${APPS}/documents/${id}`);
      notify("Document deleted.");
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <ErrorNote>{error}</ErrorNote>
      {docs.length ? (
        <div className="checklist">
          {docs.map((d) => (
            <div className="check-item" key={d.id}>
              <Icon name="file" className="sm" />
              <label>
                {label(d.category)}
                <small>{`${d.file_name} · ${size(d.size_bytes)} · ${d.is_verified ? "Verified" : d.remark ? `Returned: ${d.remark}` : "Not verified yet"}`}</small>
              </label>
              <button type="button" className="btn" onClick={() => openDocument(d.id).catch((e) => setError(errorText(e)))}>
                Open
              </button>
              <button type="button" className="btn text" disabled={busy === d.id} onClick={() => remove(d.id, d.file_name)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">No documents uploaded yet.</p>
      )}
    </div>
  );
}
