"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { ErrorNote } from "@/components/ui/states";
import { errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { downloadAuthed, isoToday } from "@/features/fees/common";
import { BOOKS, DimFilters, fyStart, KIND_LABEL, KINDS, sourceHref, useOpenOnYear, useYearPeriods } from "./common";
import { ARROW_DOWN, ARROW_UP, n2, PDF, PEOPLE, PRINT, RESET, SWAP, XLS } from "./parts";
import type { Account, Ledger as L } from "./types";

const PAGE = 25;

/** "2026-04-01" -> "01-04-2026", as the ledger prints dates. */
const dmy = (iso: string) => iso.split("-").reverse().join("-");

/**
 * NEW-1054: one account's ledger. GET /school/books/accounts/{id}/ledger (+ .xlsx,
 * .pdf) with from and to; ?account=&from=&to= opens it from a statement. The
 * opening row carries in what came before From; each line's balance is the
 * running total. A filter takes effect as soon as it changes.
 */
export function GeneralLedger() {
  const params = useSearchParams();
  const router = useRouter();
  const [from, setFrom] = useState(params.get("from") ?? fyStart());
  const [to, setTo] = useState(params.get("to") ?? isoToday());
  const [account, setAccount] = useState<number | "">(Number(params.get("account")) || "");
  const [page, setPage] = useState(1);
  const [branch, setBranch] = useState("");
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState("");
  const { current } = useYearPeriods();

  // dates passed in from a statement win over the academic year
  const fromLink = params.get("from") !== null;
  useOpenOnYear(
    useCallback(
      (f: string, t: string) => {
        if (!fromLink) (setFrom(f), setTo(t));
      },
      [fromLink],
    ),
  );

  const accounts = useApi<Account[]>(`${BOOKS}/accounts`);
  const dimParams = { branch_id: branch || undefined, department_id: department || undefined };
  const r = useApi<L>(account ? `${BOOKS}/accounts/${account}/ledger` : null, { from, to, ...dimParams });
  const d = r.data && r.data.account.id === account ? r.data : null;

  const go = (id: number | "", f = from, t = to) => {
    setPage(1);
    router.replace(`${routeOf(1054)}${id ? `?account=${id}&from=${f}&to=${t}` : ""}`);
  };
  const pick = (id: number | "") => {
    setAccount(id);
    go(id);
  };
  const dates = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
    if (account) go(account, f, t);
  };

  async function download(kind: "xlsx" | "pdf") {
    if (!d) return;
    setBusy(kind);
    try {
      const q = new URLSearchParams(Object.entries({ from, to, ...dimParams }).filter(([, v]) => v) as [string, string][]);
      await downloadAuthed(`${BOOKS}/accounts/${account}/ledger.${kind}?${q}`, `ledger_${d.account.code}_${from}_${to}.${kind}`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy("");
    }
  }

  const lines = d?.lines ?? [];
  const pages = Math.max(1, Math.ceil(lines.length / PAGE));
  const shown = lines.slice((page - 1) * PAGE, page * PAGE);
  const closingSide = d?.closing_side === "Dr" ? "(Debit)" : d?.closing_side === "Cr" ? "(Credit)" : "";

  return (
    <>
      <div className="ie-filters lg-filters">
        <label>
          <span>
            Account head <span className="req">*</span>
          </span>
          <span className="lg-pick">
            <select value={account} required onChange={(e) => pick(e.target.value ? Number(e.target.value) : "")}>
              <option value="">Choose an account</option>
              {KINDS.map((k) => {
                const list = (accounts.data ?? []).filter((a) => a.kind === k && (a.is_active || a.id === account));
                return list.length ? (
                  <optgroup key={k} label={KIND_LABEL[k]}>
                    {list.map((a) => (
                      <option key={a.id} value={a.id}>
                        {`${a.name} (${a.code})`}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
            {account ? (
              <button type="button" className="lg-clear" aria-label="Clear the account" onClick={() => pick("")}>
                ×
              </button>
            ) : null}
          </span>
        </label>
        <DimFilters
          branch={branch}
          department={department}
          onBranch={(v) => (setBranch(v), setPage(1))}
          onDepartment={(v) => (setDepartment(v), setPage(1))}
        />
        <label>
          Date from
          <input type="date" value={from} max={to} required onChange={(e) => e.target.value && dates(e.target.value, to)} />
        </label>
        <label>
          Date to
          <input type="date" value={to} min={from} required onChange={(e) => e.target.value && dates(from, e.target.value)} />
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setBranch("");
            setDepartment("");
            dates(current?.[0] ?? fyStart(), current?.[1] ?? isoToday());
          }}
        >
          {RESET}
          Reset
        </button>
        {d ? (
          <p className="lg-meta">
            <span>{`Code ${d.account.code}`}</span>
            <span>{d.account.category}</span>
            <span>{`Opening ₹ ${n2(d.opening, "0.00")}`}</span>
          </p>
        ) : null}
      </div>
      <ErrorNote>{accounts.error ?? r.error}</ErrorNote>

      {!account ? (
        <section className="panel">
          <div className="panel-body">
            <p className="muted small">Choose an account head to see every entry in it, with the balance after each one.</p>
          </div>
        </section>
      ) : (
        <>
          <div className="ie-cards bs-cards">
            <div className="ie-card income">
              <span className="ie-card-ico">{ARROW_DOWN}</span>
              <div>
                <p>Total debit</p>
                <strong>{d ? `₹ ${n2(d.total_debit, "0.00")}` : "…"}</strong>
                <small>{d ? `${d.debit_count} transaction${d.debit_count === 1 ? "" : "s"}` : ""}</small>
              </div>
            </div>
            <div className="ie-card ratio">
              <span className="ie-card-ico">{ARROW_UP}</span>
              <div>
                <p>Total credit</p>
                <strong>{d ? `₹ ${n2(d.total_credit, "0.00")}` : "…"}</strong>
                <small>{d ? `${d.credit_count} transaction${d.credit_count === 1 ? "" : "s"}` : ""}</small>
              </div>
            </div>
            <div className="ie-card amber">
              <span className="ie-card-ico">{SWAP}</span>
              <div>
                <p>Closing balance</p>
                <strong>{d ? `₹ ${n2(Math.abs(Number(d.closing)), "0.00")}` : "…"}</strong>
                <small>{closingSide}</small>
              </div>
            </div>
            <div className="ie-card expense">
              <span className="ie-card-ico">{PEOPLE}</span>
              <div>
                <p>Total students</p>
                <strong>{d ? (d.students ? d.students.toLocaleString("en-IN") : "—") : "…"}</strong>
                <small>{d ? (d.students ? "Unique students" : "No student entries") : ""}</small>
              </div>
            </div>
          </div>

          <section className="panel ie-panel">
            <div className="table-wrap">
              <table className="data-table ie-table lg-table" data-caption={d ? `Ledger ${d.account.code} ${d.account.name} ${from} to ${to}` : ""}>
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>#</th>
                    <th>Date</th>
                    <th>Voucher No.</th>
                    <th>Student Name</th>
                    <th>Particulars</th>
                    <th>Reference</th>
                    <th className="num">Debit (₹)</th>
                    <th className="num">Credit (₹)</th>
                    <th className="num">Balance (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {page === 1 ? (
                    <tr>
                      <td className="muted">1</td>
                      <td>{dmy(from)}</td>
                      <td>OPENING</td>
                      <td>-</td>
                      <td>Opening Balance</td>
                      <td>-</td>
                      <td className="num">-</td>
                      <td className="num">-</td>
                      <td className="num">{d ? n2(d.opening, "0.00") : ""}</td>
                    </tr>
                  ) : null}
                  {shown.map((x, i) => {
                    const href = sourceHref(x.source, x.source_id);
                    return (
                      <tr key={i}>
                        <td className="muted">{(page - 1) * PAGE + i + 2}</td>
                        <td>{dmy(x.date)}</td>
                        <td>{x.voucher ? href ? <Link href={href}>{x.voucher}</Link> : x.voucher : "-"}</td>
                        <td>{x.student ?? "-"}</td>
                        <td className="wrap" title={x.against.length ? `Against: ${x.against.join(", ")}` : undefined}>
                          {x.particulars}
                        </td>
                        <td>{x.source_label}</td>
                        <td className="num">{n2(x.debit)}</td>
                        <td className="num">{n2(x.credit)}</td>
                        <td className="num">{n2(x.balance, "0.00")}</td>
                      </tr>
                    );
                  })}
                  {d && !lines.length ? (
                    <tr>
                      <td />
                      <td colSpan={8} className="muted">
                        No entries in these dates.
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
                      <td colSpan={6} className="center">
                        Total
                      </td>
                      <td className="num">{n2(d.total_debit, "0.00")}</td>
                      <td className="num">{n2(d.total_credit, "0.00")}</td>
                      <td className="num">{n2(d.closing, "0.00")}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="lg-foot">
              <span className="muted small">{d ? `Showing ${lines.length ? (page - 1) * PAGE + 1 : 0} to ${Math.min(page * PAGE, lines.length)} of ${lines.length} entries` : ""}</span>
              <div className="lg-pager">
                <button type="button" className="btn" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  ‹
                </button>
                {Array.from({ length: pages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1)
                  .map((p) => (
                    <button key={p} type="button" className={`btn ${p === page ? "primary" : ""}`} onClick={() => setPage(p)}>
                      {p}
                    </button>
                  ))}
                <button type="button" className="btn" aria-label="Next page" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                  ›
                </button>
              </div>
              <div className="ie-actions lg-exports">
                <button type="button" className="btn xls" disabled={!d || Boolean(busy)} onClick={() => download("xlsx")}>
                  {XLS}
                  {busy === "xlsx" ? "Preparing…" : "Export Excel"}
                </button>
                <button type="button" className="btn pdf" disabled={!d || Boolean(busy)} onClick={() => download("pdf")}>
                  {PDF}
                  {busy === "pdf" ? "Preparing…" : "Export PDF"}
                </button>
                <button type="button" className="btn" onClick={() => window.print()}>
                  {PRINT}
                  Print
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
