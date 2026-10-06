"use client";

import { Fragment, useCallback, useState, type ReactNode } from "react";
import { ErrorNote } from "@/components/ui/states";
import { errorText } from "@/lib/api";
import { date } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { downloadAuthed, isoToday } from "@/features/fees/common";
import { BOOKS, fyStart, LedgerLink, useOpenOnYear, useYearPeriods } from "./common";
import type { IERow, IncomeExpenditure as IE } from "./types";

/** 2140000 -> "21,40,000.00"; negatives in brackets; zero as `zero`. */
function n2(v: string | number | null | undefined, zero = "-"): string {
  const n = Number(v ?? 0);
  if (!n) return zero;
  const s = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${s})` : s;
}

type Filters = { from: string; to: string; category: string; account: string };
const initial = (): Filters => ({ from: fyStart(), to: isoToday(), category: "", account: "" });

const Svg = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" className="ico" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
const UP = (
  <Svg>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Svg>
);
const DOWN = (
  <Svg>
    <path d="M7 7l10 10" />
    <path d="M17 9v8H9" />
  </Svg>
);
const BARS = (
  <svg viewBox="0 0 24 24" className="ico" fill="currentColor" aria-hidden="true">
    <rect x="4" y="12" width="4" height="8" rx="1" />
    <rect x="10" y="7" width="4" height="13" rx="1" />
    <rect x="16" y="3" width="4" height="17" rx="1" />
  </svg>
);
const RESET = (
  <Svg>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Svg>
);
const PRINT = (
  <Svg>
    <path d="M6 9V3h12v6" />
    <rect x="3" y="9" width="18" height="8" rx="2" />
    <path d="M7 14h10v7H7z" />
  </Svg>
);
const XLS = (
  <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
    <rect x="2" y="3" width="20" height="18" rx="3" fill="#1d7a46" />
    <path d="m7 8 4 4-4 4m10-8-4 4 4 4" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
  </svg>
);
const PDF = (
  <svg viewBox="0 0 24 24" className="ico" aria-hidden="true">
    <path d="M5 2h10l5 5v15H5z" fill="none" stroke="#d93025" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M8 16c2-1 4-5 4-8 0 3 2 6 5 7-3 0-6 1-9 1z" fill="none" stroke="#d93025" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

/**
 * NEW-1056: income and expenditure account. GET /school/books/income-expenditure
 * (+ .xlsx, .pdf) with from, to, category and account_id. A filter takes effect
 * as soon as it changes. Opening is what each account built up from 1 April to the day before
 * From; the cards are the period's own income, expenditure and surplus.
 */
export function IncomeExpenditure() {
  // every change loads at once: there is no Apply step
  const [applied, setApplied] = useState<Filters>(initial);
  const { periods, current } = useYearPeriods();
  // open on the current academic year, the one the top bar shows
  const openOn = useCallback((from: string, to: string) => {
    setApplied((f) => ({ ...f, from, to }));
  }, []);
  useOpenOnYear(openOn);
  const fresh = (): Filters => ({ ...initial(), ...(current ? { from: current[0], to: current[1] } : {}) });
  const [busy, setBusy] = useState("");
  const params = { from: applied.from, to: applied.to, category: applied.category || undefined, account_id: applied.account || undefined };
  const r = useApi<IE>(`${BOOKS}/income-expenditure`, params);
  const d = r.data;
  const surplus = Number(d?.surplus ?? 0);
  const period = periods.find(([, f, t]) => f === applied.from && t === applied.to)?.[0] ?? "";

  async function download(kind: "xlsx" | "pdf") {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    setBusy(kind);
    try {
      await downloadAuthed(`${BOOKS}/income-expenditure.${kind}?${q}`, `income-expenditure_${applied.from}_${applied.to}.${kind}`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy("");
    }
  }

  let n = 0;
  const section = (title: string, rows: IERow[], totals: IE["income_totals"] | undefined, label: string) => (
    <Fragment key={title}>
      <tr className="ie-section">
        <td colSpan={8}>{title}</td>
      </tr>
      {rows.map((x) => (
        <tr key={x.account_id}>
          <td className="muted">{++n}</td>
          <td>{x.code}</td>
          <td>
            <LedgerLink id={x.account_id} from={applied.from} to={applied.to}>
              {x.name}
            </LedgerLink>
          </td>
          <td>{x.category}</td>
          <td className="num">{n2(x.opening, "0.00")}</td>
          <td className="num">{n2(x.debit)}</td>
          <td className="num">{n2(x.credit)}</td>
          <td className="num">{n2(x.closing, "0.00")}</td>
        </tr>
      ))}
      {!rows.length ? (
        <tr>
          <td />
          <td colSpan={7} className="muted">{`No ${title.toLowerCase()} in this period.`}</td>
        </tr>
      ) : null}
      <tr className="ie-total">
        <td colSpan={4} className="center">
          {label}
        </td>
        <td className="num">{n2(totals?.opening, "0.00")}</td>
        <td className="num">{n2(totals?.debit)}</td>
        <td className="num">{n2(totals?.credit)}</td>
        <td className="num">{n2(totals?.closing, "0.00")}</td>
      </tr>
    </Fragment>
  );

  return (
    <>
      <div className="ie-filters">
        <label>
          Academic year
          <select
            value={period}
            onChange={(e) => {
              const p = periods.find(([l]) => l === e.target.value);
              if (p) setApplied({ ...applied, from: p[1], to: p[2] });
            }}
          >
            {!period ? <option value="">Custom</option> : null}
            {periods.map(([l]) => (
              <option key={l} value={l}>
                {l.replace(/^Academic year /, "")}
              </option>
            ))}
          </select>
        </label>
        <label>
          From date
          <input type="date" value={applied.from} max={applied.to} required onChange={(e) => e.target.value && setApplied({ ...applied, from: e.target.value })} />
        </label>
        <label>
          To date
          <input type="date" value={applied.to} min={applied.from} required onChange={(e) => e.target.value && setApplied({ ...applied, to: e.target.value })} />
        </label>
        <label>
          Category
          <select value={applied.category} onChange={(e) => setApplied({ ...applied, category: e.target.value, account: "" })}>
            <option value="">All categories</option>
            {(d?.categories ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Account head
          <select value={applied.account} onChange={(e) => setApplied({ ...applied, account: e.target.value })}>
            <option value="">All account heads</option>
            {(["income", "expense"] as const).map((k) => (
              <optgroup key={k} label={k === "income" ? "Income" : "Expenditure"}>
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
            setApplied(fresh());
          }}
        >
          {RESET}
          Reset
        </button>
      </div>

      <div className="ie-cards">
        <div className="ie-card income">
          <span className="ie-card-ico">{UP}</span>
          <div>
            <p>Total income</p>
            <strong>{d ? `₹ ${n2(d.total_income, "0.00")}` : "…"}</strong>
          </div>
        </div>
        <div className="ie-card expense">
          <span className="ie-card-ico">{DOWN}</span>
          <div>
            <p>Total expenditure</p>
            <strong>{d ? `₹ ${n2(d.total_expenses, "0.00")}` : "…"}</strong>
          </div>
        </div>
        <div className={`ie-card net ${surplus < 0 ? "deficit" : ""}`}>
          <span className="ie-card-ico">{BARS}</span>
          <div>
            <p>{surplus < 0 ? "Deficit" : "Surplus / (Deficit)"}</p>
            <strong>{d ? `₹ ${n2(d.surplus, "0.00")}` : "…"}</strong>
          </div>
        </div>
      </div>

      <ErrorNote>{r.error}</ErrorNote>
      <section className="panel ie-panel">
        <div className="ie-head">
          <h2>
            Income and Expenditure Account <span className="muted">{`(${date(applied.from)} – ${date(applied.to)})`}</span>
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
          <table className="data-table ie-table" data-caption={`Income and expenditure ${applied.from} to ${applied.to}`}>
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th style={{ width: 90 }}>Code</th>
                <th>Account Head</th>
                <th>Category</th>
                <th className="num">Opening Balance (₹)</th>
                <th className="num">Debit (₹)</th>
                <th className="num">Credit (₹)</th>
                <th className="num">Closing Balance (₹)</th>
              </tr>
            </thead>
            <tbody>
              {d ? (
                <>
                  {section("INCOME", d.income, d.income_totals, "Total Income")}
                  {section("EXPENDITURE", d.expenses, d.expense_totals, "Total Expenditure")}
                  <tr className="ie-grand">
                    <td colSpan={4} className="center">
                      Grand Total (Surplus / Deficit)
                    </td>
                    <td className="num">{n2(d.opening_surplus, "0.00")}</td>
                    <td className="num">{n2(Number(d.income_totals.debit) + Number(d.expense_totals.debit))}</td>
                    <td className="num">{n2(Number(d.income_totals.credit) + Number(d.expense_totals.credit))}</td>
                    <td className="num">{n2(d.closing_surplus, "0.00")}</td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={8} className="muted">
                    {r.loading ? "Loading…" : "No figures."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="ie-note muted small">
          {`Fees count as income when they fall due. ${
            d && d.year_from < applied.from ? `Opening is what built up from ${date(d.year_from)} to the day before ${date(applied.from)}. ` : ""
          }Click an account head for its ledger.`}
        </p>
      </section>
    </>
  );
}
