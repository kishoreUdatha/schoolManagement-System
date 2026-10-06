"use client";

import { useState } from "react";
import { ErrorNote } from "@/components/ui/states";
import { errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { downloadAuthed, isoToday } from "@/features/fees/common";
import { BOOKS, DimFilters, fyStart, KIND_LABEL, KINDS, LedgerLink } from "./common";
import { n2, PDF, PRINT, RESET, XLS } from "./parts";
import type { TrialBalance as TB } from "./types";

const COLS = ["opening_debit", "opening_credit", "debit", "credit", "closing_debit", "closing_credit"] as const;

/**
 * NEW-1055: trial balance as on a date. GET /school/books/trial-balance (+ .xlsx,
 * .pdf) with from = 1 April of that year, to = the date, and account_id.
 * Opening is the balance on 1 April, transactions run from then to the date.
 * A filter takes effect as soon as it changes.
 */
export function TrialBalance() {
  const [asOf, setAsOf] = useState(isoToday());
  const [account, setAccount] = useState("");
  const [branch, setBranch] = useState("");
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState("");
  const from = fyStart(asOf);
  const params = { from, to: asOf, account_id: account || undefined, branch_id: branch || undefined, department_id: department || undefined };
  const r = useApi<TB>(`${BOOKS}/trial-balance`, params);
  const d = r.data;

  async function download(kind: "xlsx" | "pdf") {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    setBusy(kind);
    try {
      await downloadAuthed(`${BOOKS}/trial-balance.${kind}?${q}`, `trial-balance_${asOf}.${kind}`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="ie-filters tb-filters">
        <label>
          As on date
          <input type="date" value={asOf} required onChange={(e) => e.target.value && setAsOf(e.target.value)} />
        </label>
        <DimFilters
          branch={branch}
          department={department}
          onBranch={(v) => setBranch(v)}
          onDepartment={(v) => setDepartment(v)}
        />
        <label>
          Account head
          <select value={account} onChange={(e) => setAccount(e.target.value)}>
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
            setAsOf(isoToday());
            setAccount("");
            setBranch("");
            setDepartment("");
          }}
        >
          {RESET}
          Reset
        </button>
      </div>

      <ErrorNote>{r.error}</ErrorNote>
      <section className="panel ie-panel">
        <div className="ie-head">
          <h2>
            Trial Balance <span className="muted">{`(As on ${date(asOf)})`}</span>
            {d ? <span className={`badge ${d.balanced ? "" : "bad"} tb-badge`}>{d.balanced ? "Debits equal credits" : `Out by ₹ ${n2(Math.abs(Number(d.difference)), "0.00")}`}</span> : null}
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
          <table className="data-table ie-table tb-table" data-caption={`Trial balance as on ${asOf}`}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ width: 44 }}>
                  #
                </th>
                <th rowSpan={2}>Account Code</th>
                <th rowSpan={2}>Account Head</th>
                <th rowSpan={2}>Account Group</th>
                <th colSpan={2} className="center tb-group">
                  Opening Balance (₹)
                </th>
                <th colSpan={2} className="center tb-group">
                  Transactions (₹)
                </th>
                <th colSpan={2} className="center tb-group">
                  Closing Balance (₹)
                </th>
              </tr>
              <tr>
                {COLS.map((c) => (
                  <th key={c} className="num">
                    {c.endsWith("debit") ? "Dr" : "Cr"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(d?.rows ?? []).map((x, i) => (
                <tr key={x.account_id}>
                  <td className="muted">{i + 1}</td>
                  <td>{x.code}</td>
                  <td>
                    <LedgerLink id={x.account_id} from={from} to={asOf}>
                      {x.name}
                    </LedgerLink>
                  </td>
                  <td>{x.category}</td>
                  {COLS.map((c) => (
                    <td key={c} className={`num ${c.startsWith("closing") && Number(x[c]) ? "strong" : ""}`}>
                      {n2(x[c])}
                    </td>
                  ))}
                </tr>
              ))}
              {d && !d.rows.length ? (
                <tr>
                  <td colSpan={10} className="muted">
                    Nothing posted up to {date(asOf)}.
                  </td>
                </tr>
              ) : null}
              {!d ? (
                <tr>
                  <td colSpan={10} className="muted">
                    {r.loading ? "Loading…" : "No figures."}
                  </td>
                </tr>
              ) : (
                <tr className="ie-grand">
                  <td colSpan={4} className="center">
                    Grand Total
                  </td>
                  {COLS.map((c) => (
                    <td key={c} className="num">
                      {n2(d.totals[c], "0.00")}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="ie-note muted small">
          {`Opening is the balance on ${date(from)}; transactions run from ${date(from)} to ${date(asOf)}. Click an account head for its ledger.`}
        </p>
      </section>
    </>
  );
}
