"use client";

import { useEffect, useState } from "react";

import { Boxes, IndianRupee, Package, Wrench } from "lucide-react";

import { BreakdownChart, ChartCard, ShareChart } from "@/components/charts/Charts";
import { ReportShell } from "@/components/reports/ReportShell";
import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Table, WarnBox, humanize, inr, td, tdStrong } from "@/components/ui/Field";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type InventoryValuation = {
  stock_value: string;
  asset_value: string;
  items: number;
  assets: number;
  by_category: { label: string; items: number; value: string }[];
  assets_by_status: { label: string; count: number; value: string }[];
  low_stock: {
    item_id: number;
    name: string;
    sku: string | null;
    on_hand: string;
    reorder_level: string;
  }[];
};

// Axis labels only; the tables and tiles carry the exact figures.
const compact = (v: number) =>
  v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`;

/** What the store and the asset register are worth.
 *
 *  Money arrives as decimal strings so nothing is rounded in transit; it is
 *  converted to a number only where a chart needs one to draw a bar.
 */
export default function InventoryValuationReportPage() {
  const [data, setData] = useState<InventoryValuation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<InventoryValuation>("/api/v1/school/analytics/inventory")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const categories = data?.by_category ?? [];
  const statuses = data?.assets_by_status ?? [];
  const low = data?.low_stock ?? [];
  const out = low.filter((l) => Number(l.on_hand) <= 0);

  return (
    <ReportShell
      title="Stock and assets"
      subtitle="What the store holds, what the asset register is worth, and which items need ordering."
      error={error}
    >
      {/* No filter bar: this report takes no scope of its own — it is the
          whole store and the whole register, so the strip restates what that
          amounts to rather than what was chosen. */}
      <StatStrip
        stats={[
          {
            label: "Items in scope",
            value: data?.items ?? "—",
            note: data ? `Across ${categories.length} categor${categories.length === 1 ? "y" : "ies"}` : undefined,
            icon: Package,
          },
          {
            label: "Stock value",
            value: data ? inr(data.stock_value) : "—",
            note: "What the store is holding",
            icon: IndianRupee,
          },
          {
            label: "Assets in scope",
            value: data?.assets ?? "—",
            note: data ? `${statuses.length} condition${statuses.length === 1 ? "" : "s"} recorded` : undefined,
            icon: Wrench,
          },
          {
            label: "Asset value",
            value: data ? inr(data.asset_value) : "—",
            note: "What the register is worth",
            icon: Boxes,
          },
        ]}
      />

      {low.length > 0 && (
        <WarnBox>
          {low.length} item{low.length === 1 ? " is" : "s are"} at or below the reorder level
          {out.length > 0 && `, and ${out.length} ${out.length === 1 ? "has" : "have"} run out altogether`}.
        </WarnBox>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Stock value by category"
          subtitle="What the store is holding, grouped the way it is shelved."
          height={Math.max(240, categories.length * 34 + 60)}
          empty={categories.length === 0 && "No stock has been received yet."}
        >
          <BreakdownChart
            data={categories.map((c) => ({ label: c.label, value: Number(c.value) }))}
            x="label"
            layout="vertical"
            series={[{ key: "value", name: "Value" }]}
            xFormatter={compact}
          />
        </ChartCard>

        <ChartCard
          title="Assets by condition"
          subtitle="Where the register says each item currently stands."
          empty={statuses.length === 0 && "No assets have been registered yet."}
        >
          <ShareChart
            data={statuses.map((s) => ({ status: humanize(s.label), count: s.count }))}
            nameKey="status"
            valueKey="count"
            centreValue={data ? String(data.assets) : undefined}
            centreLabel="assets"
          />
        </ChartCard>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Needs ordering</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Every tracked item at or below the reorder level it was given.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Item", "SKU", "On hand", "Reorder level", "State"]}
            empty={low.length === 0 && "Everything is above its reorder level."}
          >
            {low.map((l) => (
              <tr key={l.item_id}>
                <td className={tdStrong}>{l.name}</td>
                <td className={td}>{l.sku ?? "—"}</td>
                <td className={tdStrong}>{Number(l.on_hand)}</td>
                <td className={td}>{Number(l.reorder_level)}</td>
                <td className={td}>
                  {Number(l.on_hand) <= 0 ? (
                    <Badge tone="rose">Out of stock</Badge>
                  ) : (
                    <Badge tone="amber">Low</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`Showing ${low.length} of ${data?.items ?? 0} tracked items`}
          right={out.length > 0 ? `${out.length} out of stock` : "Nothing has run out"}
        />
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Value by category</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              The store grouped the way it is shelved.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Category", "Items", "Value"]}
            empty={categories.length === 0 && "No stock has been received yet."}
          >
            {categories.map((c) => (
              <tr key={c.label}>
                <td className={tdStrong}>{c.label}</td>
                <td className={td}>{c.items}</td>
                <td className={td}>{inr(c.value)}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${categories.length} categor${categories.length === 1 ? "y" : "ies"}`}
          right={data ? `${inr(data.stock_value)} of stock in total` : undefined}
        />
      </Card>
    </ReportShell>
  );
}
