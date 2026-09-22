"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText, type Paginated } from "@/lib/api";
import { date, dateTime, initials, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { SignInDetailsPanel } from "./Messaging";
import type { Meter, Payment, Plan, Subscription, TenantDetail, TenantStatus, TenantUsage } from "./types";

const num = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("en-IN"));
const meter = (m: Meter | undefined) => (m ? `${num(m.used)}${m.limit ? ` of ${num(m.limit)}` : ""}` : "—");

function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Page-head button: open this organization's edit form (?edit=1). */
export function EditOrganizationLink() {
  const id = useSearchParams().get("id");
  return (
    <Link href={id ? `${routeOf(12)}?id=${id}&edit=1` : routeOf(10)} className="btn primary">
      <Icon name="arrow" className="sm" />
      Edit organization
    </Link>
  );
}

/**
 * SCR-012, live: GET /super-admin/tenants/{id}, its usage, payments and the
 * plan list. Edit (PATCH /tenants/{id}), suspend or reactivate
 * (PATCH /tenants/{id}/status), assign a plan (POST /tenants/{id}/subscription)
 * and record a payment (POST /tenants/{id}/payments). The subscription panel
 * reads GET /tenants/{id}/subscription (404 means none assigned).
 */
export function OrganizationDetails() {
  const router = useRouter();
  const search = useSearchParams();
  const id = search.get("id");
  const editing = search.get("edit") === "1";
  const t = useApi<TenantDetail>(id ? `/api/v1/super-admin/tenants/${id}` : null);
  const usage = useApi<TenantUsage>(id ? `/api/v1/super-admin/tenants/${id}/usage` : null);
  const payments = useApi<Paginated<Payment>>(id ? `/api/v1/super-admin/tenants/${id}/payments` : null);
  const plans = useApi<Paginated<Plan>>("/api/v1/super-admin/plans");
  const subscription = useApi<Subscription>(id ? `/api/v1/super-admin/tenants/${id}/subscription` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!id) return <PickFirst what="organization" href={routeOf(10)} cta="Open the organizations list" />;
  if (t.loading && !t.data) return <Loading what="Loading the organization…" />;
  const o = t.data;
  if (!o) return <ErrorNote>{t.error ?? "Organization not found."}</ErrorNote>;

  const sub = o.current_subscription;
  const plan = sub ? plans.data?.items.find((p) => p.id === sub.plan_id) : undefined;
  const planName = sub ? (plan?.name ?? `Plan #${sub.plan_id}`) : "No plan";
  const u = usage.data;
  const reloadAll = () => {
    t.reload();
    usage.reload();
    payments.reload();
    subscription.reload();
  };

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      notify(done);
      reloadAll();
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  const setStatus = (status: TenantStatus) =>
    run("status", () => api.patch(`/api/v1/super-admin/tenants/${id}/status`, { status }), status === "active" ? "Organization reactivated." : "Organization suspended.");

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    const ok = await run(
      "edit",
      () =>
        api.patch(`/api/v1/super-admin/tenants/${id}`, {
          name: text("name"),
          contact_person: text("contact_person"),
          contact_email: text("contact_email"),
          contact_mobile: text("contact_mobile"),
          address: text("address"),
          logo_url: text("logo_url"),
        }),
      "Organization updated.",
    );
    if (ok) router.push(`${routeOf(12)}?id=${id}`);
  }

  async function assignPlan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(
      "plan",
      () => api.post(`/api/v1/super-admin/tenants/${id}/subscription`, { plan_id: Number(f.get("plan_id")), billing_cycle: String(f.get("billing_cycle")) }),
      "Plan assigned.",
    );
  }

  async function recordPayment(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const ok = await run(
      "payment",
      () =>
        api.post(`/api/v1/super-admin/tenants/${id}/payments`, {
          amount: String(f.get("amount")),
          mode: String(f.get("mode")),
          status: "success",
          reference: String(f.get("reference") ?? "").trim() || undefined,
        }),
      "Payment recorded.",
    );
    if (ok) form.reset();
  }

  const field = (labelText: string, control: JSX.Element, required = false) => (
    <label className="field">
      <span>
        {labelText}
        {required ? <span className="req">*</span> : null}
      </span>
      {control}
    </label>
  );

  return (
    <>
      <section className="panel profile-banner">
        <div className="profile-hero">
          <div className="row">
            <span className="avatar mint large">{initials(o.name)}</span>
            <div>
              <h2>{o.name}</h2>
              <p>{`${o.schools.length} ${o.schools.length === 1 ? "school" : "schools"} · ${planName}${sub ? " plan" : ""}`}</p>
              <div className="profile-meta">
                <span>
                  <Icon name="building" className="sm" />
                  {` ${o.code}`}
                </span>
                <span>
                  <Icon name="calendar" className="sm" />
                  {` Joined ${date(o.created_at)}`}
                </span>
                <Badge>{label(o.status)}</Badge>
              </div>
            </div>
          </div>
          <div className="profile-badge">
            <strong>{u ? num(u.active_users) : "…"}</strong>
            <small>Active users</small>
          </div>
        </div>
        <nav className="module-tabs profile-tabs">
          <Link href={`${routeOf(12)}?id=${id}`} className={editing ? "" : "active"}>
            Overview
          </Link>
          <Link href={`${routeOf(12)}?id=${id}&edit=1`} className={editing ? "active" : ""}>
            Edit details
          </Link>
          <Link href={routeOf(15)}>Usage & limits</Link>
          <Link href={routeOf(14)}>Billing</Link>
        </nav>
      </section>
      <ErrorNote>{error ?? usage.error ?? payments.error}</ErrorNote>
      <div className="two-col">
        <div className="stack">
          {editing ? (
            <form className="panel" onSubmit={saveEdit}>
              <div className="panel-head">
                <div>
                  <h2>Edit organization</h2>
                  <p>{`Code ${o.code} cannot be changed`}</p>
                </div>
              </div>
              <div className="panel-body">
                <div className="form-grid">
                  {field("Organization name", <input name="name" required minLength={2} maxLength={200} defaultValue={o.name} />, true)}
                  {field("Primary contact", <input name="contact_person" defaultValue={o.contact_person ?? ""} />)}
                  {field("Email address", <input type="email" name="contact_email" required maxLength={255} defaultValue={o.contact_email} />, true)}
                  {field("Mobile number", <input type="tel" name="contact_mobile" required maxLength={20} defaultValue={o.contact_mobile} />, true)}
                  {field("Address", <input name="address" defaultValue={o.address ?? ""} />)}
                  {field("Logo URL", <input type="url" name="logo_url" defaultValue={o.logo_url ?? ""} />)}
                </div>
              </div>
              <div className="form-footer">
                <span>Fields marked * are required</span>
                <div className="actions">
                  <Link href={`${routeOf(12)}?id=${id}`} className="btn">
                    Cancel
                  </Link>
                  <button type="submit" className="btn primary" disabled={busy === "edit"}>
                    <Icon name="check" className="sm" />
                    {busy === "edit" ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            </form>
          ) : null}
          <Panel title="Organization information">
            <Kv
              rows={[
                ["Organization", o.name],
                ["Plan", sub ? `${planName} · ${label(sub.billing_cycle)} · ${label(sub.status)}` : "No plan"],
                ["Primary contact", o.contact_person ?? "—"],
                ["Email address", o.contact_email],
                ["Schools", String(o.schools.length)],
                ["Renewal date", date(sub?.expires_at)],
              ]}
            />
          </Panel>
          <Panel title="Contact information">
            <Kv
              rows={[
                ["Email address", o.contact_email],
                ["Mobile number", o.contact_mobile],
                ["Address", o.address ?? "—"],
                ["Last updated", dateTime(o.updated_at)],
              ]}
            />
          </Panel>
          <Panel title="Schools" sub={`${o.schools.length} in this organization`}>
            {o.schools.length ? (
              o.schools.map((s, i) => (
                <div className="spread" key={s.id} style={{ padding: "8px 0", borderTop: i ? "1px solid var(--line)" : undefined }}>
                  <div className="person">
                    <span className={`avatar ${["mint", "", "peach", "lilac"][i % 4]}`}>{initials(s.name)}</span>
                    <div>
                      {s.name}
                      <small>{[s.code, s.timezone, s.currency].filter(Boolean).join(" · ")}</small>
                    </div>
                  </div>
                  <Badge>{label(s.status)}</Badge>
                </div>
              ))
            ) : (
              <p className="muted">No schools yet.</p>
            )}
          </Panel>
          <Panel title="Payments" sub={payments.data ? `${payments.data.total} recorded` : "Loading…"}>
            {payments.data?.items.length ? (
              payments.data.items.map((p) => (
                <div className="timeline-item" key={p.id}>
                  <span className="timeline-dot">
                    <Icon name="money" />
                  </span>
                  <div>
                    <h4>{`${money(p.amount)} · ${label(p.mode)}`}</h4>
                    <p>{`${label(p.status)}${p.reference ? ` · ${p.reference}` : ""}`}</p>
                  </div>
                  <time>{date(p.paid_at ?? p.created_at)}</time>
                </div>
              ))
            ) : (
              <p className="muted">{payments.loading ? "Loading…" : "No payments recorded."}</p>
            )}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="At a glance">
            <div className="progress-stack">
              <div className="progress-label">
                <span>Schools</span>
                <strong>{o.schools.length}</strong>
              </div>
              <div className="progress-label">
                <span>Students</span>
                <strong>{meter(u?.students)}</strong>
              </div>
              <div className="progress-label">
                <span>Staff</span>
                <strong>{meter(u?.staff)}</strong>
              </div>
              <div className="progress-label">
                <span>Parents</span>
                <strong>{num(u?.parents)}</strong>
              </div>
              <div className="progress-label">
                <span>Plan</span>
                <strong>{planName}</strong>
              </div>
            </div>
          </Panel>
          <Panel title="Status">
            <p className="muted" style={{ marginBottom: 12 }}>
              {o.status === "active" ? "Suspending stops everyone in this organization from signing in." : "Reactivating lets this organization sign in again."}
            </p>
            {o.status === "active" ? (
              <button type="button" className="btn" disabled={busy === "status"} onClick={() => setStatus("suspended")}>
                {busy === "status" ? "Saving…" : "Suspend organization"}
              </button>
            ) : (
              <button type="button" className="btn primary" disabled={busy === "status"} onClick={() => setStatus("active")}>
                {busy === "status" ? "Saving…" : "Reactivate organization"}
              </button>
            )}
          </Panel>
          <SignInDetailsPanel tenantId={id} />
          <Panel title="Subscription" sub={subscription.data ? `#${subscription.data.id} · assigned ${date(subscription.data.created_at)}` : undefined}>
            {subscription.data ? (
              <Kv
                rows={[
                  ["Plan", plans.data?.items.find((p) => p.id === subscription.data!.plan_id)?.name ?? `Plan #${subscription.data.plan_id}`],
                  ["Status", <Badge key="s">{label(subscription.data.status)}</Badge>],
                  ["Billing cycle", label(subscription.data.billing_cycle)],
                  ["Started", date(subscription.data.started_at)],
                  ["Expires", date(subscription.data.expires_at)],
                  ["Razorpay subscription", subscription.data.razorpay_subscription_id ?? "—"],
                  ["Notes", subscription.data.notes ?? "—"],
                ]}
              />
            ) : (
              <p className="muted">{subscription.loading ? "Loading…" : subscription.error && !/no subscription/i.test(subscription.error) ? subscription.error : "No subscription assigned yet."}</p>
            )}
          </Panel>
          <Panel title={sub ? "Change plan" : "Assign plan"}>
            <form className="stack" onSubmit={assignPlan}>
              {field(
                "Plan",
                <select name="plan_id" required defaultValue={sub?.plan_id ?? ""}>
                  <option value="">Select a plan…</option>
                  {plans.data?.items
                    .filter((p) => p.is_active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {`${p.name} · ${money(p.price_monthly)}/mo · ${money(p.price_yearly)}/yr`}
                      </option>
                    ))}
                </select>,
                true,
              )}
              {field(
                "Billing cycle",
                <select name="billing_cycle" defaultValue={sub?.billing_cycle ?? "monthly"}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>,
              )}
              <button type="submit" className="btn primary" disabled={busy === "plan"}>
                {busy === "plan" ? "Saving…" : "Assign plan"}
              </button>
            </form>
          </Panel>
          <Panel title="Record payment">
            <form className="stack" onSubmit={recordPayment}>
              {field("Amount (₹)", <input type="number" name="amount" required min={0.01} step="0.01" placeholder="Enter amount" />, true)}
              {field(
                "Mode",
                <select name="mode" defaultValue="manual">
                  <option value="manual">Manual</option>
                  <option value="razorpay">Razorpay</option>
                </select>,
              )}
              {field("Reference", <input name="reference" maxLength={120} placeholder="e.g. NEFT reference" />)}
              <button type="submit" className="btn primary" disabled={busy === "payment"}>
                {busy === "payment" ? "Saving…" : "Record payment"}
              </button>
            </form>
          </Panel>
        </aside>
      </div>
    </>
  );
}
