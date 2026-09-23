"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { PublicOpening, PublicSchoolInfo } from "./links";
import { PublicFrame, PublicNote } from "./PublicFrame";

/** The backend's limit for a résumé sent from this page (public/careers.py RESUME_MAX_MB). */
const RESUME_MAX_MB = 5;

function Field({ label: text, required = false, full = false, children }: { label: string; required?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {text}
        {required ? <span className="req">*</span> : null}
      </span>
      {children}
    </label>
  );
}

/**
 * The school's careers page, no sign-in: GET /public/careers/{tenant}/{school}
 * and …/openings (published, public openings only); POST
 * …/openings/{id}/apply/form (multipart: the candidate's details as JSON in
 * `payload`, plus an optional résumé — PDF or Word, 5 MB at most).
 */
export function Careers({ tenant, school }: { tenant: string; school?: string }) {
  // one code is the short link of an organization with a single school
  const base = `/api/v1/public/careers/${encodeURIComponent(tenant)}${school ? `/${encodeURIComponent(school)}` : ""}`;
  const info = useApi<PublicSchoolInfo>(base);
  const openings = useApi<PublicOpening[]>(info.data ? `${base}/openings` : null);
  const [applying, setApplying] = useState<PublicOpening | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function apply(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!applying) return;
    const f = new FormData(ev.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    // The apply endpoint has no honeypot field, so a filled one is dropped here.
    if (text("website")) {
      setDone("Thank you.");
      return;
    }
    const resume = f.get("resume");
    const file = resume instanceof File && resume.name ? resume : null;
    if (file && file.size > RESUME_MAX_MB * 1024 * 1024) {
      setError(`The résumé is larger than ${RESUME_MAX_MB} MB.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        candidate: {
          full_name: text("full_name"),
          email: text("email"),
          phone: text("phone"),
          source: "website",
          qualification: text("qualification"),
          experience_years: text("experience_years"),
          current_employer: text("current_employer"),
        },
        message: text("message"),
      };
      const body = new FormData();
      body.append("payload", JSON.stringify(payload));
      if (file) body.append("resume", file);
      const ack = await api.upload<{ message: string }>(`${base}/openings/${applying.id}/apply/form`, body);
      setDone(ack.message);
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
          Teach, grow and
          <br />
          belong with us.
        </>
      }
      text={`Open positions at ${name ?? "the school"}. Apply online and the recruitment team will be in touch.`}
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

  if (done && applying)
    return frame(
      <PublicNote icon="check" title="Application sent">
        <p>{done}</p>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setDone(null);
            setApplying(null);
          }}
        >
          See other openings
        </button>
      </PublicNote>,
    );

  if (applying)
    return frame(
      <>
        <div className="auth-top">
          <button type="button" className="btn text" onClick={() => setApplying(null)}>
            All openings
          </button>
        </div>
        <form className="auth-form" style={{ maxWidth: 560, position: "relative" }} onSubmit={apply}>
          <h1>{applying.title}</h1>
          <p>{[applying.reference_no, applying.department_name, label(applying.employment_type)].filter(Boolean).join(" · ")}</p>
          <ErrorNote>{error}</ErrorNote>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, opacity: 0 }} />
          <div className="form-grid" style={{ rowGap: 0 }}>
            <Field label="Full name" required full>
              <input name="full_name" required minLength={2} maxLength={160} autoComplete="name" />
            </Field>
            <Field label="Email address" required>
              <input type="email" name="email" required minLength={5} maxLength={255} autoComplete="email" />
            </Field>
            <Field label="Mobile number">
              <input type="tel" name="phone" maxLength={20} autoComplete="tel" />
            </Field>
            <Field label="Highest qualification">
              <input name="qualification" maxLength={200} placeholder="e.g. M.Sc., B.Ed." />
            </Field>
            <Field label="Experience (years)">
              <input type="number" name="experience_years" min={0} max={60} step="0.5" />
            </Field>
            <Field label="Current employer" full>
              <input name="current_employer" maxLength={160} />
            </Field>
            <Field label="Why this role?" full>
              <textarea name="message" maxLength={2000} rows={4} />
            </Field>
            <Field label="Résumé" full>
              <input type="file" name="resume" accept=".pdf,.doc,.docx" />
              <span className="small muted">{`PDF or Word, up to ${RESUME_MAX_MB} MB`}</span>
            </Field>
          </div>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Sending…" : "Send application"}
          </button>
          <div className="auth-note">Your details and résumé go only to the school&apos;s recruitment team.</div>
        </form>
      </>,
    );

  const list = openings.data ?? [];
  return frame(
    <div style={{ width: "100%", maxWidth: 560, margin: "auto" }}>
      <h1 style={{ fontSize: 30, marginBottom: 12 }}>Open positions</h1>
      <p className="muted" style={{ marginBottom: 24 }}>
        {openings.loading ? "Loading…" : list.length ? `${list.length} opening${list.length === 1 ? "" : "s"} at ${name}` : `${name} has no openings right now. Please check again later.`}
      </p>
      <ErrorNote>{openings.error}</ErrorNote>
      <div className="stack">
        {list.map((o) => (
          <section className="panel" key={o.id}>
            <div className="panel-head">
              <div>
                <h2>{o.title}</h2>
                <p>
                  {[o.department_name, label(o.employment_type), `${o.vacancies} vacanc${o.vacancies === 1 ? "y" : "ies"}`, o.closes_on ? `Apply by ${date(o.closes_on)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  setError(null);
                  setApplying(o);
                }}
              >
                Apply
              </button>
            </div>
            {o.description || o.requirements ? (
              <div className="panel-body">
                {o.description ? <p className="small" style={{ whiteSpace: "pre-line", lineHeight: 1.8 }}>{o.description}</p> : null}
                {o.requirements ? (
                  <p className="small muted" style={{ whiteSpace: "pre-line", lineHeight: 1.8, marginTop: 8 }}>
                    <strong>What we look for: </strong>
                    {o.requirements}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </div>,
  );
}
