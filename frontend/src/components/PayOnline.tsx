"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Checkout = {
  order_id: number;
  provider: "razorpay" | "mock";
  provider_order_id: string;
  key_id: string | null;
  amount: string;
  amount_paise: number;
  currency: string;
  school_name: string;
  description: string;
  prefill_name: string | null;
  prefill_email: string | null;
  prefill_contact: string | null;
};

export type PaidOrder = { id: number; receipt_no: string | null; amount: string };

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

declare global {
  interface Window {
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
    s.onerror = () => reject(new Error("Couldn't load the payment page. Check your connection."));
    document.body.appendChild(s);
  });
}

/** "Pay ₹X" button: creates the order, runs Razorpay Checkout (or the
 * dev-only simulated checkout), and verifies with the server. */
export function PayOnlineButton({
  studentId,
  feeIds,
  total,
  onPaid,
  onError,
}: {
  studentId: string | number;
  feeIds: number[];
  total: number;
  onPaid: (o: PaidOrder) => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [mock, setMock] = useState<Checkout | null>(null);
  const base = `/api/v1/parent/me/children/${studentId}/fees/pay`;

  async function verify(r: RazorpayResponse) {
    try {
      const { data } = await api.post<PaidOrder>(`${base}/verify`, r);
      onPaid(data);
    } catch (e) {
      onError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function reportFailure(orderId: number, reason: string) {
    await api.post(`${base}/${orderId}/failed`, { reason }).catch(() => undefined);
  }

  async function start() {
    setBusy(true);
    try {
      const { data: co } = await api.post<Checkout>(base, { fee_ids: feeIds });
      if (co.provider === "mock") {
        setMock(co);
        return;
      }
      await loadRazorpay();
      const rzp = new window.Razorpay({
        key: co.key_id,
        order_id: co.provider_order_id,
        amount: co.amount_paise,
        currency: co.currency,
        name: co.school_name,
        description: co.description,
        prefill: {
          name: co.prefill_name ?? undefined,
          email: co.prefill_email ?? undefined,
          contact: co.prefill_contact ?? undefined,
        },
        handler: (r: RazorpayResponse) => verify(r),
        modal: {
          ondismiss: () => {
            reportFailure(co.order_id, "Cancelled by user");
            setBusy(false);
          },
        },
      });
      rzp.on("payment.failed", (resp: { error?: { description?: string } }) => {
        reportFailure(co.order_id, resp.error?.description ?? "Payment failed");
        onError(resp.error?.description ?? "Payment failed. No money was taken.");
        setBusy(false);
      });
      rzp.open();
    } catch (e) {
      onError(apiError(e));
      setBusy(false);
    }
  }

  return (
    <>
      <Button onClick={start} loading={busy} disabled={feeIds.length === 0}>
        Pay ₹{total.toLocaleString("en-IN")} online
      </Button>
      {mock && (
        <Modal
          open
          onClose={() => {
            reportFailure(mock.order_id, "Cancelled by user");
            setMock(null);
            setBusy(false);
          }}
          title="Test payment"
        >
          <div className="space-y-4 text-sm">
            <p className="text-ink-muted">
              This school hasn’t connected Razorpay yet, so this is a <b>test-mode</b> checkout
              (available in development only). No money moves.
            </p>
            <p className="text-ink">
              {mock.description} — <b>₹{Number(mock.amount).toLocaleString("en-IN")}</b>
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  reportFailure(mock.order_id, "Simulated failure");
                  setMock(null);
                  setBusy(false);
                  onError("Payment failed (simulated). No money was taken.");
                }}
              >
                Simulate failure
              </Button>
              <Button
                onClick={() => {
                  const co = mock;
                  setMock(null);
                  verify({
                    razorpay_order_id: co.provider_order_id,
                    razorpay_payment_id: `pay_mock_${Date.now()}`,
                    razorpay_signature: "mock-signature",
                  });
                }}
              >
                Simulate success
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
