"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  Banknote,
  Calculator,
  CreditCard,
  HandCoins,
  IndianRupee,
  Package,
  ReceiptText,
  Wallet,
} from "lucide-react";

import { ChartCard, TrendChart } from "@/components/charts/Charts";
import { Card } from "@/components/ui/Card";
import { ErrorBox, PageHeader, inr } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Dashboard = {
  collected_today: string;
  receipts_today: number;
  collected_this_month: string;
  outstanding: string;
  overdue: string;
  families_owing: number;
  by_month: { month: string; amount: string }[];
};

const LINKS = [
  { href: "/accountant/fees", label: "Fees", blurb: "Structures, what is due and taking payment", icon: IndianRupee },
  { href: "/accountant/online-payments", label: "Online payments", blurb: "What arrived through the gateway", icon: CreditCard },
  { href: "/accountant/late-refunds", label: "Late fees & refunds", blurb: "Charges added and money sent back", icon: HandCoins },
  { href: "/accountant/accounts", label: "Accounts", blurb: "Cash book and ledgers", icon: Calculator },
  { href: "/accountant/payroll", label: "Payroll", blurb: "Runs, payslips and the bank file", icon: Banknote },
  { href: "/accountant/inventory", label: "Inventory & store", blurb: "Stock, purchases and assets", icon: Package },
  { href: "/accountant/payslips", label: "My payslips", blurb: "Your own pay", icon: ReceiptText },
];

const receipts = (n: number) => (n === 1 ? "1 receipt" : `${n} receipts`);
const owing = (n: number) => (n === 1 ? "1 family owing" : `${n} families owing`);

/** Money in lakhs and thousands. A rupee figure printed in full makes an axis
 *  unreadable, but rounding a small total to "0k" is a lie — so small sums
 *  stay as they are. */
const compact = (v: number) =>
  v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`;

export default function AccountantHomePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Dashboard>("/api/v1/accountant/dashboard")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const months = (data?.by_month ?? []).map((m) => ({
    month: m.month,
    amount: Number(m.amount),
  }));
  const overdue = Number(data?.overdue ?? 0);
  const nothingCollected = months.length === 0 || months.every((m) => m.amount === 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Money"
        subtitle="What came in today and this month, against what is still owed."
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Collected today"
          value={data ? inr(data.collected_today) : "—"}
          hint={data ? receipts(data.receipts_today) : undefined}
          accent="emerald"
          icon={IndianRupee}
        />
        <StatCard
          label="Collected this month"
          value={data ? inr(data.collected_this_month) : "—"}
          icon={Calculator}
        />
        <StatCard
          label="Outstanding"
          value={data ? inr(data.outstanding) : "—"}
          accent="amber"
          icon={Wallet}
        />
        <StatCard
          label="Overdue"
          value={data ? inr(data.overdue) : "—"}
          hint={data ? owing(data.families_owing) : undefined}
          accent={overdue > 0 ? "rose" : "emerald"}
          icon={AlertCircle}
        />
      </div>

      <ChartCard
        title="Collections"
        subtitle="Dated by the day the money was taken, not the day it fell due."
        empty={
          data === null
            ? "Fetching the last six months…"
            : nothingCollected && "No fees have been collected yet."
        }
      >
        <TrendChart
          data={months}
          x="month"
          series={[{ key: "amount", name: "Collected" }]}
          yFormatter={compact}
        />
      </ChartCard>

      <div className="space-y-3">
        <h2 className="text-[13px] font-extrabold uppercase tracking-[0.6px] text-ink-muted">
          Where the work is
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href}>
              <Card className="h-full p-4 transition-colors hover:border-brand-300 hover:bg-surface-hover">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-brand-50 text-brand-600"
                    aria-hidden="true"
                  >
                    <l.icon className="h-[18px] w-[18px]" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[15px] font-extrabold text-ink">{l.label}</div>
                    <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{l.blurb}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
