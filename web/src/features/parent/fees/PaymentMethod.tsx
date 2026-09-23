"use client";

/*
 * PM-025 · Payment method. The server creates the order (POST …/fees/pay) for
 * the fee lines chosen on PM-024 (?fees=1,2). The payment provider's own
 * hosted checkout collects the method and card/UPI details — this page never
 * does. The provider's reply is sent to the server (POST …/fees/pay/verify),
 * and PM-026 shows the order as the server records it: paid only when the
 * server says so. A closed or failed checkout is reported
 * (POST …/fees/pay/{order}/failed). Follows features/fees/OnlinePayment.tsx.
 */

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useParent } from "@/components/parent/ParentShell";
import { api, errorText } from "@/lib/api";
import { date, dateTime, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { PmEmpty, PmError, PmLoading, useGoTo } from "../comms/ui";
import { feeName, feesPath, isFreshPending, ofChild, payableFees, paymentsPath, sum, type Checkout, type OnlineOrder, type StudentFee } from "./common";

type ProviderReply = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };

type RazorpayCtor = new (opts: Record<string, unknown>) => { open: () => void; close: () => void; on: (ev: string, cb: (r: { error?: { description?: string } }) => void) => void };

/**
 * True in the Android app and on a phone browser, where paying means leaving
 * for a UPI or bank app. The checkout's own reply never survives that, so the
 * payment is finished by a redirect back to the server instead.
 */
function paysByLeaving(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { Capacitor?: unknown };
  return Boolean(w.Capacitor) || /Android|iPhone|iPad/i.test(navigator.userAgent);
}

function loadRazorpay(): Promise<RazorpayCtor> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("The payment page could not be loaded.")));
    s.onerror = () => reject(new Error("The payment page could not be loaded. Check your connection and try again. No money was taken."));
    document.body.appendChild(s);
  });
}

