// Shared by the parent fee screens PM-023…PM-028.

import type { CSSProperties } from "react";
import type { OnlineOrder, StudentFee } from "@/features/fees/types";
import { BAD_STATUS } from "../comms/ui";

export type { OnlineOrder, StudentFee, Checkout } from "@/features/fees/types";

export const feesPath = (childId: number) => `/api/v1/parent/me/children/${childId}/fees`;
export const paymentsPath = (childId: number) => `/api/v1/parent/me/children/${childId}/payments`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10" -> "Oct 2026"; anything else as it is. */
export function periodLabel(p: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : p;
}

export const feeName = (f: { fee_head_name: string; period: string }) => `${f.fee_head_name} · ${periodLabel(f.period)}`;

/** Fees the parent can pay online now, oldest due first. */
export function payableFees(fees: StudentFee[] | null, childId: number | null): StudentFee[] {
  return (fees ?? [])
    .filter((f) => f.student_id === childId && f.status === "pending" && Number(f.amount_outstanding) > 0)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}

export const sum = (xs: { amount_outstanding: string }[]) => xs.reduce((s, f) => s + Number(f.amount_outstanding), 0);

/**
 * How an online order reads to a parent. "created" means the provider has not
 * been confirmed by the server: it is pending, never paid. A failure the
 * parent caused by closing the checkout is shown as cancelled.
 */
export function orderState(o: OnlineOrder): { key: "paid" | "pending" | "cancelled" | "failed"; label: string; cls: string; style?: CSSProperties } {
  if (o.status === "paid") return { key: "paid", label: "Paid ✓", cls: "status" };
  if (o.status === "created") return { key: "pending", label: "Pending", cls: "status blue" };
  if (/cancel/i.test(o.failure_reason ?? "")) return { key: "cancelled", label: "Cancelled", cls: "status amber" };
  return { key: "failed", label: "Failed", cls: "status", style: BAD_STATUS };
}

export const orderTitle = (o: OnlineOrder) =>
  o.items.length ? o.items.map((i) => `${i.fee_head_name} ${periodLabel(i.period)}`).join(", ") : `Online payment #${o.id}`;

/** Only this child's rows (guards the moment after a child switch, before the new list arrives). */
export const ofChild = <T extends { student_id: number }>(rows: T[] | null, childId: number | null): T[] => (rows ?? []).filter((r) => r.student_id === childId);

/** An unconfirmed order started in the last 15 minutes: paying again could charge twice. */
export function isFreshPending(o: OnlineOrder): boolean {
  return o.status === "created" && Date.now() - new Date(o.created_at).getTime() < 15 * 60_000;
}
