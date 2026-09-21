"use client";

import { Icon, type IconName } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { useHydrated } from "@/lib/useSession";
import { applyPath, careersPath, type PublicOpening, type PublicSchoolInfo } from "@/features/public/links";
import type { PublicLink } from "./types";

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Older browsers and plain-http origins: copy through a hidden field.
    const t = document.createElement("textarea");
    t.value = text;
    t.style.position = "fixed";
    t.style.opacity = "0";
    document.body.append(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
  notify("Link copied.");
}

function LinkRow({ icon, title, text, url }: { icon: IconName; title: string; text: string; url: string }) {
  return (
    <div className="check-item" style={{ alignItems: "flex-start" }}>
      <span className="timeline-dot">
        <Icon name={icon} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>{title}</strong>
        <small>{text}</small>
        <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <label className="field" style={{ flex: 1, minWidth: 220 }}>
            <input readOnly value={url} aria-label={`${title} link`} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <button type="button" className="btn" onClick={() => copy(url)}>
            <Icon name="file" className="sm" />
            Copy link
          </button>
          <a className="btn" href={url} target="_blank" rel="noreferrer">
            <Icon name="arrow" className="sm" />
            Open
          </a>
        </div>
      </div>
    </div>
  );
}

/**
 * NEW-001, live: GET /admissions/public-link for the school's codes, then the
 * public pages' own GETs (/public/admissions/{tenant}/{school} and
 * /public/careers/…/openings) to show what a visitor sees.
 */
export function OnlineAdmissionLink() {
  const link = useApi<PublicLink>("/api/v1/school/admissions/public-link");
  const t = link.data?.tenant_code;
  const s = link.data?.code;
  const info = useApi<PublicSchoolInfo>(t && s ? `/api/v1/public/admissions/${encodeURIComponent(t)}/${encodeURIComponent(s)}` : null);
  const openings = useApi<PublicOpening[]>(t && s ? `/api/v1/public/careers/${encodeURIComponent(t)}/${encodeURIComponent(s)}/openings` : null);
  const hydrated = useHydrated();

  if (link.loading && !link.data) return <Loading what="Loading the school's links…" />;
  if (!t || !s) return <ErrorNote>{link.error ?? "The school's public codes could not be loaded."}</ErrorNote>;

  const base = hydrated ? window.location.origin : "";
  const apply = `${base}${applyPath(t, s)}`;
  const i = info.data;
  const jobs = openings.data?.length;

  return (
    <div className="two-col">
      <div className="stack">
        <Panel title="Public links" sub="Share these on the school website, in messages to parents, or as a QR code on posters">
          <div className="checklist">
            <LinkRow icon="message" title="Admission enquiry" text="A short form for parents who want to know more. Each one lands in the enquiry list as a new website enquiry." url={apply} />
            <LinkRow
              icon="file"
              title="Online application"
              text="The full application: student, parents and contact details. It arrives as a submitted application with its own application number."
              url={`${apply}?form=application`}
            />
            <LinkRow
              icon="users"
              title="Careers page"
              text={jobs === undefined ? "Job openings the school has published, with an apply form." : `Job openings the school has published, with an apply form. ${jobs} opening${jobs === 1 ? " is" : "s are"} showing now.`}
              url={`${base}${careersPath(t, s)}`}
            />
          </div>
        </Panel>
        <ErrorNote>{info.error ? `The public form could not be checked: ${info.error}` : null}</ErrorNote>
      </div>
      <aside className="stack">
        <div className="aside-panel">
          <h3>How it works</h3>
          <p>
            Anyone with a link can use it without signing in. Enquiries are tagged with the website as their source; applications start at the submitted stage so the
            office can check documents and schedule an assessment as usual.
          </p>
          <dl className="kv">
            <div>
              <dt>Organisation code</dt>
              <dd className="mono">{t}</dd>
            </div>
            <div>
              <dt>School code</dt>
              <dd className="mono">{s}</dd>
            </div>
            <div>
              <dt>Visitors see</dt>
              <dd>{i ? i.school_name : info.loading ? "Loading…" : "—"}</dd>
            </div>
            <div>
              <dt>Contact shown</dt>
              <dd>{i ? [i.phone, i.email].filter(Boolean).join(" · ") || "None: add a phone or email in the school profile" : "—"}</dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  );
}
