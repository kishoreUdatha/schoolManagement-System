"use client";

import { Fragment, useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { askText } from "@/lib/dialog";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { BOOKS } from "./common";

type Row = {
  account_id: number;
  code: string;
  name: string;
  category: string | null;
  budget: string | null;
  notes: string | null;
  actual: string;
  expected_by_now: string | null;
  remaining: string | null;
  used_pct: string | null;
  over_budget: boolean;
  ahead_of_plan: boolean;
};
type Report = {
  year_from: string;
  year_to: string;
  as_of: string;
  months_gone: number;
  income: Row[];
  expenses: Row[];
  totals: { income_budget: string; income_actual: string; expense_budget: string; expense_actual: string; income_actual_budgeted: string; expense_actual_budgeted: string };
  over_budget: number;
  years: { year_from: string; label: string }[];
};

/**
 * NEW-099, live: the year's budget against actuals, for each income and
 * expense account. GET /books/budget?year_from=, PUT /books/budget (amounts
 * typed here; an empty one removes it), POST /books/budget/copy (last year's
 * actuals plus a percentage). Actuals come from the books, so fees, expenses,
 * petty cash, bills and salaries all count.
 */
export function Budget() {
  const [year, setYear] = useState<string | undefined>(undefined);
  const r = useApi<Report>(`${BOOKS}/budget`, { year_from: year });
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = r.data;
  useEffect(() => setEdits({}), [d?.year_from]);

  if (!d) return r.error ? <ErrorNote>{r.error}</ErrorNote> : <Loading what="Loading the budget…" />;
  const dirty = Object.keys(edits).length > 0;
  const label = d.years.find((y) => y.year_from === d.year_from)?.label ?? d.year_from.slice(0, 4);
  const pct = (a: string | null, b: string | null) => (a && b && Number(b) ? Math.round((Number(a) / Number(b)) * 100) : null);
  const stats = [
    // set against the accounts that have a budget; the rest are in the table
    { label: "Income budget", value: money(d.totals.income_budget), note: Number(d.totals.income_budget) ? `${money(d.totals.income_actual_budgeted)} in so far · ${pct(d.totals.income_actual_budgeted, d.totals.income_budget)}%` : `${money(d.totals.income_actual)} in so far, none budgeted` },
    { label: "Spending budget", value: money(d.totals.expense_budget), note: Number(d.totals.expense_budget) ? `${money(d.totals.expense_actual_budgeted)} spent · ${pct(d.totals.expense_actual_budgeted, d.totals.expense_budget)}%` : `${money(d.totals.expense_actual)} spent, none budgeted` },
    { label: "Over budget", value: String(d.over_budget), note: d.over_budget ? "Accounts spent past their budget" : "Nothing over budget" },
    { label: "Year gone", value: `${d.months_gone} of 12 months`, note: `${date(d.year_from)} – ${date(d.year_to)}` },
  ];

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.put(`${BOOKS}/budget`, {
        year_from: d!.year_from,
        lines: Object.entries(edits).map(([id, v]) => ({ account_id: Number(id), amount: v.trim() === "" ? null : v })),
      });
      notify(`Budget for ${label} saved.`);
      setEdits({});
      r.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    const prev = d!.years[0]?.label;
    const up = await askText(`Fill this year's budget from ${prev}'s actual income and spending, raised by a percentage. Accounts already budgeted are kept.`, {
      defaultValue: "10",
      placeholder: "Percentage, e.g. 10",
      required: true,
    });
    if (up === null) return;
    setError(null);
    try {
      await api.post(`${BOOKS}/budget/copy`, { year_from: d!.year_from, uplift_pct: up || "0" });
      notify(`Budget filled from ${prev}'s actuals plus ${up}%.`);
      r.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const value = (row: Row) => (row.account_id in edits ? edits[row.account_id] : row.budget === null ? "" : String(Number(row.budget)));
  const section = (title: string, rows: Row[], kind: "income" | "expense") => (
    <Fragment>
      <tr className="ie-section">
        <td colSpan={8}>{title}</td>
      </tr>
      {rows.map((row) => {
        const used = row.used_pct === null ? null : Number(row.used_pct);
        return (
          <tr key={row.account_id} className={row.over_budget ? "bud-over" : ""}>
            <td className="mono">{row.code}</td>
            <td>
              {row.name}
              {row.category ? <small className="muted" style={{ display: "block", fontWeight: 500 }}>{row.category}</small> : null}
            </td>
            <td className="num">
              <input
                className="bud-input"
                type="number"
                min={0}
                step="1"
                aria-label={`Budget for ${row.name}`}
                placeholder="—"
                value={value(row)}
                onChange={(e) => setEdits({ ...edits, [row.account_id]: e.target.value })}
              />
            </td>
            <td className="num">{money(row.actual)}</td>
            <td className="num muted">{row.expected_by_now === null ? "—" : money(row.expected_by_now)}</td>
            <td className="num">{row.remaining === null ? "—" : money(row.remaining)}</td>
            <td className="bud-bar-cell">
              {used === null ? (
                <span className="muted small">No budget</span>
              ) : (
                <div className="bud-bar" title={`${used}% of the budget`}>
                  <i style={{ width: `${Math.min(100, used)}%` }} className={kind === "expense" && used > 100 ? "over" : kind === "expense" && row.ahead_of_plan ? "ahead" : ""} />
                  <span>{`${used}%`}</span>
                </div>
              )}
            </td>
            <td>
              {row.over_budget ? <span className="badge bad">Over budget</span> : row.ahead_of_plan ? <span className="badge warn">Ahead of plan</span> : null}
            </td>
          </tr>
        );
      })}
    </Fragment>
  );

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <select aria-label="Financial year" value={d.year_from} onChange={(e) => setYear(e.target.value)}>
          {d.years.map((y) => (
            <option key={y.year_from} value={y.year_from}>
              {`FY ${y.label}`}
            </option>
          ))}
        </select>
        <span className="filter-count">{`Actuals to ${date(d.as_of)}`}</span>
        <button type="button" className="btn" onClick={copy}>
          <Icon name="file" className="sm" />
          Fill from last year
        </button>
        <button type="button" className="btn primary" disabled={!dirty || saving} onClick={save}>
          <Icon name="check" className="sm" />
          {saving ? "Saving…" : dirty ? `Save ${Object.keys(edits).length} change${Object.keys(edits).length === 1 ? "" : "s"}` : "Save"}
        </button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel flush>
        <div className="table-wrap">
          <table className="data-table ie-table bud-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Account</th>
                <th className="num">Budget for the year (₹)</th>
                <th className="num">Actual so far</th>
                <th className="num">Expected by now</th>
                <th className="num">Left</th>
                <th>Used</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {section("Income", d.income, "income")}
              {section("Expenditure", d.expenses, "expense")}
            </tbody>
          </table>
        </div>
        <p className="muted small panel-pad">
          Expected by now is the budget spread evenly over the months gone. Actuals come from the books: fees as they fall due, and every expense, petty cash spend, supplier bill and salary.
        </p>
      </Panel>
    </>
  );
}
