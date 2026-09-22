"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { SentList } from "@/features/platform/Messaging";
import { useSession } from "@/lib/useSession";
import { BoardSelect, Field, KV, SectionTitle, count, orNull } from "./bits";
import type { ActivityItem } from "../dashboards/types";
import type { UsageSummary } from "@/features/platform/types";
import type { Plan, Tenant, TenantCreated, TenantDetail, TenantSchool, TenantUsage } from "./types";

const TENANTS = "/api/v1/super-admin/tenants";
const PAGE_SIZE = 20;
const SCHOOL_TYPES = ["Co-educational day school", "Boys' school", "Girls' school", "Day and boarding school", "Residential school"];

/** Organisations (tenants) are platform records: only the super admin can read them. */
function PlatformOnly() {
  return (
    <section className="panel">
      <div className="panel-pad muted">Organisations and schools are managed by the platform administrator. Sign in with a super-admin account to see them.</div>
    </section>
  );
}

function useIsPlatform() {
  const user = useSession()?.user;
  return { ready: Boolean(user), platform: user?.role === "super_admin" };
}

type Line = { tenant: Tenant; detail: TenantDetail | null; students: number | null };

/**
 * SCR-022, live. The API lists organisations (tenants), each owning its
 * schools, so each organisation on the page is opened once for its schools
 * and once for its usage (the student count). Twenty rows per page.
 */
