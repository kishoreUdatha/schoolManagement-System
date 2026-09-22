"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { date, dateTime, money } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { DownloadButton, modeLabel } from "./common";
import type { Collection, OnlineOrder } from "./types";

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? "-" + ONES[r % 10] : ""}`;
  return [h ? `${ONES[h]} hundred` : "", rest].filter(Boolean).join(" ");
}

/** 12500.5 -> "Twelve thousand five hundred rupees and fifty paise only" (Indian grouping). */
export function rupeesInWords(v: number | string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return "";
  let r = Math.floor(n);
  const paise = Math.round((n - r) * 100);
  const parts: string[] = [];
  const crore = Math.floor(r / 10000000);
  r %= 10000000;
  const lakh = Math.floor(r / 100000);
  r %= 100000;
  const thousand = Math.floor(r / 1000);
  r %= 1000;
  if (crore) parts.push(`${under1000(crore)} crore`);
  if (lakh) parts.push(`${under1000(lakh)} lakh`);
  if (thousand) parts.push(`${under1000(thousand)} thousand`);
  if (r) parts.push(under1000(r));
  const words = `${parts.join(" ") || "zero"} rupees${paise ? ` and ${under1000(paise)} paise` : ""} only`;
  return words[0].toUpperCase() + words.slice(1);
}

type Receipt = {
  number: string;
  student: string;
  sub: string;
  issued: string;
  parent: string | null;
  method: string;
  rows: Row[];
  total: string;
  received: boolean;
  status: string;
  reference: string | null;
  pdf: string | null;
};

/**
 * SCR-160, live. Three kinds of receipt, by query:
 *  ?child=&order=  an online payment. Parents read it from
 *                  /parent/me/children/{child}/payments, staff from
 *                  /school/payments/online?student_id=; both have a PDF.
 *  ?receipt=       a counter receipt, /school/accounts/collections/{id}.
 * The school's name and address come from GET /api/v1/branding/me.
 */
export function PaymentReceipt() {
  const params = useSearchParams();
  const sess = useSession();
  const isParent = sess?.user.role === "parent";
  const child = params.get("child");
  const orderId = Number(params.get("order"));
  const receiptId = params.get("receipt");

  const parentOrders = useApi<OnlineOrder[]>(sess && isParent && child && orderId ? `/api/v1/parent/me/children/${child}/payments` : null);
  const schoolOrders = useApi<OnlineOrder[]>(sess && !isParent && child && orderId ? "/api/v1/school/payments/online" : null, { student_id: child });
  const counter = useApi<Collection>(sess && !isParent && receiptId ? `/api/v1/school/accounts/collections/${receiptId}` : null);
  const school = useApi<{ name: string; address: string | null }>(sess ? "/api/v1/branding/me" : null);

  if (!(child && orderId) && !receiptId) {
    return isParent ? (
      <PickFirst what="payment" href={routeOf(159)} cta="Open fees and payments" />
    ) : (
      <PickFirst what="receipt" href={routeOf(158)} cta="Open fee collection" />
    );
  }

  const orders = isParent ? parentOrders : schoolOrders;
  const loading = orders.loading || counter.loading || !sess;
  const error = orders.error ?? counter.error;

  let r: Receipt | null = null;
  const o = orders.data?.find((x) => x.id === orderId);
  if (o) {
    r = {
      number: o.receipt_no ?? `Order ${o.id}`,
      student: o.student_name,
      sub: `Online payment · ${o.provider_order_id}`,
      issued: o.paid_at ? dateTime(o.paid_at) : dateTime(o.created_at),
      parent: o.parent_name,
      method: "Online",
      rows: o.items.map((i) => [i.fee_head_name, i.period, money(i.applied_amount ?? i.amount)]),
      total: o.amount,
      received: o.status === "paid",
      status: o.status === "paid" ? "PAID" : o.status === "failed" ? "FAILED" : "NOT PAID",
      reference: o.provider_payment_id ?? o.provider_order_id,
      pdf: o.status === "paid" ? (isParent ? `/api/v1/parent/me/children/${child}/payments/${o.id}/receipt.pdf` : `/api/v1/school/payments/online/${o.id}/receipt.pdf`) : null,
    };
    if (Number(o.excess_amount) > 0) r.rows.push(["Held as advance", "—", money(o.excess_amount)]);
  } else if (counter.data) {
    const c = counter.data;
    r = {
      number: c.receipt_no,
      student: c.student_name,
      sub: `${c.section_label ?? "—"}`,
      issued: date(c.collected_on),
      parent: null,
      method: modeLabel(c.mode),
      rows: [[c.fee_head_name, c.period, money(c.amount)]],
      total: c.amount,
      received: true,
      status: "PAID",
      reference: c.reference,
      pdf: null,
    };
  }

  if (!r) {
    if (loading) return <Loading what="Loading the receipt…" />;
    return <ErrorNote>{error ?? "That receipt was not found."}</ErrorNote>;
  }

  return (
    <article className="invoice">
      <div className="spread">
        <Link href="/screens" className="brand">
          <span className="brand-mark">
            <Icon name="book" />
          </span>
          <span>
            BrightCampus
            <small>SCHOOL ERP</small>
          </span>
        </Link>
        <div className="right">
          <h2>{r.received ? "Payment receipt" : "Payment status"}</h2>
          <p className="small muted">{r.number}</p>
        </div>
      </div>
      <div className="invoice-meta">
        <div>
          <p>Student</p>
          <h3>{r.student}</h3>
          <p>{r.sub}</p>
          {school.data ? (
            <p className="small muted">
              {school.data.name}
              {school.data.address ? ` · ${school.data.address}` : ""}
            </p>
          ) : null}
        </div>
        <div className="right">
          <p>{`Issued on: ${r.issued}`}</p>
          {r.parent ? <p>{`Parent: ${r.parent}`}</p> : null}
          <p>{`Payment method: ${r.method}`}</p>
        </div>
      </div>
      <DataTable columns={["Fee description", "Period", "Amount"]} rows={r.rows} selectable={false} rowAction={false} />
      <div className="invoice-total">
        {/* Concessions and fines are already inside each fee's amount; the API does not split them out per receipt. */}
        <div className="grand">
          <span>{r.received ? "Amount received" : "Amount"}</span>
          <strong>{money(r.total)}</strong>
        </div>
      </div>
      <div className="spread">
        <div className="stamp">{r.status}</div>
        <div className="right small muted">
          Transaction reference
          <br />
          <strong>{r.reference ?? "—"}</strong>
        </div>
      </div>
      <div className="gap" />
      {r.received ? <p className="small muted">{`Amount in words: ${rupeesInWords(r.total)}.`}</p> : <p className="small muted">No money has been received against this order. It is not a receipt.</p>}
      {r.pdf ? (
        <>
          <div className="gap" />
          <DownloadButton path={r.pdf} filename={`${r.number}.pdf`}>
            Download PDF
          </DownloadButton>
        </>
      ) : null}
    </article>
  );
}
