"use client";

import { Fragment, useCallback, useState } from "react";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { isoToday } from "@/features/fees/common";
import { amt, BOOKS, fyStart, KIND_LABEL, KINDS, LedgerLink, Period, ReportActions, useOpenOnYear } from "./common";
import type { StatementRow, TrialBalance as TB } from "./types";

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
