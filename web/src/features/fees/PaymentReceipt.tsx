"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { DownloadButton, isoToday, MODES, modeLabel, monthLabel, monthStart } from "./common";
import { DateRange } from "./IncomeList";
import { CounterReceipt } from "./CounterReceipt";
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

/** "ONETIME" -> "One-time"; "2026-10" -> "Oct 2026". */
function periodLabel(p: string): string {
  if (p === "ONETIME") return "One-time";
  return /^\d{4}-\d{2}$/.test(p) ? monthLabel(p) : p;
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
  const school = useApi<{ name: string; address: string | null; logo_url: string | null }>(sess ? "/api/v1/branding/me" : null);

  if (!(child && orderId) && !receiptId) {
    return isParent ? (
      <PickFirst what="payment" href={routeOf(159)} cta="Open fees and payments" />
    ) : (
      <ReceiptList />
    );
  }

  // a counter receipt, for staff: the full receipt with the student's account after it
  if (receiptId && sess && !isParent) return <CounterReceipt id={receiptId} />;

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
      rows: o.items.map((i) => [i.fee_head_name, periodLabel(i.period), money(i.applied_amount ?? i.amount)]),
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
      // one line per fee the payment covered
      rows: c.lines?.length ? c.lines.map((l) => [l.fee_head_name, periodLabel(l.period), money(l.amount)]) : [[c.fee_head_name, periodLabel(c.period), money(c.amount)]],
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
    <>
    {receiptId && !isParent ? (
      <Link href={routeOf(160)} className="btn text" style={{ marginBottom: 12 }}>
        ← All receipts
      </Link>
    ) : null}
    <article className="invoice">
      <div className="spread">
        {/* The school issues the receipt: its logo, name and address head it. */}
        <div className="receipt-school">
          {school.data?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={school.data.logo_url} alt="" />
          ) : null}
          <div>
            <h3>{school.data?.name ?? ""}</h3>
            {school.data?.address ? <p className="small muted">{school.data.address}</p> : null}
          </div>
        </div>
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
        </div>
        <div className="right">
          <p>{`Issued on: ${r.issued}`}</p>
          {r.parent ? <p>{`Parent: ${r.parent}`}</p> : null}
          <p>{`Payment method: ${r.method}`}</p>
        </div>
      </div>
      <DataTable columns={["Fee description", "Period", "Amount"]} rows={r.rows} selectable={false} rowAction={false} footer={false} />
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
    </>
  );
}

/**
 * Every counter receipt in a date range (GET /school/accounts/collections),
 * searchable by student or receipt number. Opening one shows it for printing.
 * Day close shows one day's takings by method and by cashier, to tally the
 * drawer against before the cash goes to the bank.
 */
function ReceiptList() {
  const router = useRouter();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoToday());
  const [closing, setClosing] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [mode, setMode] = useState("");
  const [q, setQ] = useState("");
  const list = useApi<Collection[]>("/api/v1/school/accounts/collections", { from, to, mode: mode || undefined });
  const term = q.trim().toLowerCase();
  const rows = (list.data ?? []).filter(
    (c) => !term || c.student_name.toLowerCase().includes(term) || c.receipt_no.toLowerCase().includes(term),
  );
  const total = rows.reduce((t, c) => t + Number(c.amount), 0);
  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input type="search" placeholder="Student or receipt number" aria-label="Search receipts" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select aria-label="Payment method" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">All methods</option>
          {MODES.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {closing ? (
          <label className="day-pick">
            Day
            <input type="date" value={from} max={isoToday()} onChange={(e) => { setFrom(e.target.value); setTo(e.target.value); }} />
          </label>
        ) : (
          <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        )}
        <button
          type="button"
          className={`btn ${closing ? "primary" : ""}`}
          onClick={() => {
            if (!closing) {
              setFrom(isoToday());
              setTo(isoToday());
              setMode("");
            } else {
              setFrom(monthStart());
              setTo(isoToday());
            }
            setClosing(!closing);
          }}
        >
          <Icon name="check" className="sm" />
          {closing ? "Back to all receipts" : "Day close"}
        </button>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      {closing && list.data ? <DayClose day={from} receipts={rows} /> : null}
      <div className="row" style={{ justifyContent: "flex-end", marginBottom: 8 }}>
        <button type="button" className="btn text" onClick={() => setShowCancelled(!showCancelled)}>
          {showCancelled ? "Hide cancelled receipts" : "Show cancelled receipts"}
        </button>
      </div>
      {showCancelled ? <CancelledReceipts from={from} to={to} /> : null}
      <Panel
        title="Receipts"
        sub={list.data ? `${rows.length} receipt${rows.length === 1 ? "" : "s"} · ${money(total)} received · ${date(from)} – ${date(to)}` : "Fee payments taken at the counter"}
        action={
          <Link className="btn primary" href={routeOf(158)}>
            <Icon name="plus" className="sm" />
            Collect a fee
          </Link>
        }
        flush
      >
        <DataTable
          columns={["Receipt", "Date", "Student", "Fee", "Method", "Amount", "Collected by"]}
          rows={rows.map((c) => [
            c.receipt_no,
            date(c.collected_on),
            { name: c.student_name, sub: c.section_label ?? undefined },
            c.lines && c.lines.length > 1
              ? `${c.lines.length} fees: ${c.lines.map((l) => l.fee_head_name).join(", ")}`
              : `${c.fee_head_name}${c.period === "ONETIME" ? "" : ` · ${periodLabel(c.period)}`}`,
            modeLabel(c.mode),
            money(c.amount),
            c.collected_by_name ?? "—",
          ])}
          onView={(i) => router.push(`${routeOf(160)}?receipt=${rows[i].id}`)}
          empty={list.loading ? "Loading…" : term ? "No receipt matches that search." : "No fees were collected in these dates."}
        />
      </Panel>
    </>
  );
}

