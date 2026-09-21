"use client";

import { useEffect, useMemo, useState } from "react";
import { IndianRupee, Layers, Package, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  WarnBox,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { FormFooter, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type Supplier = { id: number; name: string; is_active: boolean };
type Item = { id: number; name: string; sku: string; unit: string; on_hand: string };

type Line = { item_id: number | ""; qty: string; unit_cost: string };
type LineResult = { line: number; item: string; ok: boolean; detail?: string };

const blankLine = (): Line => ({ item_id: "", qty: "", unit_cost: "" });

/** A delivery arriving at the store, entered once rather than item by item.
 *
 *  The backend has no receipt header — every line becomes its own stock move.
 *  That is said on the page rather than hidden, because it decides what
 *  happens when one line fails: the rest are already in, and pretending the
 *  receipt was atomic would send somebody looking for a rollback that never
 *  happened.
 */
export default function GoodsReceiptPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [movedOn, setMovedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [results, setResults] = useState<LineResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Supplier[]>("/api/v1/school/inventory/suppliers")
      .then((r) => setSuppliers(r.data.filter((s) => s.is_active)))
      .catch((e) => setError(apiError(e)));
    api
      .get<Item[]>("/api/v1/school/inventory/items")
      .then((r) => setItems(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const set = (i: number, key: keyof Line, value: string) =>
    setLines((ls) =>
      ls.map((l, n) =>
        n === i ? { ...l, [key]: key === "item_id" ? (value ? Number(value) : "") : value } : l
      )
    );

  const filled = lines.filter((l) => l.item_id !== "" && Number(l.qty) > 0);
  const total = useMemo(
    () =>
      filled.reduce(
        (sum, l) => sum + Number(l.qty || 0) * Number(l.unit_cost || 0),
        0
      ),
    [filled]
  );

  const submit = async () => {
    setBusy(true);
    setError(null);
    setResults(null);
    const out: LineResult[] = [];
    for (const [i, l] of lines.entries()) {
      if (l.item_id === "" || !(Number(l.qty) > 0)) continue;
      const item = items.find((x) => x.id === l.item_id);
      try {
        await api.post("/api/v1/school/inventory/moves", {
          item_id: l.item_id,
          kind: "purchase",
          qty: l.qty,
          unit_cost: l.unit_cost === "" ? null : l.unit_cost,
          moved_on: movedOn || null,
          supplier_id: supplierId === "" ? null : supplierId,
          reference: reference || null,
        });
        out.push({ line: i + 1, item: item?.name ?? `Item ${l.item_id}`, ok: true });
      } catch (e) {
        out.push({
          line: i + 1,
          item: item?.name ?? `Item ${l.item_id}`,
          ok: false,
          detail: apiError(e),
        });
      }
    }
    setResults(out);
    if (out.every((r) => r.ok)) {
      setLines([blankLine()]);
      setReference("");
    }
    setBusy(false);
    // on-hand has moved for anything that went in
    api
      .get<Item[]>("/api/v1/school/inventory/items")
      .then((r) => setItems(r.data))
      .catch(() => undefined);
  };

  const failed = results?.filter((r) => !r.ok) ?? [];
  const wentIn = results?.filter((r) => r.ok) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Goods receipt"
        subtitle="Enter a whole delivery at once. Each line is recorded as its own stock movement."
      />
      <ErrorBox>{error}</ErrorBox>

      {results && failed.length === 0 && (
        <NoticeBox>
          {wentIn.length} line(s) received. Stock has gone up for each of them.
        </NoticeBox>
      )}
      {results && failed.length > 0 && (
        <WarnBox>
          {wentIn.length} line(s) went in and {failed.length} did not. The ones that
          succeeded are already in stock — there is no receipt to undo, so fix the failed
          lines below and enter just those again.
        </WarnBox>
      )}

      {results && failed.length > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Lines that failed</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">
                Nothing was written to stock for these. Enter just them again.
              </p>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            <Table head={["Line", "Item", "Why"]}>
              {failed.map((r) => (
                <tr key={r.line}>
                  <td className={td}>{r.line}</td>
                  <td className={tdStrong}>{r.item}</td>
                  <td className={td}>{r.detail}</td>
                </tr>
              ))}
            </Table>
          </CardBody>
          <PanelFooter
            left={`${failed.length} of ${results.length} line(s) failed`}
            right={`${wentIn.length} already in stock`}
          />
        </Card>
      )}

      <StatStrip
        stats={[
          {
            label: "Lines",
            value: filled.length,
            note: `of ${lines.length} entered`,
            icon: Layers,
          },
          {
            label: "Units",
            value: filled.reduce((n, l) => n + Number(l.qty || 0), 0),
            note: "Across every line with a quantity",
            icon: Package,
          },
          {
            label: "Receipt value",
            value: inr(total),
            note: "Quantity × unit cost, before any tax",
            icon: IndianRupee,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>The delivery</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Supplier"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Not recorded</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input
            label="Received on"
            type="date"
            value={movedOn}
            onChange={(e) => setMovedOn(e.target.value)}
          />
          <Input
            label="Invoice or reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="INV-2026-118"
          />
        </CardBody>
      </Card>

      {/* overflow-hidden so the tinted form footer keeps the panel's corners */}
      <Card className="overflow-hidden">
        <CardHeader>
          <div>
            <CardTitle>Lines</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              One row per item. A line with no quantity is ignored.
            </p>
          </div>
          <Button variant="secondary" onClick={() => setLines((l) => [...l, blankLine()])}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add a line
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          {lines.map((l, i) => {
            const item = items.find((x) => x.id === l.item_id);
            return (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1">
                  <Select
                    label="Item"
                    value={l.item_id}
                    onChange={(e) => set(i, "item_id", e.target.value)}
                  >
                    <option value="">Choose an item</option>
                    {items.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} ({x.sku})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-28">
                  <Input
                    label={item ? `Qty (${item.unit})` : "Quantity"}
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.qty}
                    onChange={(e) => set(i, "qty", e.target.value)}
                  />
                </div>
                <div className="w-32">
                  <Input
                    label="Unit cost"
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.unit_cost}
                    onChange={(e) => set(i, "unit_cost", e.target.value)}
                  />
                </div>
                <div className="w-28 pb-2 text-[13px] font-bold text-ink">
                  {inr(Number(l.qty || 0) * Number(l.unit_cost || 0))}
                </div>
                <Button
                  variant="secondary"
                  aria-label={`Remove line ${i + 1}`}
                  onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}
                  disabled={lines.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          {items.length === 0 && (
            <p className="text-[13px] text-ink-subtle">
              No items have been set up in the store yet.
            </p>
          )}
        </CardBody>
        <FormFooter note="Each line is saved separately, so a problem with one does not undo the others.">
          <Button onClick={submit} loading={busy} disabled={filled.length === 0}>
            Receive {filled.length || ""} line(s)
          </Button>
        </FormFooter>
      </Card>
    </div>
  );
}
