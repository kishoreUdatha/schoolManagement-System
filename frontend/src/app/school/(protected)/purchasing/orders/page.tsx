"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardList, Plus, ReceiptText, Trash2, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  Textarea,
  humanize,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { daysLeft, readableDate, toIso } from "@/lib/dates";

type Supplier = { id: number; name: string; is_active: boolean };
type Line = {
  id: number;
  item_id: number | null;
  description: string;
  qty: string;
  unit_cost: string;
  line_total: string;
  received_qty: string;
  outstanding_qty: string;
};
type Order = {
  id: number;
  supplier_id: number;
  supplier_name: string | null;
  order_no: string;
  ordered_on: string;
  expected_on: string | null;
  status: string;
  notes: string | null;
  total: string;
  billed: string;
  unbilled: string;
  lines: Line[];
};
type Bill = {
  id: number;
  supplier_id: number;
  supplier_name: string | null;
  order_id: number | null;
  bill_no: string;
  billed_on: string;
  due_on: string | null;
  amount: string;
  tax_amount: string;
  total: string;
  paid: string;
  outstanding: string;
  status: string;
  overdue: boolean;
  notes: string | null;
};

type Draft = { description: string; qty: string; unit_cost: string };

const statusTone = (s: string): "emerald" | "amber" | "rose" | "neutral" =>
  s === "received" || s === "paid"
    ? "emerald"
    : s === "cancelled"
      ? "neutral"
      : s === "part_received" || s === "part_paid"
        ? "amber"
        : "neutral";

/** Ordered, billed, paid — three records because they happen at three times.
 *
 *  An order with no bill is money committed; a bill with no payment is money
 *  owed. Collapsing them into one row would lose the difference, which is
 *  the only thing an accountant wants from this screen.
 */
