"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, isoToday, MODES } from "./common";
import type { Bill, Payables, PurchaseOrder, Supplier } from "./types";

/**
 * SCR-169, live. Pay a supplier's bill: suppliers from
 * /school/inventory/suppliers, their unpaid bills from
 * /school/finance/bills?supplier_id=&unpaid_only=true, the order a bill came
 * from via /finance/orders, and POST /school/finance/payments. The server
 * refuses a payment larger than what is outstanding on the bill. The figures
 * on top are GET /school/finance/payables (as on the vendor screen).
 */
export function PurchasePayment() {
  const suppliers = useApi<Supplier[]>("/api/v1/school/inventory/suppliers");
  const payables = useApi<Payables>("/api/v1/school/finance/payables");
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [billId, setBillId] = useState<number | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("bank_transfer");
  const [paidOn, setPaidOn] = useState(isoToday());
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bills = useApi<Bill[]>(supplierId ? "/api/v1/school/finance/bills" : null, { supplier_id: supplierId, unpaid_only: true });
  const orders = useApi<PurchaseOrder[]>(supplierId ? "/api/v1/school/finance/orders" : null, { supplier_id: supplierId });
  const bill = bills.data?.find((b) => b.id === billId) ?? null;
  const order = bill?.order_id ? orders.data?.find((o) => o.id === bill.order_id) : null;
  const supplier = suppliers.data?.find((s) => s.id === supplierId);

  useEffect(() => {
    const list = bills.data ?? [];
    if (!list.length) setBillId(null);
    else if (!list.some((b) => b.id === billId)) setBillId(list[0].id);
  }, [bills.data, billId]);
  useEffect(() => {
    if (bill) setAmount(String(Number(bill.outstanding)));
  }, [bill]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!bill) {
      setError("Choose a vendor with an unpaid bill.");
      return;
    }
    if (Number(amount) > Number(bill.outstanding)) {
      setError(`That is more than the ${money(bill.outstanding)} outstanding on bill ${bill.bill_no}.`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<Bill>("/api/v1/school/finance/payments", { bill_id: bill.id, amount, paid_on: paidOn || null, mode, reference: reference.trim() || null });
      notify(`Paid ${money(amount)} against ${bill.bill_no}. ${Number(r.outstanding) > 0 ? `${money(r.outstanding)} still outstanding.` : "Settled in full."}`);
      setReference("");
      bills.reload();
      payables.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const unpaid = bills.data ?? [];
  const pd = payables.data;
  const n = (v: number) => (pd ? v.toLocaleString("en-IN") : "…");
  const stats = [
    { label: "Owed", value: pd ? money(pd.total_outstanding) : "…", note: "To all vendors" },
    { label: "Overdue", value: pd ? money(pd.total_overdue) : "…", note: "Past the bill's due date" },
    { label: "Vendors owed", value: n(pd?.suppliers_owed ?? 0), note: "With money outstanding" },
    { label: "Unpaid bills", value: n((pd?.suppliers ?? []).reduce((s, p) => s + p.unpaid_bills, 0)), note: "Awaiting payment" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="two-col">
        <div className="stack">
          <Panel title="Purchase summary">
            <dl className="kv">
              <div>
                <dt>Supplier</dt>
                <dd>{supplier?.name ?? "—"}</dd>
              </div>
              <div>
                <dt>Purchase order</dt>
                <dd>{order ? `${order.order_no} · ${date(order.ordered_on)}` : bill ? "Not from an order" : "—"}</dd>
              </div>
              <div>
                <dt>Bill total</dt>
                <dd>{bill ? `${money(bill.total)} (${money(bill.amount)} + ${money(bill.tax_amount)} tax)` : "—"}</dd>
              </div>
              <div>
                <dt>Already paid</dt>
                <dd>{bill ? money(bill.paid) : "—"}</dd>
              </div>
            </dl>
          </Panel>
          <form id="purchase-payment-form" className="panel" onSubmit={submit}>
            <div className="panel-head">
              <h2>Payment details</h2>
            </div>
            <div className="panel-body">
              <ErrorNote>{error ?? suppliers.error ?? bills.error}</ErrorNote>
              <div className="form-grid">
                <Field label="Vendor" required>
                  <select value={supplierId ?? ""} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : null)} required>
                    <option value="">{suppliers.loading ? "Loading…" : "Select vendor"}</option>
                    {suppliers.data?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Invoice" required>
                  <select value={billId ?? ""} onChange={(e) => setBillId(Number(e.target.value))} required disabled={!unpaid.length}>
                    {!unpaid.length ? <option value="">{supplierId ? (bills.loading ? "Loading…" : "No unpaid bills") : "Choose a vendor first"}</option> : null}
                    {unpaid.map((b) => (
                      <option key={b.id} value={b.id}>
                        {`${b.bill_no} · ${money(b.outstanding)} outstanding${b.due_on ? ` · due ${date(b.due_on)}` : ""}`}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Amount (₹)" required>
                  <input type="number" min={0.01} step="0.01" max={bill ? Number(bill.outstanding) : undefined} value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </Field>
                <Field label="Payment method">
                  <select value={mode} onChange={(e) => setMode(e.target.value)}>
                    {MODES.filter(([k]) => k !== "online").map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Payment date">
                  <input type="date" value={paidOn} max={isoToday()} onChange={(e) => setPaidOn(e.target.value)} />
                </Field>
                <Field label="Reference">
                  <input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} placeholder="Transfer / cheque number" />
                </Field>
              </div>
            </div>
            <div className="form-footer">
              <span>Amounts in INR</span>
              <button type="submit" className="btn primary" disabled={saving || !bill}>
                <Icon name="check" className="sm" />
                {saving ? "Saving…" : "Create payment"}
              </button>
            </div>
          </form>
        </div>
        <aside className="stack">
          <div className="payment-summary">
            <h3>Amount to pay</h3>
            <div className="checkout-total">{bill ? money(Number(amount) || 0) : "—"}</div>
            <p className="stat-note">{bill ? `Bill ${bill.bill_no}` : "Choose a bill"}</p>
            <div className="gap" />
            <dl className="kv">
              <div>
                <dt>Supplier</dt>
                <dd>{supplier?.name ?? "—"}</dd>
              </div>
              <div>
                <dt>Billed on</dt>
                <dd>{bill ? date(bill.billed_on) : "—"}</dd>
              </div>
              <div>
                <dt>Due date</dt>
                <dd>{bill?.due_on ? date(bill.due_on) : "—"}</dd>
              </div>
            </dl>
          </div>
          <Panel title="Unpaid bills">
            {unpaid.map((b) => (
              <div className="event-row" key={b.id}>
                <div className="event-content">
                  <h4>{b.bill_no}</h4>
                  <p>{`${date(b.billed_on)}${b.due_on ? ` · due ${date(b.due_on)}` : ""}`}</p>
                </div>
                <strong className="small">{money(b.outstanding)}</strong>
              </div>
            ))}
            {!unpaid.length ? <p className="muted small">{supplierId ? (bills.loading ? "Loading…" : "Nothing owed to this vendor.") : "Choose a vendor."}</p> : null}
          </Panel>
        </aside>
      </div>
    </>
  );
}
