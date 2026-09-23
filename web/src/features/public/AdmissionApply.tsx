"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { PublicSchoolInfo } from "./links";
import { PublicFrame, PublicNote } from "./PublicFrame";

type Ack = { ok?: boolean; message: string; application_no?: string };

function Field({ label, required = false, full = false, children }: { label: string; required?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {label}
        {required ? <span className="req">*</span> : null}
      </span>
      {children}
    </label>
  );
}

/** A field bots fill in and people never see; the API drops those submissions. */
function Honeypot() {
  return (
    <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, opacity: 0 }} />
  );
}

/**
 * The online admission form, no sign-in: GET /public/admissions/{tenant}/{school}
 * for the school, POST …/enquiries (the default) or …/applications (?form=application).
 * With one code (the short link of an organization that has a single school)
 * the same endpoints answer under /public/admissions/{code}.
 */
export function AdmissionApply({ tenant, school }: { tenant: string; school?: string }) {
  const base = `/api/v1/public/admissions/${encodeURIComponent(tenant)}${school ? `/${encodeURIComponent(school)}` : ""}`;
  const path = usePathname();
  const full = useSearchParams().get("form") === "application";
  const info = useApi<PublicSchoolInfo>(base);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Ack | null>(null);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const shared = {
      student_name: text("student_name"),
      dob: text("dob"),
      gender: text("gender"),
      applying_for_class: text("applying_for_class"),
      previous_school: text("previous_school"),
      address: text("address"),
      website: text("website"),
    };
    setSaving(true);
    setError(null);
    try {
      const ack = full
        ? await api.post<Ack>(`${base}/applications`, {
            ...shared,
            father_name: text("father_name"),
            mother_name: text("mother_name"),
            guardian_name: text("parent_name"),
            phone: text("phone"),
            email: text("email"),
            category: text("category"),
            sibling_in_school: f.get("sibling_in_school") === "on",
            notes: text("message"),
          })
        : await api.post<Ack>(`${base}/enquiries`, {
            ...shared,
            parent_name: text("parent_name"),
            parent_phone: text("phone"),
            parent_email: text("email"),
            message: text("message"),
          });
      setDone(ack);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  const name = info.data?.school_name;
  const frame = (body: ReactNode) => (
    <PublicFrame
      info={info.data}
      heading={
        <>
          Admissions open.
          <br />
          We would love to meet you.
        </>
      }
      text={full ? `Apply to ${name ?? "the school"} online. The admissions office will contact you about documents and the next steps.` : `Tell ${name ?? "the school"} about your child and the admissions office will get back to you.`}
    >
      {body}
    </PublicFrame>
  );

  if (info.loading && !info.data) return frame(<div className="auth-form muted">Loading…</div>);
  if (!info.data)
    return frame(
      <PublicNote icon="bell" title="This link is not valid">
        <p>{info.error === "Not found." || !info.error ? "Check the address with the school; it may have changed." : info.error}</p>
      </PublicNote>,
    );

  if (done)
    return frame(
      <PublicNote icon="check" title={full ? "Application received" : "Thank you"}>
        <p>{done.message}</p>
        {done.application_no ? (
          <p>
            Application number: <strong className="mono">{done.application_no}</strong>. Keep it for any questions.
          </p>
        ) : null}
        <button type="button" className="btn" onClick={() => setDone(null)}>
          {full ? "Send another application" : "Send another enquiry"}
        </button>
      </PublicNote>,
    );

  return frame(
    <>
      <div className="auth-top">
        {full ? "Only have a question? " : "Ready to apply? "}
        <Link href={full ? path : `${path}?form=application`}>{full ? "Send an enquiry" : "Fill in the full application"}</Link>
      </div>
      <form className="auth-form" style={{ maxWidth: 560, position: "relative" }} onSubmit={submit}>
        <h1>{full ? "Admission application" : "Admission enquiry"}</h1>
        <p>{`${name}${full ? " · fields marked * are required" : " · takes a minute"}`}</p>
        <ErrorNote>{error}</ErrorNote>
        <Honeypot />
        <div className="form-grid" style={{ rowGap: 0 }}>
          <Field label="Student's name" required full>
            <input name="student_name" required minLength={2} maxLength={160} autoComplete="off" />
          </Field>
          <Field label="Date of birth">
            <input type="date" name="dob" />
          </Field>
          <Field label="Gender">
            <select name="gender" defaultValue="">
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Applying for class">
            <input name="applying_for_class" maxLength={60} placeholder="e.g. Grade 3" />
          </Field>
          <Field label="Current or previous school">
            <input name="previous_school" maxLength={200} />
          </Field>
          {full ? (
            <>
              <Field label="Father's name">
                <input name="father_name" maxLength={160} />
              </Field>
              <Field label="Mother's name">
                <input name="mother_name" maxLength={160} />
              </Field>
            </>
          ) : null}
          <Field label={full ? "Guardian for this application" : "Parent's name"} required>
            <input name="parent_name" required minLength={2} maxLength={160} autoComplete="name" />
          </Field>
          <Field label="Mobile number" required>
            <input type="tel" name="phone" required minLength={6} maxLength={20} autoComplete="tel" />
          </Field>
          <Field label="Email address" full={!full}>
            <input type="email" name="email" maxLength={255} autoComplete="email" />
          </Field>
          {full ? (
            <Field label="Category">
              <input name="category" maxLength={60} placeholder="Optional" />
            </Field>
          ) : null}
          <Field label="Address" full>
            <textarea name="address" maxLength={2000} rows={2} autoComplete="street-address" />
          </Field>
          {full ? (
            <label className="field full">
              <span className="row">
                <input type="checkbox" name="sibling_in_school" /> A brother or sister already studies here
              </span>
            </label>
          ) : null}
          <Field label={full ? "Anything else the school should know" : "Your question or message"} full>
            <textarea name="message" maxLength={full ? 5000 : 2000} rows={3} />
          </Field>
        </div>
        <button type="submit" className="btn primary" disabled={saving}>
          <Icon name="check" className="sm" />
          {saving ? "Sending…" : full ? "Submit application" : "Send enquiry"}
        </button>
        <div className="auth-note">Your details go only to the school&apos;s admissions office.</div>
      </form>
      <div className="auth-help">{`Need help? Contact ${name}${info.data.phone ? ` on ${info.data.phone}` : ""}.`}</div>
    </>,
  );
}
