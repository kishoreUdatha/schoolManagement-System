"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Boxes, CalendarRange, Package } from "lucide-react";

import { BreakdownChart, ChartCard, ShareChart } from "@/components/charts/Charts";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Table,
  WarnBox,
  humanize,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { shortDate } from "@/lib/dates";

type Valuation = {
  stock_value: string;
  asset_value: string;
  items: number;
  assets: number;
  by_category: { label: string; items: number; value: string }[];
  assets_by_status: { label: string; count: number; value: string }[];
  low_stock: { item_id: number; name: string; sku: string | null; on_hand: string; reorder_level: string }[];
};
type Move = {
  id: number;
  item_name: string;
  kind: string;
  direction: number;
  qty: string;
  unit_cost: string | null;
  moved_on: string;
  supplier_name: string | null;
  reference: string | null;
  issued_to: string | null;
};

const compact = (v: number) =>
  v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`;

/** One height for every control in the filter row. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

/** What the store and the asset register are worth, and what moved.
 *
 *  The ledger endpoint takes a number of days rather than two dates, so the
 *  period is offered as the windows it actually supports instead of a date
 *  picker that would quietly round to one of them.
 */
export default function StockAssetReportsPage() {
  const [data, setData] = useState<Valuation | null>(null);
  const [moves, setMoves] = useState<Move[]>([]);
  const [days, setDays] = useState(90);
  const [kind, setKind] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Valuation>("/api/v1/school/analytics/inventory")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  useEffect(() => {
    api
      .get<Move[]>("/api/v1/school/inventory/moves", { params: { days } })
      .then((r) => setMoves(r.data))
      .catch((e) => setError(apiError(e)));
  }, [days]);

  const shown = kind ? moves.filter((m) => m.kind === kind) : moves;
  const kinds = [...new Set(moves.map((m) => m.kind))].sort();
  const inQty = shown.filter((m) => m.direction > 0).reduce((n, m) => n + Number(m.qty), 0);
  const outQty = shown.filter((m) => m.direction < 0).reduce((n, m) => n + Number(m.qty), 0);

  const categories = (data?.by_category ?? []).map((c) => ({
    label: c.label,
    value: Number(c.value),
  }));
  const statuses = (data?.assets_by_status ?? []).map((s) => ({
    label: humanize(s.label),
    count: s.count,
  }));

  const periodLabel = days === 365 ? "Last year" : days === 730 ? "Last two years" : `Last ${days} days`;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Stock and asset reports"
        subtitle="What the store holds, what the asset register is worth, and everything that moved in the period."
      />
      <ErrorBox>{error}</ErrorBox>

      {/* Period and kind both narrow the ledger, so they sit together above
          the figures rather than one in the header and one in a panel. */}
      <FilterBar>
        <select
          aria-label="Period"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className={filterSelect}
        >
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
          <option value={365}>Last year</option>
          <option value={730}>Last two years</option>
        </select>
        <select
          aria-label="Kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className={filterSelect}
        >
          <option value="">Every kind</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {humanize(k)}
            </option>
          ))}
        </select>
      </FilterBar>

      <StatStrip
        stats={[
          {
            label: "Stock value",
            value: data ? inr(data.stock_value) : "—",
            note: data ? `${data.items} item(s) tracked` : undefined,
            icon: Package,
          },
          {
            label: "Asset value",
            value: data ? inr(data.asset_value) : "—",
            note: data ? `${data.assets} asset(s) tracked` : undefined,
            icon: Boxes,
          },
          {
            label: "Movements in scope",
            value: shown.length,
            note: `${inQty} in · ${outQty} out`,
            icon: ArrowLeftRight,
          },
          {
            label: "Period",
            value: periodLabel,
            note: kind ? humanize(kind) : "Every kind",
            icon: CalendarRange,
          },
        ]}
      />

      {data && data.low_stock.length > 0 && (
        <WarnBox>
          {data.low_stock.length} item(s) are at or below their reorder level. They are
          listed at the bottom of this page.
        </WarnBox>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Stock value by category"
          subtitle="Priced at what the last purchase cost."
          empty={categories.length === 0 && "No stock has been received yet."}
          height={Math.max(240, categories.length * 34)}
        >
          <BreakdownChart
            data={categories}
            x="label"
            layout="vertical"
            series={[{ key: "value", name: "Value" }]}
            xFormatter={compact}
          />
        </ChartCard>

        <ChartCard
          title="Assets by state"
          subtitle="Where everything on the register currently is."
          empty={statuses.length === 0 && "No assets have been added yet."}
        >
          <ShareChart
            data={statuses}
            nameKey="label"
            valueKey="count"
            centreValue={String(data?.assets ?? 0)}
            centreLabel="assets"
          />
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Movements</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {periodLabel} · {kind ? humanize(kind) : "Every kind"} · {inQty} in, {outQty} out
              across {shown.length} movement(s).
            </p>
          </div>
        </CardHeader>
        <Table
          head={["Date", "Item", "Kind", "Qty", "Unit cost", "Supplier or issued to", "Reference"]}
          empty={shown.length === 0 && "Nothing moved in this period."}
        >
          {shown.map((m) => (
            <tr key={m.id}>
              <td className={td}>{shortDate(m.moved_on)}</td>
              <td className={tdStrong}>{m.item_name}</td>
              <td className={td}>
                <Badge tone={m.direction > 0 ? "emerald" : "amber"}>{humanize(m.kind)}</Badge>
              </td>
              <td className={td}>
                {m.direction > 0 ? "+" : "−"}
                {m.qty}
              </td>
              <td className={td}>{m.unit_cost ? inr(m.unit_cost) : "—"}</td>
              <td className={td}>{m.supplier_name || m.issued_to || "—"}</td>
              <td className={td}>{m.reference || "—"}</td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`Showing ${shown.length} of ${moves.length} movement(s)`}
          right={periodLabel}
        />
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>At or below reorder level</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Counted against the whole store, not the period above.
            </p>
          </div>
        </CardHeader>
        <Table
          head={["Item", "SKU", "On hand", "Reorder level"]}
          empty={(data?.low_stock.length ?? 0) === 0 && "Nothing needs reordering."}
        >
          {(data?.low_stock ?? []).map((l) => (
            <tr key={l.item_id}>
              <td className={tdStrong}>{l.name}</td>
              <td className={td}>{l.sku || "—"}</td>
              <td className={td}>
                <Badge tone={Number(l.on_hand) <= 0 ? "rose" : "amber"}>{l.on_hand}</Badge>
              </td>
              <td className={td}>{l.reorder_level}</td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`${data?.low_stock.length ?? 0} item(s) at or below reorder level`}
          right={data ? `${data.items} item(s) tracked` : undefined}
        />
      </Card>
    </div>
  );
}
