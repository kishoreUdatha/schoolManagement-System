"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date, money } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { isoToday, monthStart } from "@/features/fees/common";
import { AccountSelect, amt, BOOKS, drCr, fyStart, Period, ReportActions, sourceHref } from "./common";
import type { Account, DayBook as Book, Ledger } from "./types";

function Voucher({ source, id, voucher }: { source: string; id: number | null; voucher: string | null }) {
  const href = sourceHref(source, id);
  if (!voucher) return <span className="muted">—</span>;
  return href ? <Link href={href}>{voucher}</Link> : <>{voucher}</>;
}

/** NEW-1054: one account's entries with a running balance (?account=&from=&to=). */
export function GeneralLedger() {
  const params = useSearchParams();
  const router = useRouter();
  const [from, setFrom] = useState(params.get("from") ?? fyStart());
  const [to, setTo] = useState(params.get("to") ?? isoToday());
  const [account, setAccount] = useState<number | "">(Number(params.get("account")) || "");
  const accounts = useApi<Account[]>(`${BOOKS}/accounts`);
  const ledger = useApi<Ledger>(account ? `${BOOKS}/accounts/${account}/ledger` : null, { from, to });
  const l = ledger.data;
  const kind = l?.account.kind ?? "asset";

  const pick = (id: number | "") => {
    setAccount(id);
    router.replace(`${routeOf(1054)}${id ? `?account=${id}&from=${from}&to=${to}` : ""}`);
  };

  return (
    <>
      <div className="filterbar">
        <AccountSelect accounts={accounts.data ?? []} value={account} onChange={pick} />
        <Period from={from} to={to} onChange={(f, t) => (setFrom(f), setTo(t))} />
      </div>
      <ErrorNote>{accounts.error ?? ledger.error}</ErrorNote>
      {!account ? (
        <Panel title="Account ledger">
          <p className="muted small">Choose an account to see every entry in it, with the balance after each one.</p>
        </Panel>
      ) : (
        <>
          <StatStrip
            compact
            items={[
              { label: "Opening", value: l ? drCr(l.opening, kind) : "…", note: `On ${date(from)}` },
              { label: "Debits", value: l ? money(l.total_debit) : "…", note: `${l?.lines.length ?? 0} entries` },
              { label: "Credits", value: l ? money(l.total_credit) : "…", note: "In the period" },
              { label: "Closing", value: l ? drCr(l.closing, kind) : "…", note: `On ${date(to)}` },
            ]}
          />
          <Panel
            title={l ? `${l.account.code} · ${l.account.name}` : "Account ledger"}
            sub={l?.account.description ?? undefined}
            action={<ReportActions filename={`ledger_${l?.account.code ?? account}_${from}_${to}.csv`} />}
            flush
          >
            <div className="table-wrap">
              <table className="data-table books-table" data-caption={l ? `Ledger ${l.account.code} ${l.account.name} ${from} to ${to}` : ""}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Voucher</th>
                    <th>Particulars</th>
                    <th>Against</th>
                    <th className="right">Debit</th>
                    <th className="right">Credit</th>
                    <th className="right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="books-sub">
                    <td>{date(from)}</td>
                    <td />
                    <td>Opening balance</td>
                    <td />
                    <td />
                    <td />
                    <td className="right mono">{l ? drCr(l.opening, kind) : ""}</td>
                  </tr>
                  {(l?.lines ?? []).map((x, i) => (
                    <tr key={i}>
                      <td>{date(x.date)}</td>
                      <td>
                        <Voucher source={x.source} id={x.source_id} voucher={x.voucher} />
                      </td>
                      <td className="wrap">
                        {x.narration}
                        <small className="muted" style={{ display: "block" }}>
                          {x.source_label}
                        </small>
                      </td>
                      <td className="wrap small">{x.against.join(", ")}</td>
                      <td className="right mono">{amt(x.debit)}</td>
                      <td className="right mono">{amt(x.credit)}</td>
                      <td className="right mono">{drCr(x.balance, kind)}</td>
                    </tr>
                  ))}
                  {l && !l.lines.length ? (
                    <tr>
                      <td colSpan={7} className="muted">
                        No entries in this period.
                      </td>
                    </tr>
                  ) : null}
                  {l ? (
                    <tr className="books-total">
                      <td>{date(to)}</td>
                      <td />
                      <td>Closing balance</td>
                      <td />
                      <td className="right mono">{money(l.total_debit)}</td>
                      <td className="right mono">{money(l.total_credit)}</td>
                      <td className="right mono">{drCr(l.closing, kind)}</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {ledger.loading && !l ? <p className="panel-body muted small">Loading…</p> : null}
          </Panel>
        </>
      )}
    </>
  );
}

const SOURCES: [string, string][] = [
  ["", "All entries"],
  ["fees_raised", "Fees raised"],
  ["fee_receipt", "Fee receipts"],
  ["refund", "Refunds"],
  ["other_income", "Other income"],
  ["store_sale", "Store sales"],
  ["expense", "Expenses"],
  ["vendor_bill", "Supplier bills"],
  ["vendor_payment", "Supplier payments"],
  ["payroll", "Payroll"],
  ["journal", "Journal vouchers"],
];

/** NEW-1053: the day book — every posting in date order, both sides shown. */
export function DayBook() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoToday());
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const r = useApi<Book>(`${BOOKS}/day-book`, { from, to, source: source || undefined, page, page_size: 100 });
  const d = r.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / d.page_size)) : 1;
  return (
    <>
      <div className="filterbar">
        <select aria-label="Kind of entry" value={source} onChange={(e) => (setSource(e.target.value), setPage(1))}>
          {SOURCES.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Period from={from} to={to} onChange={(f, t) => (setFrom(f), setTo(t), setPage(1))} />
      </div>
      <ErrorNote>{r.error}</ErrorNote>
      <Panel
        title="Day book"
        sub={d ? `${d.total} entries · ${money(d.total_debit)} debited and credited` : "Every entry, both sides"}
        action={<ReportActions filename={`day-book_${from}_${to}.csv`} />}
        flush
      >
        <div className="table-wrap">
          <table className="data-table books-table" data-caption={`Day book ${from} to ${to}`}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher</th>
                <th>Particulars</th>
                <th>Account</th>
                <th className="right">Debit</th>
                <th className="right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {(d?.items ?? []).map((e, i) => (
                <Fragment key={i}>
                  {e.lines.map((ln, j) => (
                    <tr key={j} className={j === e.lines.length - 1 ? "books-entry-end" : ""}>
                      <td>{j === 0 ? date(e.date) : ""}</td>
                      <td>{j === 0 ? <Voucher source={e.source} id={e.source_id} voucher={e.voucher} /> : ""}</td>
                      <td className="wrap">
                        {j === 0 ? (
                          <>
                            {e.narration}
                            <small className="muted" style={{ display: "block" }}>
                              {e.source_label}
                            </small>
                          </>
                        ) : (
                          ""
                        )}
                      </td>
                      <td className={Number(ln.credit) ? "books-cr" : ""}>{`${ln.account_code} · ${ln.account_name}`}</td>
                      <td className="right mono">{amt(ln.debit)}</td>
                      <td className="right mono">{amt(ln.credit)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {d && !d.items.length ? (
                <tr>
                  <td colSpan={6} className="muted">
                    Nothing was posted in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {r.loading && !d ? <p className="panel-body muted small">Loading…</p> : null}
        {pages > 1 ? (
          <div className="panel-body row" style={{ justifyContent: "flex-end", gap: 8 }}>
            <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span className="small muted">{`Page ${page} of ${pages}`}</span>
            <button type="button" className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        ) : null}
      </Panel>
    </>
  );
}
