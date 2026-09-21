"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type TenantStatus = "active" | "suspended" | "deleted";
type BillingCycle = "monthly" | "yearly";
type SubStatus = "pending" | "active" | "expired" | "cancelled";
type PaymentMode = "razorpay" | "manual";
type PaymentStatus = "pending" | "success" | "failed" | "refunded";

type School = { id: number; name: string; code: string; status: string };
type Subscription = {
  id: number;
  plan_id: number;
  billing_cycle: BillingCycle;
  status: SubStatus;
  started_at: string | null;
  expires_at: string | null;
};
type TenantDetail = {
  id: number;
  name: string;
  code: string;
  contact_email: string;
  contact_mobile: string;
  contact_person: string | null;
  status: TenantStatus;
  is_active: boolean;
  created_at: string;
  schools: School[];
  current_subscription: Subscription | null;
};
type Quota = { used: number; limit: number; percent: number };
type Usage = {
  students: Quota;
  staff: Quota;
  parents: number;
  active_users: number;
  storage_mb: Quota;
  sms_sent: Quota;
  whatsapp_sent: Quota;
  email_sent: Quota;
  payment_status: string | null;
  subscription_expires_at: string | null;
};
type Plan = {
  id: number;
  name: string;
  tier: string;
  price_monthly: string;
  price_yearly: string;
};
type Payment = {
  id: number;
  amount: string;
  currency: string;
  mode: PaymentMode;
  status: PaymentStatus;
  paid_at: string | null;
  reference: string | null;
  created_at: string;
};

