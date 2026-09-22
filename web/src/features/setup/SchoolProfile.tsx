"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading } from "@/components/ui/states";
import type { Paginated } from "@/lib/api";
import { api, errorText } from "@/lib/api";
import { dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, KV, count, orNull } from "./bits";
import type { AcademicYear, AuditEntry, Branch, SchoolProfile as Profile } from "./types";

const PROFILE = "/api/v1/school/profile";

const time = (t: string | null) => (t ? t.slice(0, 5) : null);

/** SCR-024, live: GET /api/v1/school/profile with the current year, branches and student count. */
export function SchoolDetails() {
  const profile = useApi<Profile>(PROFILE);
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const branches = useApi<Branch[]>("/api/v1/school/branches");
  const current = years.data?.find((y) => y.is_current);
  const students = useApi<Paginated<unknown>>(current ? "/api/v1/school/students" : null, { academic_year_id: current?.id, status: "active", page_size: 1 });
  const history = useApi<AuditEntry[]>(profile.data ? "/api/v1/school/audit-log" : null, { entity_type: "School", entity_id: profile.data?.id, limit: 3 });

  if (profile.loading && !profile.data) return <Loading what="Loading the school…" />;
  const s = profile.data;
  if (!s) return <ErrorNote>{profile.error ?? "School not found."}</ErrorNote>;
  const main = branches.data?.find((b) => b.is_main);
  const hours = time(s.school_start_time) && time(s.school_end_time) ? `${time(s.school_start_time)} – ${time(s.school_end_time)}` : "—";

  return (
    <>
      <section className="panel profile-banner">
        <div className="profile-hero">
          <div className="row">
            <span className="avatar mint large" style={s.brand_color ? { background: s.brand_color, color: "#fff" } : undefined}>
              {initials(s.app_name ?? s.name)}
            </span>
            <div>
              <h2>{s.name}</h2>
              <p>{[main?.name, s.address].filter(Boolean).join(" · ") || s.code}</p>
              <div className="profile-meta">
                <span>
                  <Icon name="pin" className="sm" />
                  {` ${main?.name ?? "Single campus"}`}
                </span>
                <span>
                  <Icon name="calendar" className="sm" />
                  {` ${current?.name ?? "No current year"}`}
                </span>
                <Badge>{label(s.status)}</Badge>
              </div>
            </div>
          </div>
          <div className="profile-badge">
            <strong>{count(students.data?.total)}</strong>
            <small>Active students</small>
          </div>
        </div>
        <nav className="module-tabs profile-tabs">
          <Link href={routeOf(24)} className="active">
            Overview
          </Link>
          <Link href={routeOf(22)}>Schools</Link>
          <Link href={routeOf(25)}>Branches</Link>
          <Link href={routeOf(32)}>Branding</Link>
        </nav>
      </section>
      <div className="two-col">
        <div className="stack">
          <Panel title="Organization information">
            <KV
              rows={[
                ["School name", s.name],
                ["School code", s.code],
                ["Board", s.board ?? "—"],
                ["School type", s.school_type ?? "—"],
                ["Principal", s.principal_name ?? "—"],
                ["Academic year", current?.name ?? "—"],
                ["Address", s.address ?? "—"],
              ]}
            />
          </Panel>
          <Panel title="Contact information">
            <KV
              rows={[
                ["Email address", s.email ?? "—"],
                ["Mobile number", s.phone_primary ?? "—"],
                ["Alternate number", s.phone_secondary ?? "—"],
                ["Website", s.website ?? "—"],
                ["Address", s.address ?? "—"],
              ]}
            />
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="At a glance">
            <div className="progress-stack">
              <div className="progress-label">
                <span>Branches</span>
                <strong>{count(branches.data?.length)}</strong>
              </div>
              <div className="progress-label">
                <span>Students</span>
                <strong>{count(students.data?.total)}</strong>
              </div>
              <div className="progress-label">
                <span>Time zone · currency</span>
                <strong>{`${s.timezone} · ${s.currency}`}</strong>
              </div>
              <div className="progress-label">
                <span>School hours</span>
                <strong>{hours}</strong>
              </div>
            </div>
          </Panel>
          <Panel title="Recent activity">
            {history.data?.length ? (
              history.data.map((h) => (
                <div className="timeline-item" key={h.id}>
                  <span className="timeline-dot">
                    <Icon name="file" />
                  </span>
                  <div>
                    <h4>{`Profile ${h.action === "create" ? "created" : "updated"}`}</h4>
                    <p>{`${dateTime(h.created_at)} · ${h.user_name ?? "System"}`}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">{history.loading ? "Loading…" : `Last updated ${dateTime(s.updated_at)}.`}</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

/**
 * SCR-032, live: PATCH /api/v1/school/profile. The logo is uploaded with
 * POST /api/v1/school/profile/logo (PNG, JPG or WEBP, 2 MB), which sets
 * logo_url to the stored file; a pasted image link still works too.
 */
export function SchoolBranding() {
  const profile = useApi<Profile>(PROFILE);
  const [color, setColor] = useState<string | null>(null);
  const [appName, setAppName] = useState<string | null>(null);
  const [accent, setAccent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (profile.loading && !profile.data) return <Loading what="Loading the school profile…" />;
  const s = profile.data;
  if (!s) return <ErrorNote>{profile.error ?? "School not found."}</ErrorNote>;
  const brand = color ?? s.brand_color ?? "";
  const shown = appName ?? s.app_name ?? s.name;
  const accentShown = accent ?? s.accent_color ?? "";

  async function uploadLogo(files: File[]) {
    const file = files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("The logo is larger than 2 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.upload(`${PROFILE}/logo`, fd);
      notify("Logo uploaded.");
      await profile.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const c = orNull(f.get("brand_color"));
    if (c && !/^#[0-9a-fA-F]{6}$/.test(c)) {
      setError("Primary color must be a hex colour such as #2563EB.");
      return;
    }
    const a = orNull(f.get("accent_color"));
    if (a && !/^#[0-9a-fA-F]{6}$/.test(a)) {
      setError("Accent color must be a hex colour such as #F59E0B.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.patch(PROFILE, {
        name: String(f.get("name") ?? "").trim(),
        app_name: orNull(f.get("app_name")),
        brand_color: c,
        accent_color: a,
        website: orNull(f.get("website")),
        logo_url: orNull(f.get("logo_url")),
        email: orNull(f.get("email")),
        principal_name: orNull(f.get("principal_name")),
        phone_primary: orNull(f.get("phone_primary")),
        phone_secondary: orNull(f.get("phone_secondary")),
        address: orNull(f.get("address")),
        timezone: orNull(f.get("timezone")) ?? s!.timezone,
        currency: orNull(f.get("currency")) ?? s!.currency,
      });
      notify("School profile saved.");
      await profile.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-layout">
      <nav className="settings-nav">
        <Link href={routeOf(289)}>School profile</Link>
        <Link href={routeOf(290)}>Academic settings</Link>
        <Link href={routeOf(291)}>Notifications</Link>
        <Link href={routeOf(285)}>{"Roles & permissions"}</Link>
        <Link href={routeOf(292)}>Integrations</Link>
        <Link href={routeOf(293)}>Security</Link>
        <Link href={routeOf(294)}>Audit log</Link>
      </nav>
      <div>
        <form id="branding-form" className="panel" onSubmit={submit}>
          <div className="panel-head">
            <h2>School identity</h2>
          </div>
          <div className="panel-body">
            <ErrorNote>{error}</ErrorNote>
            <div className="two-equal">
              <div>
                <div
                  className="colour-preview"
                  style={{
                    ...(/^#[0-9a-fA-F]{6}$/.test(brand) ? { background: brand } : {}),
                    ...(/^#[0-9a-fA-F]{6}$/.test(accentShown) ? { boxShadow: `inset 0 -6px 0 ${accentShown}` } : {}),
                  }}
                >
                  {shown}
                </div>
                <div className="upload-zone">
                  {s.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.logo_url} alt={`${s.name} logo`} style={{ maxHeight: 64, maxWidth: "100%" }} />
                  ) : (
                    <Icon name="folder" />
                  )}
                  <strong>{uploading ? "Uploading…" : "School logo"}</strong>
                  <span className="small muted">PNG, JPG or WEBP, up to 2 MB</span>
                  <input
                    type="file"
                    aria-label="Choose logo"
                    accept=".png,.jpg,.jpeg,.webp"
                    disabled={uploading}
                    onChange={(e) => {
                      uploadLogo(Array.from(e.target.files ?? []));
                      e.target.value = "";
                    }}
                  />
                  <span className="small muted">or paste a link to the image</span>
                  {/* text, not url: an uploaded logo's link is a path on this site (/api/v1/branding/logo/…) */}
                  <input type="text" name="logo_url" key={s.logo_url ?? ""} aria-label="Logo link" placeholder="https://…" maxLength={500} defaultValue={s.logo_url ?? ""} />
                </div>
              </div>
              <div className="form-grid">
                <Field label="School name" required>
                  <input type="text" name="name" required minLength={2} placeholder="Enter school name" defaultValue={s.name} />
                </Field>
                <Field label="Short name">
                  <input type="text" name="app_name" placeholder="Name shown in the app" defaultValue={s.app_name ?? ""} onChange={(e) => setAppName(e.target.value || null)} />
                </Field>
                <Field label="Primary color">
                  <input type="text" name="brand_color" placeholder="#2563EB" defaultValue={s.brand_color ?? ""} onChange={(e) => setColor(e.target.value)} />
                </Field>
                <Field label="Accent color">
                  <input type="text" name="accent_color" placeholder="#F59E0B" defaultValue={s.accent_color ?? ""} onChange={(e) => setAccent(e.target.value)} />
                </Field>
                <Field label="Website">
                  <input type="url" name="website" placeholder="https://yourschool.edu" defaultValue={s.website ?? ""} />
                </Field>
                <Field label="Support email">
                  <input type="email" name="email" placeholder="Enter support email" defaultValue={s.email ?? ""} />
                </Field>
                <Field label="Principal name">
                  <input type="text" name="principal_name" placeholder="Enter principal name" defaultValue={s.principal_name ?? ""} />
                </Field>
                <Field label="Phone">
                  <input type="tel" name="phone_primary" placeholder="Enter phone" defaultValue={s.phone_primary ?? ""} />
                </Field>
                <Field label="Alternate phone">
                  <input type="tel" name="phone_secondary" placeholder="Enter alternate phone" defaultValue={s.phone_secondary ?? ""} />
                </Field>
                <Field label="Time zone">
                  <input type="text" name="timezone" placeholder="Asia/Kolkata" defaultValue={s.timezone} />
                </Field>
                <Field label="Currency">
                  <input type="text" name="currency" placeholder="INR" maxLength={3} defaultValue={s.currency} />
                </Field>
                <Field label="Address" full>
                  <input type="text" name="address" placeholder="Enter address" defaultValue={s.address ?? ""} />
                </Field>
              </div>
            </div>
          </div>
          <div className="form-footer">
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save branding"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
