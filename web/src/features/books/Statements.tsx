"use client";

import { Fragment, useCallback, useState } from "react";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { isoToday } from "@/features/fees/common";
import { amt, BOOKS, fyStart, KIND_LABEL, KINDS, LedgerLink, Period, ReportActions, useOpenOnYear } from "./common";
import type { BalanceSheet as Sheet, StatementRow, TrialBalance as TB } from "./types";

type Section = { title: string; rows: StatementRow[]; total: string; totalLabel: string };

/** One statement as one table: sections of accounts, each with its total. */
function StatementTable({ caption, sections, from, to, footer }: { caption: string; sections: Section[]; from: string; to: string; footer?: [string, string][] }) {
  return (
    <div className="table-wrap">
      <table className="data-table books-table" data-caption={caption}>
        <thead>
          <tr>
            <th style={{ width: 90 }}>Code</th>
            <th>Account</th>
            <th className="right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sections.map((s) => (
            <Fragment key={s.title}>
              <tr className="books-head">
                <td colSpan={3}>{s.title}</td>
              </tr>
              {s.rows.map((r) => (
                <tr key={r.account_id}>
                  <td className="muted">{r.code}</td>
                  <td>
                    <LedgerLink id={r.account_id} from={from} to={to}>
                      {r.name}
                    </LedgerLink>
                  </td>
                  <td className="right mono">{money(r.amount)}</td>
                </tr>
              ))}
              {!s.rows.length ? (
                <tr>
                  <td />
                  <td className="muted">Nothing recorded</td>
                  <td />
                </tr>
              ) : null}
              <tr className="books-sub">
                <td />
                <td>{s.totalLabel}</td>
                <td className="right mono">{money(s.total)}</td>
              </tr>
            </Fragment>
          ))}
          {(footer ?? []).map(([k, v]) => (
            <tr key={k} className="books-total">
              <td />
              <td>{k}</td>
              <td className="right mono">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** NEW-1057: balance sheet on a date. */
export function BalanceSheet() {
  const [asOf, setAsOf] = useState(isoToday());
  const r = useApi<Sheet>(`${BOOKS}/balance-sheet`, { as_of: asOf });
  const d = r.data;
  const from = d?.year_from ?? fyStart(asOf);
  const surplusRows: StatementRow[] = d
    ? [
        { account_id: -1, code: "", name: "Surplus of earlier years", amount: d.surplus_previous_years },
        { account_id: -2, code: "", name: "Surplus of this year", amount: d.surplus_this_year },
      ].filter((x) => Number(x.amount))
    : [];
  return (
    <>
      <StatStrip
        compact
        items={[
          { label: "Assets", value: d ? money(d.total_assets) : "…", note: "What the school owns and is owed" },
          { label: "Liabilities", value: d ? money(d.total_liabilities) : "…", note: "What the school owes" },
          { label: "Funds", value: d ? money(Number(d.total_equity) + Number(d.surplus_previous_years) + Number(d.surplus_this_year)) : "…", note: "Capital and surplus" },
        ]}
      />
      <div className="filterbar">
        <label className="row small" style={{ gap: 8 }}>
          As on
          <input type="date" aria-label="As on" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} />
        </label>
        {d && !d.balanced ? <span className="badge bad">Does not balance</span> : d ? <span className="badge">Balances</span> : null}
      </div>
      <ErrorNote>{r.error}</ErrorNote>
      <div className="two-equal">
        <Panel title="Liabilities and funds" sub={`As on ${date(asOf)}`} action={<ReportActions filename={`balance-sheet_${asOf}.csv`} />} flush>
          {d ? (
            <StatementTable
              caption={`Balance sheet as on ${asOf}: liabilities and funds`}
              from={from}
              to={asOf}
              sections={[
                { title: "Capital and funds", rows: d.equity, total: d.total_equity, totalLabel: "Total capital" },
                {
                  title: "Income over expenditure",
                  rows: surplusRows,
                  total: String(Number(d.surplus_previous_years) + Number(d.surplus_this_year)),
                  totalLabel: "Total surplus",
                },
                { title: "Liabilities", rows: d.liabilities, total: d.total_liabilities, totalLabel: "Total liabilities" },
              ]}
              footer={[["Total", money(d.total_funds)]]}
            />
          ) : (
            <p className="panel-body muted small">{r.loading ? "Loading…" : "No figures."}</p>
          )}
        </Panel>
        <Panel title="Assets" sub={`As on ${date(asOf)}`} flush>
          {d ? (
            <StatementTable
              caption={`Balance sheet as on ${asOf}: assets`}
              from={from}
              to={asOf}
              sections={[{ title: "Assets", rows: d.assets, total: d.total_assets, totalLabel: "Total assets" }]}
              footer={[["Total", money(d.total_assets)]]}
            />
          ) : null}
        </Panel>
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        A negative fees receivable means parents have paid ahead of the due dates. Record buildings, equipment, loans and bank opening balances with a journal voucher.
      </p>
    </>
  );
}

/** NEW-1055: trial balance — opening, movement and closing per account. */
export function TrialBalance() {
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(isoToday());
  useOpenOnYear(useCallback((f: string, t: string) => (setFrom(f), setTo(t)), []));
  const r = useApi<TB>(`${BOOKS}/trial-balance`, { from, to });
  const d = r.data;
  const t = d?.totals;
  return (
    <>
      <div className="filterbar">
        <Period from={from} to={to} onChange={(f, tt) => (setFrom(f), setTo(tt))} />
        {d ? <span className={`badge ${d.balanced ? "" : "bad"}`}>{d.balanced ? "Debits equal credits" : "Does not balance"}</span> : null}
      </div>
      <ErrorNote>{r.error}</ErrorNote>
      <Panel
        title="Trial balance"
        sub={`${date(from)} – ${date(to)} · opening balances are everything before ${date(from)}`}
        action={<ReportActions filename={`trial-balance_${from}_${to}.csv`} />}
        flush
      >
        <div className="table-wrap">
          <table className="data-table books-table" data-caption={`Trial balance ${from} to ${to}`}>
            <thead>
              <tr>
                <th>Code</th>
                <th>Account</th>
                <th className="right">Opening Dr</th>
                <th className="right">Opening Cr</th>
                <th className="right">Debit</th>
                <th className="right">Credit</th>
                <th className="right">Closing Dr</th>
                <th className="right">Closing Cr</th>
              </tr>
            </thead>
            <tbody>
              {KINDS.map((k) => {
                const rows = (d?.rows ?? []).filter((x) => x.kind === k);
                return rows.length ? (
                  <Fragment key={k}>
                    <tr className="books-head">
                      <td colSpan={8}>{KIND_LABEL[k]}</td>
                    </tr>
                    {rows.map((x) => (
                      <tr key={x.account_id}>
                        <td className="muted">{x.code}</td>
                        <td>
                          <LedgerLink id={x.account_id} from={from} to={to}>
                            {x.name}
                          </LedgerLink>
                        </td>
                        <td className="right mono">{amt(x.opening_debit)}</td>
                        <td className="right mono">{amt(x.opening_credit)}</td>
                        <td className="right mono">{amt(x.debit)}</td>
                        <td className="right mono">{amt(x.credit)}</td>
                        <td className="right mono">{amt(x.closing_debit)}</td>
                        <td className="right mono">{amt(x.closing_credit)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ) : null;
              })}
              {d && !d.rows.length ? (
                <tr>
                  <td colSpan={8} className="muted">
                    Nothing posted up to {date(to)}.
                  </td>
                </tr>
              ) : null}
              {t ? (
                <tr className="books-total">
                  <td />
                  <td>Total</td>
                  <td className="right mono">{money(t.opening_debit)}</td>
                  <td className="right mono">{money(t.opening_credit)}</td>
                  <td className="right mono">{money(t.debit)}</td>
                  <td className="right mono">{money(t.credit)}</td>
                  <td className="right mono">{money(t.closing_debit)}</td>
                  <td className="right mono">{money(t.closing_credit)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {!d && r.loading ? <p className="panel-body muted small">Loading…</p> : null}
      </Panel>
    </>
  );
}