export function SchoolsList() {
  const router = useRouter();
  const { ready, platform } = useIsPlatform();
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const list = useApi<{ items: Tenant[]; total: number; pages: number }>(platform ? TENANTS : null, { page, page_size: PAGE_SIZE, search, status });
  const [lines, setLines] = useState<Line[] | null>(null);
  // Platform-wide figures for the strip (the list itself is one page of organisations).
  const summary = useApi<UsageSummary>(platform ? "/api/v1/super-admin/usage/summary" : null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);
  useEffect(() => setPage(1), [search, status]);

  useEffect(() => {
    if (!list.data) return;
    let live = true;
    Promise.all(
      list.data.items.map(async (tenant) => {
        const [detail, usage] = await Promise.all([
          api.get<TenantDetail>(`${TENANTS}/${tenant.id}`).catch(() => null),
          api.get<TenantUsage>(`${TENANTS}/${tenant.id}/usage`).catch(() => null),
        ]);
        return { tenant, detail, students: usage?.students.used ?? null };
      }),
    ).then((l) => live && setLines(l));
    return () => {
      live = false;
    };
  }, [list.data]);

  if (ready && !platform) return <PlatformOnly />;

  // One row per school; an organisation with no school still shows, so it is not lost.
  const flat = (lines ?? []).flatMap((l): (Line & { school: TenantSchool | null; many: boolean })[] =>
    l.detail?.schools.length ? l.detail.schools.map((s) => ({ ...l, school: s, many: l.detail!.schools.length > 1 })) : [{ ...l, school: null, many: false }],
  );
  const rows: Row[] = flat.map((r) => [
    { name: r.school?.name ?? "No school yet", sub: r.school?.address ?? undefined },
    r.school?.code ?? "—",
    r.tenant.name,
    r.school?.board ?? "—",
    r.school ? String(r.school.branch_count) : "—",
    // Students are counted per organisation; with several schools the figure covers them all.
    r.students === null ? "—" : `${r.students.toLocaleString("en-IN")}${r.many ? " (organisation)" : ""}`,
    label(r.tenant.status === "active" && r.school && !r.school.is_active ? "inactive" : r.tenant.status),
  ]);

  const sum = summary.data;
  const n = (v: number | undefined) => (v === undefined ? (summary.error ? "—" : "…") : v.toLocaleString("en-IN"));
  const stats = [
    { label: "Organisations", value: n(sum?.total_tenants), note: sum ? `${sum.active_tenants} active · ${sum.suspended_tenants} suspended` : "On the platform" },
    { label: "Schools", value: n(sum?.total_schools), note: "Across all organisations" },
    { label: "Students", value: n(sum?.total_students), note: `${sum ? sum.total_staff.toLocaleString("en-IN") : "…"} staff` },
    { label: "Renewals due", value: n(sum?.pending_renewals), note: "Subscriptions ending within 14 days" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search schools list…" aria-label="Search organisations" />
        </div>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel title="All schools" sub={`${list.data ? `${list.data.total} organisations` : "Organisations"}${list.loading || (list.data && !lines) ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["School", "School code", "Organization", "Board", "Branches", "Students", "Status"]}
          rows={rows}
          total={list.data?.total}
          page={page}
          pages={list.data?.pages ?? 1}
          onPage={setPage}
          onView={(i) => router.push(`${routeOf(21)}?id=${flat[i].tenant.id}`)}
          empty={list.loading || !lines ? "Loading schools…" : search || status ? "No schools match these filters." : "No schools on the platform yet."}
        />
      </Panel>
    </>
  );
}

/**
 * SCR-021, live: GET /super-admin/tenants/{id} (?id=) with usage and the
 * subscribed plan; "Edit profile" (?edit=1) saves with PATCH /tenants/{id}.
 */
export function OrganizationProfile() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");
  const edit = params.get("edit") === "1";
  const { ready, platform } = useIsPlatform();
  const org = useApi<TenantDetail>(platform && id ? `${TENANTS}/${id}` : null);
  const usage = useApi<TenantUsage>(platform && id ? `${TENANTS}/${id}/usage` : null);
  const plans = useApi<{ items: Plan[] }>(platform && id ? "/api/v1/super-admin/plans" : null);
  const activity = useApi<ActivityItem[]>(platform && id ? `${TENANTS}/${id}/activity` : null, { limit: 5 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (ready && !platform) return <PlatformOnly />;
  if (!id) return <PickFirst what="organisation" href={routeOf(22)} cta="Open the schools list" />;
  if (org.loading && !org.data) return <Loading what="Loading the organisation…" />;
  const t = org.data;
  if (!t) return <ErrorNote>{org.error ?? "Organisation not found."}</ErrorNote>;
  const sub = t.current_subscription;
  const plan = sub ? plans.data?.items.find((p) => p.id === sub.plan_id) : undefined;
  const planName = sub ? (plan?.name ?? "…") : "No plan";

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api.patch(`${TENANTS}/${t!.id}`, {
        name: String(f.get("name") ?? "").trim(),
        address: orNull(f.get("address")),
        contact_person: orNull(f.get("contact_person")),
        contact_email: String(f.get("contact_email") ?? "").trim(),
        contact_mobile: String(f.get("contact_mobile") ?? "").trim(),
      });
      notify("Organisation updated.");
      await org.reload();
      router.replace(`${routeOf(21)}?id=${t!.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <section className="panel profile-banner">
        <div className="profile-hero">
          <div className="row">
            <span className="avatar mint large">{initials(t.name)}</span>
            <div>
              <h2>{t.name}</h2>
              <p>{`${t.schools.length} ${t.schools.length === 1 ? "school" : "schools"} · ${sub ? `${planName} plan` : "No plan"}`}</p>
              <div className="profile-meta">
                <span>
                  <Icon name="pin" className="sm" />
                  {` ${t.code}`}
                </span>
                <span>
                  <Icon name="calendar" className="sm" />
                  {` Since ${date(t.created_at)}`}
                </span>
                <Badge>{label(t.status)}</Badge>
              </div>
            </div>
          </div>
          <div className="profile-badge">
            <strong>{t.schools.filter((s) => s.is_active).length}</strong>
            <small>Active schools</small>
          </div>
        </div>
        <nav className="module-tabs profile-tabs">
          <Link href={`${routeOf(21)}?id=${t.id}`} className="active">
            Overview
          </Link>
          <Link href={routeOf(22)}>Schools</Link>
          <Link href={routeOf(25)}>Branches</Link>
          <Link href={routeOf(32)}>Branding</Link>
        </nav>
      </section>
      <div className="two-col">
        <div className="stack">
          {edit ? (
            <form className="panel" onSubmit={save}>
              <div className="panel-head">
                <h2>Organization information</h2>
              </div>
              <div className="panel-body">
                <ErrorNote>{error}</ErrorNote>
                <div className="form-grid">
                  <Field label="Organization name" required>
                    <input name="name" required minLength={2} defaultValue={t.name} />
                  </Field>
                  <Field label="Contact person">
                    <input name="contact_person" defaultValue={t.contact_person ?? ""} />
                  </Field>
                  <Field label="Phone" required>
                    <input type="tel" name="contact_mobile" required defaultValue={t.contact_mobile} />
                  </Field>
                  <Field label="Email address" required>
                    <input type="email" name="contact_email" required defaultValue={t.contact_email} />
                  </Field>
                  <Field label="Address" full>
                    <input name="address" defaultValue={t.address ?? ""} />
                  </Field>
                </div>
              </div>
              <div className="form-footer">
                <span>Fields marked * are required</span>
                <div className="actions">
                  <Link href={`${routeOf(21)}?id=${t.id}`} className="btn">
                    Cancel
                  </Link>
                  <button type="submit" className="btn primary" disabled={saving}>
                    <Icon name="check" className="sm" />
                    {saving ? "Saving…" : "Save organisation"}
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <Panel title="Organization information">
              <KV
                rows={[
                  ["Organization name", t.name],
                  ["Organization code", t.code],
                  ["Contact person", t.contact_person ?? "—"],
                  ["Phone", t.contact_mobile],
                  ["Email address", t.contact_email],
                  ["Address", t.address ?? "—"],
                ]}
              />
            </Panel>
          )}
          <Panel title="Schools" sub={`${t.schools.length} under this organisation`}>
            {t.schools.length ? (
              t.schools.map((s) => (
                <div className="timeline-item" key={s.id}>
                  <span className="timeline-dot">
                    <Icon name="building" />
                  </span>
                  <div>
                    <h4>{`${s.name} · ${s.code}`}</h4>
                    <p>{`${s.is_active ? "Active" : "Inactive"} · ${s.timezone} · ${s.currency} · since ${date(s.created_at)}`}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No school has been set up under this organisation.</p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="At a glance">
            <div className="progress-stack">
              <div className="progress-label">
                <span>Schools</span>
                <strong>{t.schools.length}</strong>
              </div>
              <div className="progress-label">
                <span>Students</span>
                <strong>{count(usage.data?.students.used)}</strong>
              </div>
              <div className="progress-label">
                <span>Active users</span>
                <strong>{count(usage.data?.active_users)}</strong>
              </div>
              <div className="progress-label">
                <span>Plan</span>
                <strong>{sub ? `${planName} · ${label(sub.billing_cycle)}` : "No plan"}</strong>
              </div>
              {sub?.expires_at ? (
                <div className="progress-label">
                  <span>Renews</span>
                  <strong>{date(sub.expires_at)}</strong>
                </div>
              ) : null}
            </div>
          </Panel>
          <Panel title="Recent activity" sub="From this organisation's audit trail">
            {activity.data?.length ? (
              activity.data.map((a) => (
                <div className="timeline-item" key={a.id}>
                  <span className="timeline-dot">
                    <Icon name="file" />
                  </span>
                  <div>
                    <h4>{a.title}</h4>
                    <p>{[a.detail, a.user_name ?? "System"].filter(Boolean).join(" · ")}</p>
                  </div>
                  <time>{dateTime(a.created_at)}</time>
                </div>
              ))
            ) : (
              <p className="muted">{activity.loading ? "Loading…" : (activity.error ?? "Nothing recorded for this organisation yet.")}</p>
            )}
          </Panel>
        </aside>
      </div>
    </>
  );
}

/** Page-head button: switch the profile into edit mode, keeping ?id=. */
export function EditOrganizationLink() {
  const id = useSearchParams().get("id");
  return (
    <Link href={id ? `${routeOf(21)}?id=${id}&edit=1` : routeOf(22)} className="btn primary">
      <Icon name="arrow" className="sm" />
      Edit profile
    </Link>
  );
}

/**
 * SCR-023, live: POST /super-admin/tenants. The API only creates a school
 * together with a new organisation and its first administrator, so the
 * form asks for all three. The administrator's temporary password is shown
 * once, as the API returns it only once.
 */
export function AddSchool() {
  const router = useRouter();
  const { ready, platform } = useIsPlatform();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<TenantCreated | null>(null);

  if (ready && !platform) return <PlatformOnly />;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    setSaving(true);
    setError(null);
    try {
      const data = await api.post<TenantCreated>(TENANTS, {
        name: text("name"),
        code: orNull(f.get("code")),
        address: orNull(f.get("address")),
        board: orNull(f.get("board")),
        school_type: orNull(f.get("school_type")),
        contact_person: orNull(f.get("contact_person")),
        contact_email: text("contact_email"),
        contact_mobile: text("contact_mobile"),
        school_admin_name: text("school_admin_name"),
        school_admin_email: text("school_admin_email"),
        school_admin_phone: orNull(f.get("school_admin_phone")),
      });
      notify(`${data.school.name} created.`);
      setCreated(data);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <h2>School created</h2>
          </div>
          <div className="panel-body">
            <KV
              rows={[
                ["School", `${created.school.name} · ${created.school.code}`],
                ["Organization", `${created.tenant.name} · ${created.tenant.code}`],
                ["Administrator signs in with", created.school_admin_email],
              ]}
            />
            {created.school_admin_temporary_password ? (
              <div className="tip warn" role="alert" style={{ marginTop: 16 }}>
                <Icon name="bell" className="sm" />
                <span>
                  {`The administrator's temporary password is `}
                  <b className="mono">{created.school_admin_temporary_password}</b>
                  {`. It is shown only once — send it to ${created.school_admin_email} before leaving this page.`}
                </span>
              </div>
            ) : null}
            {created.credentials_sent ? (
              <div style={{ marginTop: 16 }}>
                <h3 style={{ fontSize: 15, marginBottom: 8 }}>Sent to their mobile</h3>
                <SentList sent={created.credentials_sent} />
              </div>
            ) : null}
          </div>
          <div className="form-footer">
            <span />
            <div className="actions">
              <button type="button" className="btn" onClick={() => setCreated(null)}>
                Add another school
              </button>
              <button type="button" className="btn primary" onClick={() => router.push(`${routeOf(21)}?id=${created.tenant.id}`)}>
                <Icon name="arrow" className="sm" />
                Open organisation
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="two-col">
      <form id="school-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error}</ErrorNote>
          <div className="form-sections">
            <section>
              <SectionTitle n="01">Details</SectionTitle>
              <div className="form-grid">
                <Field label="School name" required>
                  <input type="text" name="name" required minLength={2} placeholder="Enter school name" />
                </Field>
                <Field label="School code">
                  <input type="text" name="code" placeholder="Leave blank to generate one" />
                </Field>
                <Field label="Board">
                  <BoardSelect />
                </Field>
                <Field label="School type">
                  <select name="school_type" aria-label="School type" defaultValue="">
                    <option value="">Not set</option>
                    {SCHOOL_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Principal name">
                  <input type="text" name="contact_person" placeholder="Enter principal or contact name" />
                </Field>
                <Field label="Email address" required>
                  <input type="email" name="contact_email" required placeholder="Enter email address" />
                </Field>
                <Field label="Phone" required>
                  <input type="tel" name="contact_mobile" required placeholder="Enter phone" />
                </Field>
                <Field label="Address">
                  <input type="text" name="address" placeholder="Enter address" />
                </Field>
              </div>
            </section>
            <section>
              <SectionTitle n="02">School administrator</SectionTitle>
              <div className="form-grid">
                <Field label="Administrator name" required>
                  <input type="text" name="school_admin_name" required minLength={2} placeholder="Who will run the school account" />
                </Field>
                <Field label="Administrator email" required>
                  <input type="email" name="school_admin_email" required placeholder="They sign in with this" />
                </Field>
                <Field label="Administrator phone">
                  <input type="tel" name="school_admin_phone" placeholder="Enter phone" />
                </Field>
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
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Creating…" : "Create school"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>School setup</h3>
          <KV
            rows={[
              ["Organization", "Created with the school"],
              ["Administrator", "Created with the school"],
              ["Status", "Active on creation"],
            ]}
          />
          <div className="gap" />
          <p>A new school always comes with its own organisation and first administrator. Adding a second school to an existing organisation is not supported yet.</p>
        </div>
      </aside>
    </div>
  );
}