const statusTone = { active: "emerald", suspended: "amber", deleted: "rose" } as const;

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openSub, setOpenSub] = useState(false);
  const [openPay, setOpenPay] = useState(false);

  async function loadAll() {
    setError(null);
    try {
      const [t, u, p, pl] = await Promise.all([
        api.get<TenantDetail>(`/api/v1/super-admin/tenants/${id}`),
        api.get<Usage>(`/api/v1/super-admin/tenants/${id}/usage`),
        api.get<{ items: Payment[] }>(`/api/v1/super-admin/tenants/${id}/payments`),
        api.get<{ items: Plan[] }>(`/api/v1/super-admin/plans`),
      ]);
      setTenant(t.data);
      setUsage(u.data);
      setPayments(p.data.items);
      setPlans(pl.data.items);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function setStatus(newStatus: TenantStatus) {
    try {
      await api.patch(`/api/v1/super-admin/tenants/${id}/status`, { status: newStatus });
      loadAll();
    } catch (e) {
      setError(apiError(e));
    }
  }

  if (error) {
    return <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>;
  }
  if (!tenant) {
    return <div className="text-sm text-ink-muted">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      {/* The status badge moves in beside the button that changes it, which is
          where somebody looking at it is about to act. */}
      <PageHeader
        title={tenant.name}
        subtitle={`Code ${tenant.code} · ${tenant.contact_email} · ${tenant.contact_mobile}`}
        actions={
          <>
            <Badge tone={statusTone[tenant.status]}>{tenant.status}</Badge>
            {tenant.status === "active" ? (
              <Button variant="secondary" onClick={() => setStatus("suspended")}>
                Suspend
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setStatus("active")}>
                Activate
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
            <Button size="sm" onClick={() => setOpenSub(true)}>
              Assign plan
            </Button>
          </CardHeader>
          <CardBody>
            {tenant.current_subscription ? (
              <div className="grid gap-4 sm:grid-cols-2 text-sm">
                <KV label="Plan" value={`#${tenant.current_subscription.plan_id}`} />
                <KV label="Cycle" value={tenant.current_subscription.billing_cycle} />
                <KV
                  label="Status"
                  value={<Badge tone="brand">{tenant.current_subscription.status}</Badge>}
                />
                <KV
                  label="Expires"
                  value={
                    tenant.current_subscription.expires_at
                      ? new Date(tenant.current_subscription.expires_at).toLocaleDateString()
                      : "—"
                  }
                />
              </div>
            ) : (
              <div className="text-sm text-ink-muted">
                No subscription assigned yet. Click <strong>Assign plan</strong>.
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schools</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            {tenant.schools.map((s) => (
              <div key={s.id} className="flex items-center justify-between">
                <span>{s.name}</span>
                <code className="text-xs text-ink-muted">{s.code}</code>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {usage && (
        <Card>
          <CardHeader>
            <CardTitle>Usage vs quota</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <QuotaBar label="Students" q={usage.students} />
            <QuotaBar label="Staff" q={usage.staff} />
            <QuotaBar label="Storage (MB)" q={usage.storage_mb} />
            <QuotaBar label="SMS (30d)" q={usage.sms_sent} />
            <QuotaBar label="WhatsApp (30d)" q={usage.whatsapp_sent} />
            <QuotaBar label="Email (30d)" q={usage.email_sent} />
            <KV label="Parents" value={usage.parents} />
            <KV label="Active users" value={usage.active_users} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Payments</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Everything taken against this tenant, online and offline.
            </p>
          </div>
          <Button size="sm" onClick={() => setOpenPay(true)}>
            Record payment
          </Button>
        </CardHeader>
        <table className="min-w-full divide-y divide-surface-border text-[13px]">
          <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-bold">Date</th>
              <th className="px-4 py-3 font-bold">Amount</th>
              <th className="px-4 py-3 font-bold">Mode</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 text-ink-muted">
                  {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-3 font-medium">
                  {p.currency} {Number(p.amount).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 text-ink-muted">{p.mode}</td>
                <td className="px-4 py-3">
                  <Badge tone={p.status === "success" ? "emerald" : "amber"}>
                    {p.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-ink-muted">{p.reference ?? "—"}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-muted">
                  No payments recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <PanelFooter
          left={`Showing ${payments.length} payment${payments.length === 1 ? "" : "s"}`}
          right={
            tenant.current_subscription
              ? `Subscription ${tenant.current_subscription.status}`
              : "No subscription assigned"
          }
        />
      </Card>

      <AssignPlanModal
        open={openSub}
        onClose={() => setOpenSub(false)}
        tenantId={id}
        plans={plans}
        onDone={() => {
          setOpenSub(false);
          loadAll();
        }}
      />
      <RecordPaymentModal
        open={openPay}
        onClose={() => setOpenPay(false)}
        tenantId={id}
        onDone={() => {
          setOpenPay(false);
          loadAll();
        }}
      />
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">{label}</span>
      <span className="mt-1 text-sm font-medium text-ink">{value}</span>
    </div>
  );
}

function QuotaBar({ label, q }: { label: string; q: Quota }) {
  const pct = Math.min(q.percent, 100);
  const tone =
    pct >= 90 ? "bg-danger" : pct >= 70 ? "bg-warning" : "bg-success";
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-[12px] font-bold text-ink-muted">{label}</span>
        <span className="text-xs text-ink-muted">
          {q.used.toLocaleString()} / {q.limit.toLocaleString() || "∞"}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-hover">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AssignPlanModal({
  open,
  onClose,
  tenantId,
  plans,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  plans: Plan[];
  onDone: () => void;
}) {
  const [planId, setPlanId] = useState<number | "">("");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!planId) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/v1/super-admin/tenants/${tenantId}/subscription`, {
        plan_id: planId,
        billing_cycle: cycle,
      });
      onDone();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Assign plan">
      <form onSubmit={submit} className="space-y-4">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Plan</span>
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : "")}
            className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            required
          >
            <option value="">Select a plan…</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — ₹{p.price_monthly}/mo, ₹{p.price_yearly}/yr
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Billing cycle</span>
          <select
            value={cycle}
            onChange={(e) => setCycle(e.target.value as BillingCycle)}
            className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Assign
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RecordPaymentModal({
  open,
  onClose,
  tenantId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [mode, setMode] = useState<PaymentMode>("manual");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/v1/super-admin/tenants/${tenantId}/payments`, {
        amount,
        mode,
        status: "success",
        reference: reference || undefined,
      });
      onDone();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Record payment">
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Amount (INR)"
          name="amount"
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Mode</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as PaymentMode)}
            className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="manual">Manual (offline)</option>
            <option value="razorpay">Razorpay</option>
          </select>
        </label>
        <Input
          label="Reference (NEFT no, cheque no, UPI ref…)"
          name="reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Record
          </Button>
        </div>
      </form>
    </Modal>
  );
}