export function PaymentMethod() {
  const { childId, child } = useParent();
  const goTo = useGoTo();
  const params = useSearchParams();
  const base = childId ? `/api/v1/parent/me/children/${childId}` : null;
  const fees = useApi<StudentFee[]>(childId ? feesPath(childId) : null);
  const orders = useApi<OnlineOrder[]>(childId ? paymentsPath(childId) : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<Checkout | null>(null);
  const [waiting, setWaiting] = useState(false);
  const done = useRef(false);

  // Only fee lines that are still payable for *this* child count; anything else in ?fees= is ignored.
  const chosen = useMemo(() => {
    const want = new Set((params.get("fees") ?? "").split(",").map(Number).filter(Boolean));
    return payableFees(fees.data, childId).filter((f) => want.has(f.id));
  }, [fees.data, params, childId]);
  const total = sum(chosen);
  const blocking = ofChild(orders.data, childId).find((o) => isFreshPending(o) && o.items.some((i) => chosen.some((f) => f.id === i.student_fee_id)));

  async function reportFailure(orderId: number, reason: string) {
    if (!base) return;
    await api.post(`${base}/fees/pay/${orderId}/failed`, { reason }).catch(() => undefined);
  }

  /**
   * Whether the money has landed, asked of the server a few times over the
   * next few seconds.
   *
   * On a phone the checkout hands over to the UPI app, and the reply that
   * normally closes this page is lost the moment the parent leaves it: they
   * come back to a screen that still believes nothing was paid. The bank's
   * own webhook tells the server, so the server is who to ask — and it is
   * asked before a closed checkout is ever called a failure.
   */
  async function landed(orderId: number, tries = 6): Promise<boolean> {
    if (!base) return false;
    for (let i = 0; i < tries; i++) {
      try {
        const o = await api.get<OnlineOrder>(`${base}/fees/pay/${orderId}`);
        if (o.status === "paid") return true;
        if (o.status === "failed") return false;
      } catch {
        // the server could not be asked; try again, then give up quietly
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  }

  async function verify(orderId: number, reply: ProviderReply) {
    if (!base) return;
    try {
      // Whatever the server answers (paid or failed), PM-026 shows the order as recorded.
      await api.post<OnlineOrder>(`${base}/fees/pay/verify`, reply);
    } catch {
      // The order stays "created" (pending) on the server; PM-026 says so and warns against paying again.
    }
    goTo(26, { order: orderId });
  }

  async function start() {
    if (!base || !chosen.length || busy) return;
    setBusy(true);
    setError(null);
    done.current = false;
    try {
      const co = await api.post<Checkout>(`${base}/fees/pay`, { fee_ids: chosen.map((f) => f.id) });
      if (co.provider === "mock") {
        // The backend's test-mode stand-in for a provider (development only; no money moves).
        setTest(co);
        return;
      }
      if (co.provider !== "razorpay") {
        await reportFailure(co.order_id, `Unsupported provider ${co.provider}`);
        throw new Error("This payment provider is not supported in the app yet. No money was taken.");
      }
      const Razorpay = await loadRazorpay();
      const rzp = new Razorpay({
        key: co.key_id,
        order_id: co.provider_order_id,
        amount: co.amount_paise,
        currency: co.currency,
        name: co.school_name,
        description: co.description,
        prefill: { name: co.prefill_name ?? undefined, email: co.prefill_email ?? undefined, contact: co.prefill_contact ?? undefined },
        // On a phone, come back through the server rather than through a page
        // the parent has already left (see paysByLeaving).
        ...(paysByLeaving()
          ? { redirect: true, callback_url: `${window.location.origin}/api/v1/public/payments/razorpay/return` }
          : {}),
        handler: (r: ProviderReply) => {
          done.current = true;
          verify(co.order_id, r);
        },
        modal: {
          ondismiss: async () => {
            if (done.current) return;
            done.current = true;
            // They may have paid in a UPI app and come back here; ask the
            // server before calling it cancelled.
            setWaiting(true);
            const paid = await landed(co.order_id);
            setWaiting(false);
            if (!paid) await reportFailure(co.order_id, "Cancelled by user");
            goTo(26, { order: co.order_id });
          },
        },
      });
      rzp.on("payment.failed", async (resp) => {
        if (done.current) return;
        done.current = true;
        await reportFailure(co.order_id, resp.error?.description ?? "Payment failed");
        rzp.close();
        goTo(26, { order: co.order_id });
      });
      // Coming back from the UPI app: the checkout's own reply may never
      // arrive, so the moment this page is looked at again, ask the server.
      const onReturn = async () => {
        if (done.current || document.visibilityState !== "visible") return;
        if (await landed(co.order_id, 2)) {
          done.current = true;
          document.removeEventListener("visibilitychange", onReturn);
          rzp.close();
          goTo(26, { order: co.order_id });
        }
      };
      document.addEventListener("visibilitychange", onReturn);
      rzp.open();
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  if (!childId || fees.loading || orders.loading) return <PmLoading />;
  if (fees.error) return <PmError>{fees.error}</PmError>;
  if (!chosen.length)
    return (
      <>
        <PmEmpty title="Nothing selected">Choose the fees to pay first.</PmEmpty>
        <button className="action" onClick={() => goTo(24)}>
          Choose fees
        </button>
      </>
    );

  return (
    <>
      <div className="pay-total">
        <small>Amount payable</small>
        <h1>{money(total)}</h1>
        <p>
          {`${chosen.length === 1 ? feeName(chosen[0]) : `${chosen.length} fee lines`} · `}
          <span className="child-name">{child?.full_name}</span>
        </p>
      </div>
      {/* Payment method (UPI, card, net banking) is chosen on the provider's own secure page, never here. */}
      <dl>
        {chosen.map((f) => (
          <div key={f.id}>
            <dt>{`${feeName(f)} · due ${date(f.due_date)}`}</dt>
            <dd>{money(f.amount_outstanding)}</dd>
          </div>
        ))}
        {/* Not wired: convenience charge — the API has none; the provider shows any charge before payment. */}
        <div>
          <dt>Total</dt>
          <dd>{money(total)}</dd>
        </div>
      </dl>
      {blocking ? (
        <div className="panel soft" role="alert">
          <h3>A payment is already in progress</h3>
          <p>{`A payment for these fees was started at ${dateTime(blocking.created_at)} and has not been confirmed yet. If money left your account, do not pay again — the school will reconcile it.`}</p>
          <button className="action secondary" onClick={() => goTo(26, { order: blocking.id })}>
            Check payment status
          </button>
        </div>
      ) : null}
      <PmError>{error}</PmError>
      {test ? (
        <div className="panel">
          <h3>Test payment</h3>
          <p>{`This school has not connected its payment provider yet, so the server offered a test-mode checkout. No money moves. ${test.description} — ${money(test.amount)}`}</p>
          <button
            className="action"
            onClick={() => {
              const co = test;
              setTest(null);
              // Still verified by the server; it decides whether this counts.
              verify(co.order_id, { razorpay_order_id: co.provider_order_id, razorpay_payment_id: `pay_mock_${Date.now()}`, razorpay_signature: "mock-signature" });
            }}
          >
            Simulate success
          </button>
          <button
            className="action secondary"
            onClick={async () => {
              const co = test;
              setTest(null);
              await reportFailure(co.order_id, "Simulated failure");
              goTo(26, { order: co.order_id });
            }}
          >
            Simulate failure
          </button>
          <button
            className="action secondary"
            onClick={async () => {
              const co = test;
              setTest(null);
              await reportFailure(co.order_id, "Cancelled by user");
              goTo(26, { order: co.order_id });
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button className="action" disabled={busy || Boolean(blocking)} onClick={start}>
          {waiting ? "Checking with the bank…" : busy ? "Waiting for payment…" : "Continue to secure payment"}
        </button>
      )}
      <p className="micro">You pay on the payment provider’s secure page. The app never sees your card or UPI details, and the school confirms the payment before issuing a receipt.</p>
    </>
  );
}