/**
 * One day's counter takings: the total by method (what should be in the
 * drawer, and what went to the bank or UPI) and by cashier, with a sheet to
 * print and sign. Built from the day's receipts.
 */
function DayClose({ day, receipts }: { day: string; receipts: Collection[] }) {
  const byMode = new Map<string, { n: number; amount: number }>();
  const byCashier = new Map<string, Map<string, number>>();
  for (const c of receipts) {
    const m = byMode.get(c.mode) ?? { n: 0, amount: 0 };
    m.n += 1;
    m.amount += Number(c.amount);
    byMode.set(c.mode, m);
    const who = c.collected_by_name ?? "Not recorded";
    const row = byCashier.get(who) ?? new Map<string, number>();
    row.set(c.mode, (row.get(c.mode) ?? 0) + Number(c.amount));
    byCashier.set(who, row);
  }
  const modes = MODES.map(([k]) => k).filter((k) => byMode.has(k)).concat([...byMode.keys()].filter((k) => !MODES.some(([m]) => m === k)));
  const total = receipts.reduce((t, c) => t + Number(c.amount), 0);
  const cash = byMode.get("cash")?.amount ?? 0;
  return (
    <section className="panel day-close">
      <div className="panel-head">
        <div>
          <h2>{`Day close · ${date(day)}`}</h2>
          <p>{`${receipts.length} receipt${receipts.length === 1 ? "" : "s"} · ${money(total)} in all · ${money(cash)} of it taken in cash this day`}</p>
        </div>
        <button type="button" className="btn" onClick={() => window.print()}>
          <Icon name="file" className="sm" />
          Print day close
        </button>
      </div>
      {receipts.length ? (
        <>
          <div className="day-close-modes">
            {modes.map((k) => (
              <div key={k}>
                <span>{modeLabel(k)}</span>
                <strong>{money(byMode.get(k)!.amount)}</strong>
                <small>{`${byMode.get(k)!.n} receipt${byMode.get(k)!.n === 1 ? "" : "s"}`}</small>
              </div>
            ))}
            <div className="all">
              <span>Total</span>
              <strong>{money(total)}</strong>
              <small>{`${receipts.length} receipts`}</small>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Collected by</th>
                  {modes.map((k) => (
                    <th key={k} className="num">
                      {modeLabel(k)}
                    </th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {[...byCashier.entries()].map(([who, row]) => (
                  <tr key={who}>
                    <td>{who}</td>
                    {modes.map((k) => (
                      <td key={k} className="num">
                        {row.get(k) ? money(row.get(k)!) : "—"}
                      </td>
                    ))}
                    <td className="num">
                      <strong>{money([...row.values()].reduce((a, b) => a + b, 0))}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <BankDeposit day={day} />
          <div className="day-close-sign">
            <span>Counted by</span>
            <span>Checked by</span>
            <span>Deposited to bank on</span>
          </div>
        </>
      ) : (
        <p className="muted small panel-pad">Nothing was collected at the counter on this day.</p>
      )}
    </section>
  );
}

/** The page-head Print button: for an online-payment receipt (a counter receipt has its own buttons). */
export function PrintReceiptAction() {
  const params = useSearchParams();
  // a counter receipt has its own Download / Print / Share row
  if (!(params.get("child") && params.get("order"))) return null;
  return (
    <button type="button" className="btn primary" data-print="">
      <Icon name="download" className="sm" />
      Print receipt
    </button>
  );
}

type CashInHand = { on: string; cash_in_hand: string; deposits: { id: number; amount: string; slip_no: string | null; voucher_no: string | null; deposited_by_name: string | null }[] };

/**
 * Cash taken to the bank on the day close: what is in the drawer
 * (GET /accounts/cash-in-hand), what was already deposited, and a form to
 * record a deposit (POST /accounts/deposits). The deposit posts a contra
 * voucher, Bank Dr / Cash Cr, so the books move it from cash to bank.
 */
function BankDeposit({ day }: { day: string }) {
  const r = useApi<CashInHand>("/api/v1/school/accounts/cash-in-hand", { on: day });
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [slip, setSlip] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = r.data;
  if (!d) return null;
  const inHand = Number(d.cash_in_hand);
  const banked = d.deposits.reduce((t, x) => t + Number(x.amount), 0);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ voucher_no: string | null }>("/api/v1/school/accounts/deposits", {
        deposited_on: day,
        amount,
        slip_no: slip.trim() || null,
        notes: notes.trim() || null,
      });
      notify(`${money(amount)} recorded as deposited to the bank${res.voucher_no ? ` (voucher ${res.voucher_no})` : ""}.`);
      setOpen(false);
      setSlip("");
      setNotes("");
      r.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bank-deposit">
      <div className="spread">
        <div>
          <strong>{`Cash not yet in the bank: ${money(inHand)}`}</strong>
          <p className="muted small">This day's cash and any earlier cash not yet deposited: what the drawer should hold.</p>
          <p className="muted small">
            {banked
              ? `${money(banked)} taken to the bank today: ${d.deposits.map((x) => `${money(x.amount)}${x.slip_no ? ` (slip ${x.slip_no})` : ""}`).join(", ")}.`
              : "Nothing deposited to the bank on this day yet."}
          </p>
        </div>
        {inHand > 0 && !open ? (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setAmount(String(inHand));
              setOpen(true);
            }}
          >
            <Icon name="download" className="sm" />
            Record bank deposit
          </button>
        ) : null}
      </div>
      {open ? (
        <form className="bank-deposit-form" onSubmit={save}>
          <ErrorNote>{error}</ErrorNote>
          <label className="field">
            <span>Amount deposited</span>
            <input type="number" min={1} max={inHand} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label className="field">
            <span>Deposit slip no.</span>
            <input value={slip} maxLength={60} onChange={(e) => setSlip(e.target.value)} placeholder="From the bank's counterfoil" />
          </label>
          <label className="field">
            <span>Notes</span>
            <input value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} placeholder="Bank and branch (optional)" />
          </label>
          <div className="row" style={{ gap: 8, alignSelf: "end" }}>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Save deposit"}
            </button>
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

type Cancelled = {
  id: number;
  receipt_no: string;
  collected_on: string;
  amount: string;
  mode: string;
  student_name: string;
  admission_no: string;
  lines: { fee_head: string; period: string; amount: string }[];
  reason: string;
  cancelled_at: string;
  collected_by_name: string | null;
  requested_by_name: string | null;
  approved_by_name: string | null;
};

/** Receipts cancelled as entered in error, in the same dates (GET /accounts/cancelled-receipts). */
function CancelledReceipts({ from, to }: { from: string; to: string }) {
  const r = useApi<Cancelled[]>("/api/v1/school/accounts/cancelled-receipts", { from, to });
  const rows = r.data ?? [];
  return (
    <Panel title="Cancelled receipts" sub={`${rows.length} · ${money(rows.reduce((t, x) => t + Number(x.amount), 0))} · kept for the record, not counted anywhere`} flush>
      <ErrorNote>{r.error}</ErrorNote>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Receipt</th>
              <th>Paid on</th>
              <th>Student</th>
              <th>Fees</th>
              <th className="num">Amount</th>
              <th>Reason</th>
              <th>Asked by · Approved by</th>
              <th>Cancelled</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.receipt_no}</td>
                <td>{date(c.collected_on)}</td>
                <td>
                  {c.student_name}
                  <small className="muted" style={{ display: "block", fontWeight: 500 }}>{c.admission_no}</small>
                </td>
                <td className="wrap">{c.lines.map((l) => l.fee_head).join(", ")}</td>
                <td className="num">{money(c.amount)}</td>
                <td className="wrap">{c.reason}</td>
                <td>{`${c.requested_by_name ?? "—"} · ${c.approved_by_name ?? "—"}`}</td>
                <td>{dateTime(c.cancelled_at)}</td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={8} className="table-empty">
                  {r.loading ? "Loading…" : "No receipts were cancelled in these dates."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
