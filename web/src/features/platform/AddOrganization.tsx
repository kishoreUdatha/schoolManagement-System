"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText, type Paginated } from "@/lib/api";
import { money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { SentList, type Sent } from "./Messaging";
import type { Plan, SchoolRow, Tenant } from "./types";

type Created = {
  tenant: Tenant;
  school: SchoolRow;
  school_admin_user_id: number;
  school_admin_email: string;
  school_admin_temporary_password: string | null;
  credentials_sent: Sent[];
};

/**
 * SCR-011, live: POST /super-admin/tenants creates the organization, its
 * first school and the school admin; then, if a plan was picked,
 * POST /super-admin/tenants/{id}/subscription assigns it.
 */
export function AddOrganization() {
  const router = useRouter();
  const plans = useApi<Paginated<Plan>>("/api/v1/super-admin/plans");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [planNote, setPlanNote] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim() || null;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<Created>("/api/v1/super-admin/tenants", {
        name: text("name"),
        code: text("code"),
        address: text("address"),
        contact_person: text("contact_person"),
        contact_email: text("contact_email"),
        contact_mobile: text("contact_mobile"),
        school_admin_name: text("school_admin_name"),
        school_admin_email: text("school_admin_email"),
        school_admin_phone: text("school_admin_phone"),
      });
      const planId = text("plan_id");
      if (planId) {
        try {
          await api.post(`/api/v1/super-admin/tenants/${res.tenant.id}/subscription`, {
            plan_id: Number(planId),
            billing_cycle: text("billing_cycle") ?? "yearly",
          });
        } catch (err) {
          setPlanNote(`The organization was created, but the plan was not assigned: ${errorText(err)}`);
        }
      }
      if (res.school_admin_temporary_password || res.credentials_sent.length) {
        // The password is shown once and cannot be fetched again, and what was sent is worth seeing: stay here.
        setCreated(res);
      } else {
        notify("Organization created.");
        router.push(`${routeOf(12)}?id=${res.tenant.id}`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  if (created) {
    return (
      <section className="panel">
        <div className="panel-pad">
          <ErrorNote>{planNote}</ErrorNote>
          <div className="tip" role="status">
            <Icon name="check" className="sm" />
            <span>{`${created.tenant.name} was created, with ${created.school.name} as its first school.`}</span>
          </div>
          <p style={{ marginBottom: 12 }}>
            {created.credentials_sent.some((x) => x.status === "sent")
              ? "The sign-in details were sent to the school admin’s mobile. They are also shown here once; the password cannot be shown again."
              : "Share these sign-in details with the school admin. The password is not stored in plain text and cannot be shown again."}
          </p>
          <dl className="kv">
            <div>
              <dt>Admin email</dt>
              <dd>{created.school_admin_email}</dd>
            </div>
            <div>
              <dt>Temporary password</dt>
              <dd className="mono">{created.school_admin_temporary_password}</dd>
            </div>
          </dl>
          <h3 style={{ margin: "16px 0 8px", fontSize: 15 }}>Sent to their mobile</h3>
          <SentList sent={created.credentials_sent} />
          <div className="gap" />
          <Link href={`${routeOf(12)}?id=${created.tenant.id}`} className="btn primary">
            <Icon name="arrow" className="sm" />
            Open the organization
          </Link>
        </div>
      </section>
    );
  }

  const field = (labelText: string, control: JSX.Element, required = false, full = false) => (
    <label className={`field ${full ? "full" : ""}`}>
      <span>
        {labelText}
        {required ? <span className="req">*</span> : null}
      </span>
      {control}
    </label>
  );

  const activePlans = plans.data?.items.filter((p) => p.is_active) ?? [];

  return (
    <div className="two-col">
      <form id="org-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? planNote}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                {field("Organization name", <input type="text" name="name" required minLength={2} maxLength={200} placeholder="Enter organization name" />, true)}
                {field("Organization code", <input type="text" name="code" maxLength={40} placeholder="Leave blank to generate one" />)}
                {field("Primary contact", <input type="text" name="contact_person" placeholder="Enter primary contact" />)}
                {field("Email address", <input type="email" name="contact_email" required maxLength={255} placeholder="Enter email address" />, true)}
                {field("Mobile number", <input type="tel" name="contact_mobile" required maxLength={20} placeholder="+91…" />, true)}
                {field("Address", <input type="text" name="address" placeholder="Enter address" />)}
              </div>
            </section>
            <section>
              <div className="form-section-title">
                <span className="number">02</span>
                <h3>First school admin</h3>
              </div>
              <div className="form-grid">
                {field("Admin name", <input type="text" name="school_admin_name" required minLength={2} maxLength={160} placeholder="Enter admin name" />, true)}
                {field("Admin email", <input type="email" name="school_admin_email" required maxLength={255} placeholder="Enter admin email" />, true)}
                {field("Admin phone", <input type="tel" name="school_admin_phone" placeholder="Enter admin phone" />)}
              </div>
            </section>
            <section>
              <div className="form-section-title">
                <span className="number">03</span>
                <h3>Plan</h3>
              </div>
              <div className="form-grid">
                {field(
                  "Plan",
                  <select name="plan_id" defaultValue="">
                    <option value="">{plans.loading ? "Loading plans…" : "No plan yet"}</option>
                    {activePlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {`${p.name} · ${money(p.price_monthly)}/month`}
                      </option>
                    ))}
                  </select>,
                )}
                {field(
                  "Billing cycle",
                  <select name="billing_cycle" defaultValue="yearly">
                    <option value="yearly">Yearly</option>
                    <option value="monthly">Monthly</option>
                  </select>,
                )}
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
              {saving ? "Creating…" : "Create organization"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>What gets created</h3>
          <dl className="kv">
            <div>
              <dt>Organization</dt>
              <dd>Active, with the contact details above</dd>
            </div>
            <div>
              <dt>First school</dt>
              <dd>Named after the organization</dd>
            </div>
            <div>
              <dt>School admin</dt>
              <dd>Gets a generated password on WhatsApp and SMS (admin phone and mobile number), also shown to you once</dd>
            </div>
          </dl>
          <div className="gap" />
          <p>Limits (students, staff, storage, messages) come from the plan. Review the information, then create the organization.</p>
        </div>
      </aside>
    </div>
  );
}
