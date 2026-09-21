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
import { APPS, ENQ, uploadDocument, useYears } from "./shared";
import { DOC_KINDS, type EnquiryDetail } from "./types";

/**
 * SCR-049, live: POST /admissions/applications (?submitted=true to submit,
 * ?enquiry_id= when started from an enquiry), then the optional document as
 * multipart POST /applications/{id}/documents.
 */
export function ApplicationForm() {
  const router = useRouter();
  const enquiryId = useSearchParams().get("enquiry");
  const enquiry = useApi<EnquiryDetail>(enquiryId ? `${ENQ}/${enquiryId}` : null);
  const years = useYears();
  const [yearId, setYearId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (yearId === null && years.current) setYearId(years.current.id);
  }, [years.current, yearId]);
  const classes = useApi<SchoolClass[]>(yearId ? "/api/v1/school/classes" : null, { academic_year_id: yearId });

  if (enquiryId && enquiry.loading && !enquiry.data) return <Loading what="Loading the enquiry…" />;
  const e = enquiry.data;

  async function save(form: HTMLFormElement, submitted: boolean) {
    if (!form.reportValidity()) return;
    const f = new FormData(form);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const classId = text("class_id") ? Number(text("class_id")) : null;
    const file = f.get("document") as File | null;
    setSaving(true);
    setError(null);
    try {
      const created = await api.post<{ id: number; application_no: string }>(
        APPS,
        {
          academic_year_id: yearId,
          class_id: classId,
          applying_for_class: classId ? null : e?.applying_for_class ?? null,
          student_name: text("student_name"),
          dob: text("dob"),
          gender: text("gender"),
          previous_school: text("previous_school"),
          guardian_name: text("guardian_name"),
          phone: text("phone"),
          email: text("email"),
          address: text("address"),
        },
        { submitted, enquiry_id: e?.id },
      );
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
          save(ev.currentTarget, true);
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
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Application information</h3>
              </div>
              <div className="form-grid">
                {field("Student name", <input type="text" name="student_name" placeholder="Enter student name" required minLength={2} defaultValue={e?.student_name} />, true)}
                {field("Date of birth", <input type="date" name="dob" required defaultValue={e?.dob ?? ""} />, true)}
                {field(
                  "Gender",
                  <select name="gender" required defaultValue={e?.gender ?? ""}>
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>,
                  true,
                )}
                {field(
                  "Applying for",
                  <select name="class_id" required={!e?.applying_for_class}>
                    <option value="">{classes.loading ? "Loading classes…" : e?.applying_for_class ? `As in the enquiry: ${e.applying_for_class}` : "Select class"}</option>
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
                {field("Previous school", <input type="text" name="previous_school" placeholder="Enter previous school" defaultValue={e?.previous_school ?? ""} />)}
              </div>
            </section>
            <section>
              <div className="form-section-title">
                <span className="number">02</span>
                <h3>Contact & additional information</h3>
              </div>
              <div className="form-grid">
                {field("Parent name", <input type="text" name="guardian_name" placeholder="Enter parent name" required minLength={2} defaultValue={e?.parent_name} />, true)}
                {field("Mobile number", <input type="tel" name="phone" placeholder="Enter mobile number" required minLength={6} defaultValue={e?.parent_phone} />, true)}
                {field("Email address", <input type="email" name="email" placeholder="Enter email address" defaultValue={e?.parent_email ?? ""} />)}
                {field("Address", <input type="text" name="address" placeholder="Enter address" defaultValue={e?.address ?? ""} />)}
                {/* Not wired: Transport required — the application has no transport field */}
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
                {field("Documents", <input type="file" name="document" aria-label="Documents" />)}
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
            <button type="button" className="btn" disabled={saving} onClick={(ev) => save(ev.currentTarget.form as HTMLFormElement, false)}>
              Save as draft
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Submit application"}
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
