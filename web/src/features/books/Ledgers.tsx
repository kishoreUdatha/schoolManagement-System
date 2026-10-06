"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { date, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { isoToday, monthStart } from "@/features/fees/common";
import { amt, BOOKS, DimFilters, Period, ReportActions, sourceHref } from "./common";
import type { DayBook as Book } from "./types";

function Voucher({ source, id, voucher }: { source: string; id: number | null; voucher: string | null }) {
  const href = sourceHref(source, id);
  if (!voucher) return <span className="muted">—</span>;
  return href ? <Link href={href}>{voucher}</Link> : <>{voucher}</>;
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
  const [branch, setBranch] = useState("");
  const [department, setDepartment] = useState("");
  const r = useApi<Book>(`${BOOKS}/day-book`, {
    from,
    to,
    source: source || undefined,
    page,
    page_size: 100,
    branch_id: branch || undefined,
    department_id: department || undefined,
  });
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
        <DimFilters
          branch={branch}
          department={department}
          onBranch={(v) => (setBranch(v), setPage(1))}
          onDepartment={(v) => (setDepartment(v), setPage(1))}
        />
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
