"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, initials, money } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useHydrated, useSession } from "@/lib/useSession";
import { Dialog, Notice } from "./common";
import type { Checkout, Child, OnlineOrder, StudentFee } from "./types";

type ProviderReply = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

declare global {
  interface Window {
    // Razorpay's hosted checkout, loaded from checkout.razorpay.com on demand.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Razorpay?: any;
  }
}

function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("The payment page could not be loaded. Check your connection and try again."));
    document.body.appendChild(s);
  });
}

/**
 * SCR-159, live, parent portal. The parent picks unpaid fees; we ask the
 * server for an order (POST …/fees/pay) and open the provider's own hosted
 * checkout, which collects the payment details — this page never does. The
 * provider's reply goes to the server (POST …/fees/pay/verify) and the
 * payment is shown as done only when the server says the order is paid.
 * A dismissed or failed checkout is reported (POST …/fees/pay/{order}/failed).
 */
export function OnlinePayment() {
  const sess = useSession();
  const hydrated = useHydrated();
  const isParent = sess?.user.role === "parent";
  const params = useSearchParams();
  const children = useApi<Child[]>(isParent ? "/api/v1/parent/me/children" : null);
  const [childId, setChildId] = useState<number | null>(params.get("child") ? Number(params.get("child")) : null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<OnlineOrder | null>(null);
  const [test, setTest] = useState<Checkout | null>(null);

  useEffect(() => {
    if (childId === null && children.data?.length) setChildId(children.data[0].id);
  }, [children.data, childId]);

  const base = childId ? `/api/v1/parent/me/children/${childId}` : null;
  const fees = useApi<StudentFee[]>(base ? `${base}/fees` : null);
  const orders = useApi<OnlineOrder[]>(base ? `${base}/payments` : null);
  const child = children.data?.find((c) => c.id === childId);

  const payable = useMemo(() => (fees.data ?? []).filter((f) => f.status === "pending" && Number(f.amount_outstanding) > 0).sort((a, b) => a.due_date.localeCompare(b.due_date)), [fees.data]);
  const chosen = payable.filter((f) => picked.has(f.id));
  const selectedTotal = chosen.reduce((s, f) => s + Number(f.amount_outstanding), 0);
  const nextDue = chosen[0] ?? payable[0];
  const receipts = (orders.data ?? []).filter((o) => o.status === "paid").slice(0, 3);

  // Start with every overdue fee ticked, or the oldest one.
  useEffect(() => {
    if (!payable.length) return;
    const overdue = payable.filter((f) => f.is_overdue).map((f) => f.id);
    setPicked(new Set(overdue.length ? overdue : [payable[0].id]));
  }, [payable]);

  function toggle(id: number) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  async function reportFailure(orderId: number, reason: string) {
    if (!base) return;
    await api.post(`${base}/fees/pay/${orderId}/failed`, { reason }).catch(() => undefined);
  }

  async function verify(reply: ProviderReply) {
    if (!base) return;
    try {
      const order = await api.post<OnlineOrder>(`${base}/fees/pay/verify`, reply);
      if (order.status === "paid") {
        setPaid(order);
        setPicked(new Set());
      } else {
        setError(order.failure_reason ?? "The payment could not be confirmed. If money left your account, the school will reconcile it — do not pay again.");
      }
      fees.reload();
      orders.reload();
    } catch (e) {
      setError(`${errorText(e)} If money left your account, the school will reconcile it — do not pay again.`);
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!base || !chosen.length) return;
    setBusy(true);
    setError(null);
    setPaid(null);
    try {
      const co = await api.post<Checkout>(`${base}/fees/pay`, { fee_ids: chosen.map((f) => f.id) });
      if (co.provider === "mock") {
        // The backend's test-mode stand-in for the provider (development only; no money moves).
        setTest(co);
        return;
      }
      if (co.provider !== "razorpay") {
        reportFailure(co.order_id, `Unsupported provider ${co.provider}`);
        throw new Error("This payment provider is not supported here yet. No money was taken.");
      }
      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: co.key_id,
        order_id: co.provider_order_id,
        amount: co.amount_paise,
        currency: co.currency,
        name: co.school_name,
        description: co.description,
        prefill: { name: co.prefill_name ?? undefined, email: co.prefill_email ?? undefined, contact: co.prefill_contact ?? undefined },
        handler: (r: ProviderReply) => verify(r),
        modal: {
          ondismiss: () => {
            reportFailure(co.order_id, "Cancelled by user");
            setBusy(false);
          },
        },
      });
      rzp.on("payment.failed", (resp: { error?: { description?: string } }) => {
        reportFailure(co.order_id, resp.error?.description ?? "Payment failed");
        setError(resp.error?.description ?? "The payment failed. No money was taken.");
        setBusy(false);
      });
      rzp.open();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  if (hydrated && sess && !isParent) {
    return (
      <section className="panel">
        <div className="panel-pad">
          <p className="muted" style={{ marginBottom: 14 }}>
            Online payment is made by a parent from the parent portal. Payments made online appear in the cash book and each student’s ledger.
          </p>
          <Link href={routeOf(158)} className="btn primary">
            <Icon name="arrow" className="sm" />
            Record a payment at the counter instead
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="two-col">
      <div className="stack">
        {paid ? (
          <Notice>
            {`Payment of ${money(paid.amount)} confirmed by the school. Receipt ${paid.receipt_no ?? "—"}. `}
            <Link href={`${routeOf(160)}?child=${paid.student_id}&order=${paid.id}`}>View receipt</Link>
          </Notice>
        ) : null}
        <ErrorNote>{error ?? children.error ?? fees.error}</ErrorNote>
        <Panel title="Student account">
          {child ? (
            <>
              <div className="person">
                <span className="avatar mint">{initials(child.full_name)}</span>
                <div>
                  {child.full_name}
                  <small>{`${child.section_label ?? "—"} · Admission no. ${child.admission_no}`}</small>
                </div>
              </div>
              <div className="gap" />
              <div className="payment-lines">
                {payable.map((f) => (
                  <div key={f.id}>
                    <span>
                      <label className="row" style={{ gap: 8 }}>
                        <input type="checkbox" checked={picked.has(f.id)} onChange={() => toggle(f.id)} aria-label={`Pay ${f.fee_head_name} ${f.period}`} />
                        {`${f.fee_head_name} · ${f.period}${f.is_overdue ? " · overdue" : ""}`}
                      </label>
                    </span>
                    <strong>{money(f.amount_outstanding)}</strong>
                  </div>
                ))}
                {!payable.length ? (
                  <div>
                    <span>{fees.loading ? "Loading fees…" : "Nothing is due. Thank you."}</span>
                    <strong>{money(0)}</strong>
                  </div>
                ) : null}
                <div className="sum">
                  <span>{`Selected (${chosen.length} of ${payable.length})`}</span>
                  <strong>{money(selectedTotal)}</strong>
                </div>
              </div>
            </>
          ) : (
            <p className="muted small">{children.loading || !hydrated ? "Loading…" : "No children are linked to your account."}</p>
          )}
        </Panel>
        <section className="panel">
          <div className="panel-head">
            <h2>Payment details</h2>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <label className="field">
                <span>
                  Student
                  <span className="req">*</span>
                </span>
                <select value={childId ?? ""} onChange={(e) => setChildId(Number(e.target.value))} aria-label="Student">
                  {children.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Payable amount</span>
                <input readOnly value={money(selectedTotal)} aria-label="Payable amount" />
              </label>
              {/* Payment method, card, UPI and contact details are entered on the provider's own checkout page, never here. */}
            </div>
            <div className="gap" />
            <p className="small muted">
              <Icon name="shield" className="sm" /> You will pay on the payment provider’s secure page. The school confirms the payment before issuing a receipt.
            </p>
          </div>
          <div className="form-footer">
            <span>Amounts in INR</span>
            <button type="button" className="btn primary" disabled={busy || !chosen.length} onClick={start}>
              <Icon name="check" className="sm" />
              {busy ? "Waiting for payment…" : "Continue to payment"}
            </button>
          </div>
        </section>
      </div>
      <aside className="stack">
        <div className="payment-summary">
          <h3>Amount to pay</h3>
          <div className="checkout-total">{money(selectedTotal)}</div>
          <p className="stat-note">{chosen.length ? chosen.map((f) => `${f.fee_head_name} ${f.period}`).join(", ") : "Choose fees to pay"}</p>
          <div className="gap" />
          <dl className="kv">
            <div>
              <dt>Student</dt>
              <dd>{child?.full_name ?? "—"}</dd>
            </div>
            <div>
              <dt>Class</dt>
              <dd>{child?.section_label ?? "—"}</dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd>{nextDue ? date(nextDue.due_date) : "—"}</dd>
            </div>
          </dl>
        </div>
        <Panel title="Recent receipts">
          {receipts.map((o) => (
            <div className="event-row" key={o.id}>
              <div className="event-content">
                <h4>
                  <Link href={`${routeOf(160)}?child=${o.student_id}&order=${o.id}`}>{o.receipt_no ?? `Order ${o.id}`}</Link>
                </h4>
                <p>{`${dateTime(o.paid_at)} · Online`}</p>
              </div>
              <strong className="small">{money(o.amount)}</strong>
            </div>
          ))}
          {!receipts.length ? <p className="muted small">{orders.loading ? "Loading…" : "No online payments yet."}</p> : null}
        </Panel>
      </aside>
      {test ? (
        <Dialog
          title="Test payment"
          onClose={() => {
            reportFailure(test.order_id, "Cancelled by user");
            setTest(null);
            setBusy(false);
          }}
        >
          <p>{`This school has not connected its payment provider yet, so the server offered a test-mode checkout. No money moves.\n\n${test.description} — ${money(test.amount)}`}</p>
          <div className="row actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                reportFailure(test.order_id, "Simulated failure");
                setTest(null);
                setBusy(false);
                setError("The payment failed (test mode). No money was taken.");
              }}
            >
              Simulate failure
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const co = test;
                setTest(null);
                // Still verified by the server; it decides whether this counts.
                verify({ razorpay_order_id: co.provider_order_id, razorpay_payment_id: `pay_mock_${Date.now()}`, razorpay_signature: "mock-signature" });
              }}
            >
              Simulate success
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
