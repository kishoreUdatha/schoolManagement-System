"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  WarnBox,
  humanize,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime } from "@/lib/dates";

type Row = {
  tenant_id: number;
  tenant_name: string;
  tenant_code: string;
  tenant_status: string;
  plan_name: string | null;
  billing_cycle: string | null;
  subscription_status: string | null;
  price: string | null;
  started_at: string | null;
  expires_at: string | null;
  days_to_expiry: number | null;
  expiring_soon: boolean;
  expired: boolean;
  total_paid: string;
  last_payment_at: string | null;
  last_payment_status: string | null;
};
type Billing = {
  tenants: Row[];
  total_tenants: number;
  on_a_plan: number;
  without_a_plan: number;
  expiring_soon: number;
  expired: number;
  revenue_30d: string;
  failed_payments_30d: number;
  billed_monthly: string;
  invoicing_modelled: boolean;
};

type Filter = "all" | "expiring" | "expired" | "no_plan";

export default function BillingPage() {
  const [data, setData] = useState<Billing | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Billing>("/api/v1/super-admin/billing")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const rows = (data?.tenants ?? []).filter((t) =>
    filter === "expiring"
      ? t.expiring_soon
      : filter === "expired"
        ? t.expired
        : filter === "no_plan"
          ? !t.plan_name
          : true
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        subtitle="What every school is on, what it costs and what they have paid."
        actions={
          <Select
            aria-label="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            <option value="all">Every school</option>
            <option value="expiring">Expiring within a month</option>
            <option value="expired">Already expired</option>
            <option value="no_plan">Not on a plan</option>
          </Select>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Taken in 30 days"
          value={data ? inr(data.revenue_30d) : "—"}
          accent="emerald"
        />
        <StatCard
          label="Billed monthly"
          value={data ? inr(data.billed_monthly) : "—"}
          hint={data ? `${data.on_a_plan} school(s) on a plan` : undefined}
        />
        <StatCard
          label="Expiring within a month"
          value={data?.expiring_soon ?? "—"}
          accent={data && data.expiring_soon ? "amber" : "emerald"}
        />
        <StatCard
          label="Expired"
          value={data?.expired ?? "—"}
          accent={data && data.expired ? "rose" : "emerald"}
          hint={data ? `${data.failed_payments_30d} failed payment(s) in 30 days` : undefined}
        />
      </div>

      {data && data.without_a_plan > 0 && (
        <WarnBox>
          {data.without_a_plan} school(s) are on no plan at all, so nothing is being
          billed and no quota applies to them.
        </WarnBox>
      )}

      {data && !data.invoicing_modelled && (
        <NoticeBox>
          There are no invoices in this system. What you are looking at is each
          school&apos;s subscription, the price of the plan it is on, and the payments
          recorded against it — there is no invoice number to reconcile against.
        </NoticeBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>School by school</CardTitle>
          <span className="text-[12px] font-bold text-ink-muted">
            {rows.length} of {data?.total_tenants ?? 0}
          </span>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["School", "Plan", "Price", "Renews", "Paid to date", "Last payment"]}
            empty={rows.length === 0 && "No schools match that filter."}
          >
            {rows.map((t) => (
              <tr key={t.tenant_id}>
                <td className={tdStrong}>
                  <Link
                    href={`/super-admin/tenants/${t.tenant_id}`}
                    className="hover:underline"
                  >
                    {t.tenant_name}
                  </Link>
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {t.tenant_code} · {humanize(t.tenant_status)}
                  </span>
                </td>
                <td className={td}>
                  {t.plan_name ? (
                    <>
                      {t.plan_name}
                      {t.subscription_status && (
                        <span className="block text-[11px] text-ink-subtle">
                          {humanize(t.subscription_status)}
                          {t.billing_cycle ? ` · ${humanize(t.billing_cycle)}` : ""}
                        </span>
                      )}
                    </>
                  ) : (
                    <Badge tone="amber">No plan</Badge>
                  )}
                </td>
                <td className={td}>{t.price ? inr(t.price) : "—"}</td>
                <td className={td}>
                  {!t.expires_at ? (
                    <span className="text-ink-subtle">Not set</span>
                  ) : t.expired ? (
                    <Badge tone="rose">Expired {dateTime(t.expires_at)}</Badge>
                  ) : t.expiring_soon ? (
                    <Badge tone="amber">
                      {t.days_to_expiry} day{t.days_to_expiry === 1 ? "" : "s"}
                    </Badge>
                  ) : (
                    dateTime(t.expires_at)
                  )}
                </td>
                <td className={td}>{inr(t.total_paid)}</td>
                <td className={td}>
                  {t.last_payment_at ? (
                    <>
                      {dateTime(t.last_payment_at)}
                      {t.last_payment_status && (
                        <span className="block text-[11px] text-ink-subtle">
                          {humanize(t.last_payment_status)}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-ink-subtle">Never</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
