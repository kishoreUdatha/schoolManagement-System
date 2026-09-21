"use client";

import { useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date, label, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { isoToday, modeLabel, monthStart } from "./common";
import { DateRange } from "./IncomeList";
import type { CashBook as Book } from "./types";

/**
 * SCR-170, live: GET /school/accounts/cash-book?from=&to= — money in and out
 * for the range, by day, by mode and by source. Every figure is the server's;
 * the running column only adds up the days shown.
 */
export function CashBook() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoToday());
  const [mode, setMode] = useState("");
  const book = useApi<Book>("/api/v1/school/accounts/cash-book", { from, to });
  const b = book.data;

  let running = 0;
  const rows: Row[] = (b?.daily ?? []).map((d) => {
    running += Number(d.in) - Number(d.out);
    return [date(d.date), "—", "Receipts and payments for the day", Number(d.in) ? money(d.in) : "—", Number(d.out) ? money(d.out) : "—", money(running)];
  });

  const modes = Object.entries(b?.by_mode ?? {});
  const shownModes = mode ? modes.filter(([k]) => k === mode) : modes;
  const net = Number(b?.net ?? 0);

  const stats = [
    { label: "Money in", value: b ? money(b.total_in) : "…", note: "Fees, other income, store" },
    { label: "Money out", value: b ? money(b.total_out) : "…", note: "Expenses, payroll, refunds" },
    { label: "Net", value: b ? money(b.net) : "…", note: net >= 0 ? "In hand for the range" : "Overspent in the range" },
    { label: "Days with movement", value: b ? String(b.daily.length) : "…", note: `${date(from)} – ${date(to)}` },
  ];

  const lines = (title: string, rec: Record<string, string> | undefined, pretty = true) =>
    Object.entries(rec ?? {})
      .filter(([, v]) => Number(v) !== 0)
      .map(([k, v]) => [`${title} · ${pretty ? label(k) : k}`, v] as const);
  const breakdown = b
    ? [
        ...lines("Fees", b.income.fees_by_head, false),
        ...lines("Other income", b.income.other),
        ...lines("Store", b.income.store),
        ...lines("Expense", b.expenses.by_category, false),
        ...(Number(b.expenses.payroll) ? ([["Payroll", b.expenses.payroll]] as const) : []),
        ...(Number(b.expenses.refunds) ? ([["Refunds", b.expenses.refunds]] as const) : []),
      ]
    : [];

  return (
    <>
      <div className="panel profile-banner">
        <div className="profile-hero">
          <div className="row">
            <span className="avatar mint large">
              <Icon name="book" />
            </span>
            <div>
              <h2>Cash & bank book</h2>
              <p>{`${date(from)} – ${date(to)} · all modes`}</p>
            </div>
          </div>
          <span className={`badge ${net < 0 ? "bad" : ""}`}>{b ? `Net ${money(b.net)}` : "…"}</span>
        </div>
      </div>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <select aria-label="Filter by mode" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="">All modes</option>
          {modes.map(([k]) => (
            <option key={k} value={k}>
              {modeLabel(k)}
            </option>
          ))}
        </select>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>
      <ErrorNote>{book.error}</ErrorNote>
      <Panel
        title="Account transactions"
        sub="Amounts in INR · Day totals; the running column starts at ₹0 on the first day shown (no opening balance is kept)"
        action={
          <button type="button" className="btn" onClick={() => window.print()}>
            <Icon name="download" className="sm" />
            Print book
          </button>
        }
        flush
      >
        <DataTable columns={["Date", "Reference", "Particulars", "Receipts", "Payments", "Balance"]} rows={rows} selectable={false} rowAction={false} empty={book.loading ? "Loading…" : "No money moved in this range."} />
      </Panel>
      <div className="two-col" style={{ marginTop: 20 }}>
        <Panel title="By payment mode" sub="Money in and out through each mode" flush>
          <DataTable
            columns={["Mode", "Receipts", "Payments", "Net"]}
            rows={shownModes.map(([k, v]) => [modeLabel(k), money(v.in), money(v.out), money(Number(v.in) - Number(v.out))])}
            selectable={false}
            rowAction={false}
            empty={book.loading ? "Loading…" : "No money moved in this range."}
          />
        </Panel>
        <Panel title="Where it came from and went">
          <dl className="kv">
            {breakdown.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{money(v)}</dd>
              </div>
            ))}
          </dl>
          {!breakdown.length ? <p className="muted small">{book.loading ? "Loading…" : "Nothing in this range."}</p> : null}
        </Panel>
      </div>
    </>
  );
}
