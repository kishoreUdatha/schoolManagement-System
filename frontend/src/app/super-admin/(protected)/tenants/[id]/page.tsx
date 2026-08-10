"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
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
    return <div className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>;
  }
  if (!tenant) {
    return <div className="text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{tenant.name}</h1>
            <Badge tone={statusTone[tenant.status]}>{tenant.status}</Badge>
          </div>
          <div className="mt-1 text-sm text-slate-500">
            Code: <code>{tenant.code}</code> · {tenant.contact_email} · {tenant.contact_mobile}
          </div>
        </div>
        <div className="flex gap-2">
          {tenant.status === "active" ? (
            <Button variant="secondary" onClick={() => setStatus("suspended")}>
              Suspend
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setStatus("active")}>
              Activate
            </Button>
          )}
        </div>
      </header>

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
              <div className="text-sm text-slate-500">
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
                <code className="text-xs text-slate-500">{s.code}</code>
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
          <CardTitle>Payments</CardTitle>
          <Button size="sm" onClick={() => setOpenPay(true)}>
            Record payment
          </Button>
        </CardHeader>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium">Mode</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-2 text-slate-500">
                  {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}
                </td>
                <td className="px-4 py-2 font-medium">
                  {p.currency} {Number(p.amount).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-2 text-slate-600">{p.mode}</td>
                <td className="px-4 py-2">
                  <Badge tone={p.status === "success" ? "emerald" : "amber"}>
                    {p.status}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-slate-600">{p.reference ?? "—"}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                  No payments recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="mt-1 text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

function QuotaBar({ label, q }: { label: string; q: Quota }) {
  const pct = Math.min(q.percent, 100);
  const tone =
    pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="text-xs text-slate-500">
          {q.used.toLocaleString()} / {q.limit.toLocaleString() || "∞"}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
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
          <span className="text-sm font-medium text-slate-700">Plan</span>
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
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
          <span className="text-sm font-medium text-slate-700">Billing cycle</span>
          <select
            value={cycle}
            onChange={(e) => setCycle(e.target.value as BillingCycle)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        {error && (
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
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
          <span className="text-sm font-medium text-slate-700">Mode</span>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as PaymentMode)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
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
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
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
