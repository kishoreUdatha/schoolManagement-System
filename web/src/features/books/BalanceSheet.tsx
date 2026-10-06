"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { ErrorNote } from "@/components/ui/states";
import { errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { downloadAuthed, isoToday } from "@/features/fees/common";
import { BOOKS, DimFilters, fyStart, KIND_LABEL, LedgerLink } from "./common";
import { BANK, BARS, COINS, n2, PDF, PERCENT, PRINT, RESET, XLS } from "./parts";
import type { BalanceSheet as Sheet, BSSection } from "./types";

const rupees = (v: string | number | null | undefined) => `₹ ${n2(v, "0.00")}`;

/**
 * NEW-1057: balance sheet on a date. GET /school/books/balance-sheet (+ .xlsx,
 * .pdf) with as_of and account_id. Each side in lettered sections; every line
 * has a schedule number, which opens its ledger. Capital and the surplus close
 * the liabilities side. A filter takes effect as soon as it changes.
 */
export function BalanceSheet() {
  const [asOf, setAsOf] = useState(isoToday());
  const [account, setAccount] = useState("");
  const [branch, setBranch] = useState("");
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState("");
  const params = { as_of: asOf, account_id: account || undefined, branch_id: branch || undefined, department_id: department || undefined };
  const r = useApi<Sheet>(`${BOOKS}/balance-sheet`, params);
  const d = r.data;
  const from = d?.year_from ?? fyStart(asOf);

  async function download(kind: "xlsx" | "pdf") {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    setBusy(kind);
    try {
      await downloadAuthed(`${BOOKS}/balance-sheet.${kind}?${q}`, `balance-sheet_${asOf}.${kind}`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy("");
    }
  }

  const side = (title: string, tone: "assets" | "liabs", icon: JSX.Element, sections: BSSection[], total: string, footer: string) => (
    <section className={`bs-side ${tone}`}>
      <div className="bs-side-head">
        <span className="bs-side-ico">{icon}</span>
        <h2>{title}</h2>
        <strong>{d ? rupees(total) : "…"}</strong>
      </div>
      <div className="table-wrap">
        <table className="data-table bs-table" data-caption={`Balance sheet ${asOf}: ${title}`}>
          <thead>
            <tr>
              <th style={{ width: 64 }}>Code</th>
              <th>Particulars</th>
              <th className="center" style={{ width: 90 }}>
                Schedule
              </th>
              <th className="num" style={{ width: 150 }}>
                Amount (₹)
              </th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => (
              <Fragment key={sec.key + sec.title}>
                <tr className="bs-section">
                  <td>{sec.key}</td>
                  <td>{sec.title.toUpperCase()}</td>
                  <td />
                  <td className="num">{n2(sec.total, "0.00")}</td>
                </tr>
                {sec.rows.map((x) => (
                  <tr key={x.ref}>
                    <td className="muted">{x.ref}</td>
                    <td className="bs-name">
                      {x.account_id ? (
                        <LedgerLink id={x.account_id} from={from} to={asOf}>
                          {x.name}
                        </LedgerLink>
                      ) : (
                        <Link href={routeOf(1056)}>{x.name}</Link>
                      )}
                    </td>
                    <td className="center">
                      {x.account_id && x.schedule ? (
                        <LedgerLink id={x.account_id} from={from} to={asOf}>
                          {String(x.schedule)}
                        </LedgerLink>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="num">{n2(x.amount, "0.00")}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {d && !sections.length ? (
              <tr>
                <td />
                <td colSpan={3} className="muted">
                  Nothing on this side on {date(asOf)}.
                </td>
              </tr>
            ) : null}
            {!d ? (
              <tr>
                <td colSpan={4} className="muted">
                  {r.loading ? "Loading…" : "No figures."}
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="bs-foot">
              <td colSpan={3}>{footer}</td>
              <td className="num">{d ? rupees(total) : ""}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );

  const ratio = d?.current_ratio;
  return (
    <>
      <div className="ie-filters bs-filters">
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
            {(["asset", "liability", "equity"] as const).map((k) => (
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
        <div className="ie-actions bs-exports">
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

      <div className="ie-cards bs-cards">
        <div className="ie-card net">
          <span className="ie-card-ico">{BANK}</span>
          <div>
            <p>Total assets</p>
            <strong>{d ? rupees(d.total_assets) : "…"}</strong>
          </div>
        </div>
        <div className="ie-card expense">
          <span className="ie-card-ico">{COINS}</span>
          <div>
            <p>Total liabilities</p>
            <strong>{d ? rupees(d.total_liabilities) : "…"}</strong>
          </div>
        </div>
        <div className="ie-card income">
          <span className="ie-card-ico">{BARS}</span>
          <div>
            <p>Net assets (surplus)</p>
            <strong>{d ? rupees(d.net_assets) : "…"}</strong>
          </div>
        </div>
        <div className="ie-card ratio" title="Current assets ÷ current liabilities. Above 1 means the school can meet what falls due soon.">
          <span className="ie-card-ico">{PERCENT}</span>
          <div>
            <p>Current ratio</p>
            <strong>{d ? (ratio == null ? "—" : ratio.toFixed(2)) : "…"}</strong>
          </div>
        </div>
      </div>

      <ErrorNote>{r.error}</ErrorNote>
      <div className="bs-grid">
        {side("Assets", "assets", BANK, d?.asset_sections ?? [], d?.total_assets ?? "0", "TOTAL ASSETS")}
        {side("Liabilities & funds", "liabs", COINS, d?.liability_sections ?? [], d?.total_funds ?? "0", "TOTAL LIABILITIES & FUNDS")}
      </div>
      <p className="ie-note muted small">
        {d ? (d.balanced ? "Both sides agree. " : "The two sides do not agree — check the trial balance. ") : ""}
        {ratio == null && d ? "Current ratio needs current liabilities; there are none on this date. " : ""}
        Click a line or its schedule number for the ledger. Record buildings, equipment, loans and opening bank balances with a journal voucher.
      </p>
    </>
  );
}