export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orderOpen, setOrderOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [payFor, setPayFor] = useState<Bill | null>(null);
  const [receiveFor, setReceiveFor] = useState<Order | null>(null);
  const [got, setGot] = useState<Record<number, string>>({});
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [order, setOrder] = useState({
    supplier_id: "",
    order_no: "",
    ordered_on: toIso(),
    expected_on: "",
    notes: "",
  });
  const [lines, setLines] = useState<Draft[]>([
    { description: "", qty: "", unit_cost: "" },
  ]);
  const [bill, setBill] = useState({
    supplier_id: "",
    order_id: "",
    bill_no: "",
    billed_on: toIso(),
    due_on: "",
    amount: "",
    tax_amount: "0",
  });
  const [pay, setPay] = useState({ amount: "", mode: "bank_transfer", reference: "" });

  const load = () => {
    api
      .get<Order[]>("/api/v1/school/finance/orders")
      .then((r) => setOrders(r.data))
      .catch((e) => setError(apiError(e)));
    api
      .get<Bill[]>("/api/v1/school/finance/bills")
      .then((r) => setBills(r.data))
      .catch(() => setBills([]));
  };

  useEffect(() => {
    load();
    api
      .get<Supplier[]>("/api/v1/school/inventory/suppliers")
      .then((r) => setSuppliers(r.data))
      .catch(() => setSuppliers([]));
  }, []);

  const lineTotal = lines.reduce(
    (n, l) => n + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0),
    0
  );

  const saveOrder = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/school/finance/orders", {
        supplier_id: Number(order.supplier_id),
        order_no: order.order_no,
        ordered_on: order.ordered_on,
        expected_on: order.expected_on || null,
        notes: order.notes || null,
        lines: lines
          .filter((l) => l.description.trim() && Number(l.qty) > 0)
          .map((l) => ({
            description: l.description,
            qty: l.qty,
            unit_cost: l.unit_cost || "0",
          })),
      });
      setOrderOpen(false);
      setLines([{ description: "", qty: "", unit_cost: "" }]);
      setOrder((o) => ({ ...o, order_no: "", notes: "" }));
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveBill = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/school/finance/bills", {
        supplier_id: Number(bill.supplier_id),
        order_id: bill.order_id ? Number(bill.order_id) : null,
        bill_no: bill.bill_no,
        billed_on: bill.billed_on,
        due_on: bill.due_on || null,
        amount: bill.amount,
        tax_amount: bill.tax_amount || "0",
      });
      setBillOpen(false);
      setBill((b) => ({ ...b, bill_no: "", amount: "", order_id: "" }));
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const savePayment = async () => {
    if (!payFor) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Bill>("/api/v1/school/finance/payments", {
        bill_id: payFor.id,
        amount: pay.amount,
        mode: pay.mode,
        reference: pay.reference || null,
      });
      setNote(
        `Paid ${inr(pay.amount)} against ${payFor.bill_no}. ${
          Number(r.data.outstanding) > 0
            ? `${inr(r.data.outstanding)} still outstanding.`
            : "Settled in full."
        }`
      );
      setPayFor(null);
      setPay({ amount: "", mode: "bank_transfer", reference: "" });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const saveReceipt = async () => {
    if (!receiveFor) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/finance/orders/${receiveFor.id}/receive`, {
        lines: receiveFor.lines.map((l) => ({
          line_id: l.id,
          received_qty: got[l.id] ?? l.received_qty,
        })),
      });
      setReceiveFor(null);
      setGot({});
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const openOrders = orders.filter(
    (o) => o.status !== "received" && o.status !== "cancelled"
  );
  const unpaid = bills.filter((b) => b.status !== "paid" && b.status !== "cancelled");
  const overdue = bills.filter((b) => b.overdue);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders, bills and payments"
        subtitle="What was ordered, what has been billed for it, and what has been paid."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setBillOpen(true)}>
              Record a bill
            </Button>
            <Button onClick={() => setOrderOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              New order
            </Button>
          </div>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {note && <NoticeBox>{note}</NoticeBox>}

      <StatStrip
        stats={[
          {
            label: "Orders open",
            value: openOrders.length,
            note: `of ${orders.length} raised`,
            icon: ClipboardList,
          },
          {
            label: "Bills unpaid",
            value: unpaid.length,
            note: `of ${bills.length} recorded`,
            icon: ReceiptText,
          },
          {
            label: "Owed",
            value: inr(unpaid.reduce((n, b) => n + Number(b.outstanding), 0)),
            note: "Outstanding on unpaid bills",
            icon: Wallet,
          },
          {
            label: "Overdue bills",
            value: overdue.length,
            note: overdue.length ? "Past their due date" : "Nothing is late",
            icon: AlertTriangle,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Purchase orders</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              What was committed to a supplier, and how much of it has been billed
              for.
            </p>
          </div>
          <Link
            href="/school/purchasing/vendors"
            className="text-[13px] font-bold text-brand-600 hover:underline"
          >
            Suppliers
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Order", "Supplier", "Ordered", "Expected", "Total", "Billed", "State", ""]}
            empty={orders.length === 0 && "No orders have been raised yet."}
          >
            {orders.map((o) => (
              <tr key={o.id}>
                <td className={tdStrong}>
                  {o.order_no}
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {o.lines.length} line(s)
                  </span>
                </td>
                <td className={td}>{o.supplier_name}</td>
                <td className={td}>{readableDate(o.ordered_on)}</td>
                <td className={td}>
                  {o.expected_on ? readableDate(o.expected_on) : "—"}
                </td>
                <td className={tdStrong}>{inr(o.total)}</td>
                <td className={td}>
                  {inr(o.billed)}
                  {Number(o.unbilled) > 0 && (
                    <span className="block text-[11px] text-ink-subtle">
                      {inr(o.unbilled)} unbilled
                    </span>
                  )}
                </td>
                <td className={td}>
                  <Badge tone={statusTone(o.status)}>{humanize(o.status)}</Badge>
                </td>
                <td className={td}>
                  {o.status !== "cancelled" && o.status !== "received" && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setReceiveFor(o);
                        setGot(
                          Object.fromEntries(o.lines.map((l) => [l.id, l.received_qty]))
                        );
                      }}
                    >
                      Receive
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${orders.length} order(s) · ${openOrders.length} still open`}
          right={
            orders.length
              ? `${inr(orders.reduce((n, o) => n + Number(o.total), 0))} ordered in total`
              : "Nothing ordered yet"
          }
        />
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Bills</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              What a supplier has asked for, what has been paid against it, and what
              is still owed.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Bill", "Supplier", "Billed", "Due", "Total", "Paid", "Outstanding", ""]}
            empty={bills.length === 0 && "No bills have been recorded yet."}
          >
            {bills.map((b) => {
              const left = b.due_on ? daysLeft(b.due_on) : null;
              return (
                <tr key={b.id}>
                  <td className={tdStrong}>
                    {b.bill_no}
                    <Badge tone={statusTone(b.status)} className="ml-2">
                      {humanize(b.status)}
                    </Badge>
                  </td>
                  <td className={td}>{b.supplier_name}</td>
                  <td className={td}>{readableDate(b.billed_on)}</td>
                  <td className={td}>
                    {b.due_on ? (
                      <>
                        {readableDate(b.due_on)}
                        {left !== null && left < 0 && (
                          <Badge tone="rose" className="ml-2">
                            {Math.abs(left)}d late
                          </Badge>
                        )}
                        {left !== null && left >= 0 && left <= 7 && (
                          <Badge tone="amber" className="ml-2">
                            {left}d
                          </Badge>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={td}>{inr(b.total)}</td>
                  <td className={td}>{inr(b.paid)}</td>
                  <td className={tdStrong}>
                    {Number(b.outstanding) > 0 ? inr(b.outstanding) : "—"}
                  </td>
                  <td className={td}>
                    {b.status !== "paid" && b.status !== "cancelled" && (
                      <Button variant="secondary" onClick={() => setPayFor(b)}>
                        Pay
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${bills.length} bill(s) · ${unpaid.length} unpaid`}
          right={overdue.length ? `${overdue.length} past their due date` : "None overdue"}
        />
      </Card>

      {/* ---- new order ---- */}
      <Modal open={orderOpen} onClose={() => setOrderOpen(false)} title="New purchase order" size="lg">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Select
              label="Supplier"
              value={order.supplier_id}
              onChange={(e) => setOrder({ ...order, supplier_id: e.target.value })}
            >
              <option value="">Choose…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Input
              label="Order number"
              value={order.order_no}
              onChange={(e) => setOrder({ ...order, order_no: e.target.value })}
            />
            <Input
              label="Ordered on"
              type="date"
              value={order.ordered_on}
              onChange={(e) => setOrder({ ...order, ordered_on: e.target.value })}
            />
            <Input
              label="Expected"
              type="date"
              value={order.expected_on}
              onChange={(e) => setOrder({ ...order, expected_on: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <Input
                  label={i === 0 ? "What" : undefined}
                  className="min-w-[200px] flex-1"
                  value={l.description}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((x, n) => (n === i ? { ...x, description: e.target.value } : x))
                    )
                  }
                />
                <Input
                  label={i === 0 ? "Qty" : undefined}
                  type="number"
                  className="w-24"
                  value={l.qty}
                  onChange={(e) =>
                    setLines((ls) => ls.map((x, n) => (n === i ? { ...x, qty: e.target.value } : x)))
                  }
                />
                <Input
                  label={i === 0 ? "Unit cost" : undefined}
                  type="number"
                  className="w-32"
                  value={l.unit_cost}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((x, n) => (n === i ? { ...x, unit_cost: e.target.value } : x))
                    )
                  }
                />
                <Button
                  variant="secondary"
                  aria-label="Remove line"
                  onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={() =>
                setLines((ls) => [...ls, { description: "", qty: "", unit_cost: "" }])
              }
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Another line
            </Button>
          </div>

          <Textarea
            label="Notes"
            value={order.notes}
            onChange={(e) => setOrder({ ...order, notes: e.target.value })}
          />

          <div className="flex items-center justify-between">
            <span className="text-[13px] font-bold text-ink">
              Order total {inr(lineTotal)}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setOrderOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={saveOrder}
                loading={busy}
                disabled={!order.supplier_id || !order.order_no.trim() || lineTotal <= 0}
              >
                Raise order
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ---- new bill ---- */}
      <Modal open={billOpen} onClose={() => setBillOpen(false)} title="Record a supplier bill">
        <div className="space-y-4">
          <Select
            label="Supplier"
            value={bill.supplier_id}
            onChange={(e) => setBill({ ...bill, supplier_id: e.target.value, order_id: "" })}
          >
            <option value="">Choose…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select
            label="Against an order (optional)"
            value={bill.order_id}
            onChange={(e) => setBill({ ...bill, order_id: e.target.value })}
          >
            <option value="">No order</option>
            {orders
              .filter((o) => String(o.supplier_id) === bill.supplier_id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_no} · {inr(o.total)}
                </option>
              ))}
          </Select>
          <Input
            label="Bill number"
            value={bill.bill_no}
            onChange={(e) => setBill({ ...bill, bill_no: e.target.value })}
          />
          <div className="flex gap-3">
            <Input
              label="Billed on"
              type="date"
              value={bill.billed_on}
              onChange={(e) => setBill({ ...bill, billed_on: e.target.value })}
            />
            <Input
              label="Due"
              type="date"
              value={bill.due_on}
              onChange={(e) => setBill({ ...bill, due_on: e.target.value })}
            />
          </div>
          <div className="flex gap-3">
            <Input
              label="Amount"
              type="number"
              value={bill.amount}
              onChange={(e) => setBill({ ...bill, amount: e.target.value })}
            />
            <Input
              label="Tax"
              type="number"
              value={bill.tax_amount}
              onChange={(e) => setBill({ ...bill, tax_amount: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBillOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveBill}
              loading={busy}
              disabled={!bill.supplier_id || !bill.bill_no.trim() || !bill.amount}
            >
              Record
            </Button>
          </div>
        </div>
      </Modal>

      {/* ---- pay ---- */}
      <Modal
        open={payFor !== null}
        onClose={() => setPayFor(null)}
        title={payFor ? `Pay ${payFor.bill_no}` : ""}
      >
        {payFor && (
          <div className="space-y-4">
            <p className="text-[13px] text-ink-muted">
              {inr(payFor.outstanding)} outstanding on a bill of {inr(payFor.total)}.
            </p>
            <Input
              label="Amount"
              type="number"
              value={pay.amount}
              hint="A payment cannot be more than the bill is for."
              onChange={(e) => setPay({ ...pay, amount: e.target.value })}
            />
            <Select
              label="Mode"
              value={pay.mode}
              onChange={(e) => setPay({ ...pay, mode: e.target.value })}
            >
              {["bank_transfer", "cash", "upi", "cheque", "card", "online", "other"].map((m) => (
                <option key={m} value={m}>
                  {humanize(m)}
                </option>
              ))}
            </Select>
            <Input
              label="Reference"
              value={pay.reference}
              onChange={(e) => setPay({ ...pay, reference: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPayFor(null)}>
                Cancel
              </Button>
              <Button onClick={savePayment} loading={busy} disabled={!pay.amount}>
                Pay
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- receive ---- */}
      <Modal
        open={receiveFor !== null}
        onClose={() => setReceiveFor(null)}
        title={receiveFor ? `What arrived against ${receiveFor.order_no}?` : ""}
      >
        {receiveFor && (
          <div className="space-y-4">
            {receiveFor.lines.map((l) => (
              <div key={l.id} className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-ink">{l.description}</div>
                  <div className="text-[11px] text-ink-subtle">
                    ordered {l.qty} · already in {l.received_qty}
                  </div>
                </div>
                <Input
                  type="number"
                  className="w-28"
                  aria-label={`Received ${l.description}`}
                  value={got[l.id] ?? l.received_qty}
                  onChange={(e) => setGot({ ...got, [l.id]: e.target.value })}
                />
              </div>
            ))}
            <p className="text-[12px] text-ink-subtle">
              More cannot arrive than was ordered — raise a second order rather
              than overstating this one.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setReceiveFor(null)}>
                Cancel
              </Button>
              <Button onClick={saveReceipt} loading={busy}>
                Save
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
