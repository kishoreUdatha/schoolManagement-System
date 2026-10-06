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
import { AdmissionFields, missing, SectionLinks, split, type AdmissionFormDef, type Values } from "./AdmissionFields";

import { ask } from "@/lib/dialog";
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
 * SCR-049, live: the full admission form. GET /school/admission-form?class_id=
 * gives its sections and which fields this class requires or does not ask;
 * POST /admissions/applications (?submitted=true to submit, ?enquiry_id= when
 * started from an enquiry), then the optional document as multipart POST
 * /applications/{id}/documents. With ?id= it edits: GET and PUT
 * /applications/{id}, POST /{id}/submit for a draft, and the documents.
 * A draft may be incomplete; submitting needs every required field.
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
  const [classId, setClassId] = useState<number | "">("");
  const [values, setValues] = useState<Values | null>(null);
  const [docKind, setDocKind] = useState("birth_certificate");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string[]>([]);

  const a = existing.data;
  const e = enquiry.data;
  useEffect(() => {
    if (yearId !== null) return;
    if (editId) {
      if (a) setYearId(a.academic_year_id ?? years.current?.id ?? null);
    } else if (years.current) setYearId(years.current.id);
  }, [years.current, yearId, editId, a]);
  // the form starts from the application, or the enquiry it came from
  useEffect(() => {
    if (values) return;
    if (editId && !a) return;
    if (enquiryId && !editId && !e) return;
    if (a) {
      setClassId(a.class_id ?? "");
      setValues({
        student_name: a.student_name, dob: a.dob, gender: a.gender, previous_school: a.previous_school, category: a.category,
        father_name: a.father_name, mother_name: a.mother_name, guardian_name: a.guardian_name, phone: a.phone, email: a.email,
        sibling_in_school: a.sibling_in_school, transport_required: a.transport_required, notes: a.notes, ...(a.details ?? {}),
      });
    } else {
      setValues(e ? { student_name: e.student_name, dob: e.dob, gender: e.gender, previous_school: e.previous_school, guardian_name: e.parent_name, phone: e.parent_phone, email: e.parent_email } : {});
    }
  }, [a, e, editId, enquiryId, values]);
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });
  const def = useApi<AdmissionFormDef>("/api/v1/school/admission-form", { class_id: classId || undefined });

  if (enquiryId && !editId && enquiry.loading && !e) return <Loading what="Loading the enquiry…" />;
  if (editId && existing.loading && !a) return <Loading what="Loading the application…" />;
  if (editId && !a) return <ErrorNote>{existing.error ?? "Application not found."}</ErrorNote>;
  if (!values || !def.data) return def.error ? <ErrorNote>{def.error}</ErrorNote> : <Loading what="Loading the admission form…" />;
  const form = def.data;
  const locked = a ? a.status === "admitted" || a.status === "withdrawn" : false;
  // What the free-text class was, so choosing no class keeps it.
  const givenClass = a ? a.applying_for_class : (e?.applying_for_class ?? null);
  const set = (k: string, v: string | boolean) => {
    setValues({ ...values, [k]: v });
    if (wrong.length) setWrong([]);
  };

  async function save(submitted: boolean) {
    if (!values) return;
    if (!classId && !givenClass) {
      setError("Choose the class the child is applying for.");
      return;
    }
    // Past the draft stage every required field is needed; a draft only needs
    // the few fields an application cannot exist without.
    const strict = submitted || Boolean(a && a.status !== "draft");
    const essentials: AdmissionFormDef = { ...form, sections: form.sections.map((s) => ({ ...s, fields: s.fields.filter((f) => f.locked) })) };
    const need = missing(strict ? form : essentials, values);
    if (need.length) {
      setWrong(need);
      setError(`Still to fill in: ${need.slice(0, 8).join(", ")}${need.length > 8 ? ` and ${need.length - 8} more` : ""}.`);
      return;
    }
    const { core, details } = split(form, values);
    const hasCommAddress = Object.keys(details).some((k) => k.startsWith("comm_"));
    const body = {
      ...core,
      academic_year_id: yearId,
      class_id: classId || null,
      applying_for_class: classId ? null : givenClass,
      sibling_in_school: Boolean(core.sibling_in_school),
      transport_required: Boolean(core.transport_required),
      // with a communication address the server composes the one-line address
      address: hasCommAddress ? null : (a?.address ?? e?.address ?? null),
      details,
    };
    setSaving(true);
    setError(null);
    try {
      if (a) {
        await api.put(`${APPS}/${a.id}`, body);
        if (file && file.size) await uploadDocument(a.id, file, docKind);
        if (submitted && a.status === "draft") await api.post(`${APPS}/${a.id}/submit`);
        notify(submitted && a.status === "draft" ? `Application ${a.application_no} saved and submitted.` : `Application ${a.application_no} saved.`);
        router.push(`${routeOf(50)}?id=${a.id}`);
        return;
      }
      const created = await api.post<{ id: number; application_no: string }>(APPS, body, { submitted, enquiry_id: e?.id });
      if (file && file.size) {
        try {
          await uploadDocument(created.id, file, docKind);
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

  const head = (
    <>
      <label className="field">
        <span>
          Applying for<span className="req">*</span>
        </span>
        <select value={classId} onChange={(x) => setClassId(x.target.value ? Number(x.target.value) : "")}>
          <option value="">{classes.loading ? "Loading classes…" : givenClass ? `As given: ${givenClass}` : "Select class"}</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Academic year</span>
        <select value={yearId ?? ""} onChange={(x) => setYearId(Number(x.target.value))}>
          {years.data?.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );

  return (
    <div>
      <form
        id="application-form"
        className="panel"
        onSubmit={(ev: FormEvent<HTMLFormElement>) => {
          ev.preventDefault();
          if (!locked) save(true);
        }}
      >
        <div className="panel-pad">
          <ErrorNote>{error ?? enquiry.error ?? years.error}</ErrorNote>
          {e ? <p className="muted" style={{ marginBottom: 12 }}>{`From enquiry ENQ-${e.id} · applying for ${e.applying_for_class ?? "—"}`}</p> : null}
          {a ? (
            <p className="muted" style={{ marginBottom: 12 }}>
              {locked ? `Application ${a.application_no} is ${label(a.status).toLowerCase()} and can no longer be edited.` : `Editing application ${a.application_no} · ${label(a.status)}`}
            </p>
          ) : null}
          <SectionLinks def={form} values={values} />
          <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <AdmissionFields def={form} values={values} onChange={set} before={head} errors={wrong} />
            <div className="form-sections">
              <section>
                <div className="form-section-title">
                  <span className="number">{String(form.sections.length + 1).padStart(2, "0")}</span>
                  <h3>Documents</h3>
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>Document type</span>
                    <select value={docKind} onChange={(x) => setDocKind(x.target.value)}>
                      {DOC_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {label(k)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{a ? "Add a document" : "Document"}</span>
                    <input type="file" aria-label="Document" onChange={(x) => setFile(x.target.files?.[0] ?? null)} />
                  </label>
                </div>
                {a ? <DocumentList a={a} onChange={existing.reload} /> : null}
              </section>
            </div>
          </fieldset>
        </div>
        <div className="form-footer">
          <span>Fields marked * are needed to submit; a draft can be saved incomplete</span>
          <div className="actions">
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
            {!a || a.status === "draft" ? (
              <button type="button" className="btn" disabled={saving || locked} onClick={() => save(false)}>
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
    </div>
  );
}

/** The application's uploaded documents: open (GET …/file) or delete (DELETE …/documents/{id}). */
export function DocumentList({ a, onChange }: { a: Application; onChange: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const docs = a.documents ?? [];

  async function remove(id: number, name: string) {
    if (!(await ask(`Delete ${name}? The file is removed for good.`))) return;
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
