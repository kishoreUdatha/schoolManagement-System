"use client";

import Link from "next/link";
import { useState } from "react";
import { ErrorNote } from "@/components/ui/states";
import { errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { downloadAuthed, isoToday } from "@/features/fees/common";
import { BOOKS, DimFilters, KIND_LABEL, KINDS, sourceHref } from "./common";
import { ARROW_DOWN, ARROW_UP, CALENDAR, DOC, n2, PDF, PRINT, RESET, XLS } from "./parts";
import type { DayBook as Book } from "./types";

const PAGE = 10;
const TYPES = ["Receipt", "Payment", "Contra", "Journal"] as const;
const dmy = (iso: string) => iso.split("-").reverse().join("-");

/**
 * NEW-1053: the day book for one date. GET /school/books/day-book (+ .xlsx,
 * .pdf) with from = to = the date, voucher_type, account_id, branch_id and
 * department_id. One row per voucher: a receipt shows what the money came in
 * against (credit), a payment what it paid for (debit), a contra cash moved
 * to or from the bank, a journal its full amount both sides. A filter takes
 * effect as soon as it changes.
 */
export function DayBook() {
  const [day, setDay] = useState(isoToday());
  const [type, setType] = useState("");
  const [account, setAccount] = useState("");
  const [branch, setBranch] = useState("");
  const [department, setDepartment] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  const filters = {
    from: day,
    to: day,
    voucher_type: type || undefined,
    account_id: account || undefined,
    branch_id: branch || undefined,
    department_id: department || undefined,
  };
  const r = useApi<Book>(`${BOOKS}/day-book`, { ...filters, page, page_size: PAGE });
  const d = r.data;
  const pages = d ? Math.max(1, Math.ceil(d.total / PAGE)) : 1;
  const net = Number(d?.net ?? 0);
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  async function download(kind: "xlsx" | "pdf") {
    const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
    setBusy(kind);
    try {
      await downloadAuthed(`${BOOKS}/day-book.${kind}?${q}`, `day-book_${day}.${kind}`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="ie-filters">
        <label>
          Date
          <input type="date" value={day} required onChange={(e) => e.target.value && change(setDay)(e.target.value)} />
        </label>
        <label>
          Voucher type
          <select value={type} onChange={(e) => change(setType)(e.target.value)}>
            <option value="">All</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <DimFilters branch={branch} department={department} onBranch={change(setBranch)} onDepartment={change(setDepartment)} />
        <label>
          Account head
          <select value={account} onChange={(e) => change(setAccount)(e.target.value)}>
            <option value="">All account heads</option>
            {KINDS.map((k) => (
              <optgroup key={k} label={KIND_LABEL[k]}>
                {(d?.accounts ?? [])
                  .filter((a) => a.kind === k)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {`${a.code} · ${a.name}`}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setDay(isoToday());
            setType("");
            setAccount("");
            setBranch("");
            setDepartment("");
            setPage(1);
          }}
        >
          {RESET}
          Reset
        </button>
      </div>

      <div className="ie-cards bs-cards">
        <div className="ie-card net">
          <span className="ie-card-ico">{CALENDAR}</span>
          <div>
            <p>Total vouchers</p>
            <strong>{d ? d.total.toLocaleString("en-IN") : "…"}</strong>
          </div>
        </div>
        <div className="ie-card income">
          <span className="ie-card-ico">{ARROW_DOWN}</span>
          <div>
            <p>Total debit</p>
            <strong>{d ? `₹ ${n2(d.total_debit, "0.00")}` : "…"}</strong>
          </div>
        </div>
        <div className="ie-card expense">
          <span className="ie-card-ico">{ARROW_UP}</span>
          <div>
            <p>Total credit</p>
            <strong>{d ? `₹ ${n2(d.total_credit, "0.00")}` : "…"}</strong>
          </div>
        </div>
        <div className="ie-card ratio">
          <span className="ie-card-ico">{DOC}</span>
          <div>
            <p>{`Net balance (${net < 0 ? "Debit" : "Credit"})`}</p>
            <strong>{d ? `₹ ${n2(Math.abs(net), "0.00")}` : "…"}</strong>
          </div>
        </div>
      </div>

      <ErrorNote>{r.error}</ErrorNote>
      <section className="panel ie-panel">
        <div className="ie-head">
          <h2>
            Day Book <span className="muted">{`(${date(day)})`}</span>
          </h2>
          <div className="ie-actions">
            <button type="button" className="btn" disabled={!d || Boolean(busy)} onClick={() => download("xlsx")}>
              {XLS}
              {busy === "xlsx" ? "Preparing…" : "Export Excel"}
            </button>
            <button type="button" className="btn" disabled={!d || Boolean(busy)} onClick={() => download("pdf")}>
              {PDF}
              {busy === "pdf" ? "Preparing…" : "Export PDF"}
            </button>
            <button type="button" className="btn" onClick={() => window.print()}>
              {PRINT}
              Print
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table ie-table lg-table" data-caption={`Day book ${day}`}>
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>Date</th>
                <th>Voucher No.</th>
                <th>Voucher Type</th>
                <th>Particulars</th>
                <th>Account Head</th>
                <th>Branch / Campus</th>
                <th className="num">Debit (₹)</th>
                <th className="num">Credit (₹)</th>
              </tr>
            </thead>
            <tbody>
              {(d?.items ?? []).map((v, i) => {
                const href = sourceHref(v.source, v.source_id);
                return (
                  <tr key={i}>
                    <td className="muted">{(page - 1) * PAGE + i + 1}</td>
                    <td>{dmy(v.date)}</td>
                    <td>{v.voucher ? href ? <Link href={href}>{v.voucher}</Link> : v.voucher : "-"}</td>
                    <td>{v.voucher_type}</td>
                    <td className="wrap" title={v.lines.map((l) => `${Number(l.debit) ? "Dr" : "Cr"} ${l.account_name} ${n2(Number(l.debit) || l.credit)}`).join("\n")}>
                      {v.particulars}
                    </td>
                    <td>{v.account_head}</td>
                    <td>{v.branch ?? "-"}</td>
                    <td className="num">{n2(v.debit)}</td>
                    <td className="num">{n2(v.credit)}</td>
                  </tr>
                );
              })}
              {d && !d.items.length ? (
                <tr>
                  <td />
                  <td colSpan={8} className="muted">
                    {`Nothing was posted on ${date(day)}.`}
                  </td>
                </tr>
              ) : null}
              {!d ? (
                <tr>
                  <td colSpan={9} className="muted">
                    {r.loading ? "Loading…" : "No figures."}
                  </td>
                </tr>
              ) : (
                <tr className="ie-grand">
                  <td colSpan={7} className="center">
                    Total
                  </td>
                  <td className="num">{n2(d.total_debit, "0.00")}</td>
                  <td className="num">{n2(d.total_credit, "0.00")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="lg-foot">
          <span className="muted small">{d ? `Showing ${d.total ? (page - 1) * PAGE + 1 : 0} to ${Math.min(page * PAGE, d.total)} of ${d.total} entries` : ""}</span>
          <div className="lg-pager">
            <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1)
              .map((p) => (
                <button key={p} type="button" className={`btn ${p === page ? "primary" : ""}`} onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
            <button type="button" className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
