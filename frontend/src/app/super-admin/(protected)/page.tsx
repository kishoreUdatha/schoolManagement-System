"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { auth } from "@/lib/auth";

type Summary = {
  total_tenants: number;
  active_tenants: number;
  suspended_tenants: number;
  total_schools: number;
  total_students: number;
  total_staff: number;
  total_parents: number;
  sms_sent_30d: number;
  whatsapp_sent_30d: number;
  email_sent_30d: number;
  storage_used_mb: number;
  revenue_30d: number;
  pending_renewals: number;
};

type Renewal = {
  tenant_id: number;
  tenant_name: string;
  tenant_code: string;
  days_remaining: number | null;
  expires_at: string | null;
  contact_email: string;
};

export default function SuperAdminDashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [renewals, setRenewals] = useState<Renewal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function loadAll() {
    try {
      const [s, r] = await Promise.all([
        api.get<Summary>("/api/v1/super-admin/usage/summary"),
        api.get<Renewal[]>("/api/v1/super-admin/usage/renewals?within_days=30"),
      ]);
      setSummary(s.data);
      setRenewals(r.data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function sendRenewals() {
    if (
      !window.confirm(
        `Send renewal reminders to ${renewals.length} tenant(s) with subscriptions expiring in the next 30 days?`
      )
    )
      return;
    setSending(true);
    try {
      const { data } = await api.post<{
        tenants_notified: number;
      }>("/api/v1/super-admin/usage/renewals/send?within_days=30");
      setNotice(`Sent reminders to ${data.tenants_notified} tenant(s).`);
      loadAll();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSending(false);
    }
  }

  function downloadCsv() {
    const token = auth.getToken();
    const url = `${
      process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000"
    }/api/v1/super-admin/usage/export.csv`;
    // CSV endpoint requires Bearer, so fetch + blob download
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `tenant-usage-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((e) => setError(apiError(e)));
  }

  if (error) {
    return (
      <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
        {error}
      </div>
    );
  }
  if (!summary) {
    return <div className="text-sm text-ink-muted">Loading dashboard…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Platform overview</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Live counters across all tenants. Last 30 days for usage and revenue.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={downloadCsv}>
            Export usage CSV
          </Button>
          <Button
            onClick={sendRenewals}
            loading={sending}
            disabled={renewals.length === 0}
          >
            Send {renewals.length} renewal reminder(s)
          </Button>
        </div>
      </div>

      {notice && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total tenants" value={summary.total_tenants} />
        <StatCard
          label="Active"
          value={summary.active_tenants}
          accent="emerald"
          hint={`${summary.suspended_tenants} suspended`}
        />
        <StatCard
          label="Revenue (30d)"
          value={`₹${summary.revenue_30d.toLocaleString("en-IN")}`}
          accent="brand"
        />
        <StatCard
          label="Renewals due"
          value={summary.pending_renewals}
          accent={summary.pending_renewals > 0 ? "amber" : "emerald"}
          hint="next 14 days"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>People</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row label="Schools" value={summary.total_schools} />
            <Row label="Students" value={summary.total_students} />
            <Row label="Staff" value={summary.total_staff} />
            <Row label="Parents" value={summary.total_parents} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Messages sent (30d)</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row label="SMS" value={summary.sms_sent_30d} />
            <Row label="WhatsApp" value={summary.whatsapp_sent_30d} />
            <Row label="Email" value={summary.email_sent_30d} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storage</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 text-sm">
            <Row label="Used" value={`${summary.storage_used_mb.toLocaleString()} MB`} />
            <p className="pt-1 text-xs text-ink-subtle">
              Populated when S3 upload module is wired (currently stays at 0).
            </p>
          </CardBody>
        </Card>
      </div>

      {renewals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Renewals due (next 30 days)</CardTitle>
          </CardHeader>
          <table className="min-w-full divide-y divide-surface-border text-[13px]">
            <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
              <tr>
                <th className="px-4 py-3 font-bold">Tenant</th>
                <th className="px-4 py-3 font-bold">Code</th>
                <th className="px-4 py-3 font-bold">Days left</th>
                <th className="px-4 py-3 font-bold">Expires</th>
                <th className="px-4 py-3 font-bold">Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {renewals.map((r) => (
                <tr key={r.tenant_id}>
                  <td className="px-4 py-3 font-medium text-ink">{r.tenant_name}</td>
                  <td className="px-4 py-3 text-[12px] font-mono">{r.tenant_code}</td>
                  <td className="px-4 py-3 text-ink-muted">{r.days_remaining ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {r.expires_at ? new Date(r.expires_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{r.contact_email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between border-b border-surface-border py-1.5 last:border-0">
      <span className="text-[12px] font-bold text-ink-muted">{label}</span>
      <span className="font-medium text-ink">{value}</span>
    </div>
  );
}
