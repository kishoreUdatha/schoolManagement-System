"use client";

import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { label, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { KV, monthName, num } from "./kit";
import type { Payslip } from "./types";

const BASE = "/api/v1/staff/payslips";

const EARNINGS: [keyof Payslip, string][] = [
  ["basic", "Basic"],
  ["da", "Dearness allowance"],
  ["hra", "House rent allowance"],
  ["conveyance", "Conveyance"],
  ["special_allowance", "Special allowance"],
  ["other_allowance", "Other allowance"],
  ["bonus", "Bonus"],
];

const DEDUCTIONS: [keyof Payslip, string][] = [
  ["pf_employee", "Provident fund"],
  ["esi_employee", "ESI"],
  ["professional_tax", "Professional tax"],
  ["tds", "Income tax (TDS)"],
  ["other_deduction", "Other deductions"],
];

/** Only the lines with an amount, so a slip is not a column of zeros. */
const lines = (p: Payslip, keys: [keyof Payslip, string][]) => keys.filter(([k]) => Number(p[k]) !== 0).map(([k, l]) => [l, money(p[k] as string)] as [string, string]);

/**
 * NEW-092, live: GET /staff/payslips (finalised and paid months only) and the
 * slip's PDF from GET /staff/payslips/{id}/pdf, opened or saved with the token.
 */
export function MyPayslips() {
  const slips = useApi<Payslip[]>(BASE);
  const [year, setYear] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => [...(slips.data ?? [])].sort((a, b) => b.period.localeCompare(a.period)), [slips.data]);
  const years = [...new Set(all.map((p) => p.period.slice(0, 4)))];
  const items = all.filter((p) => !year || p.period.startsWith(year));
  const current = items.find((p) => p.id === picked) ?? items[0] ?? null;

  const latest = all[0];
  const fyNet = items.reduce((n, p) => n + Number(p.net_pay), 0);
  const fyTax = items.reduce((n, p) => n + Number(p.tds), 0);
  const ready = slips.data !== null;
  const stats = [
    { label: "Latest net pay", value: ready ? (latest ? money(latest.net_pay) : "—") : "…", note: latest ? monthName(latest.period) : "No payslip yet" },
    { label: "Net pay", value: ready ? money(fyNet) : "…", note: year ? `Paid in ${year}` : "Across every payslip shown" },
    { label: "Income tax", value: ready ? money(fyTax) : "…", note: "TDS deducted" },
    { label: "Payslips", value: ready ? String(items.length) : "…", note: "Finalised months" },
  ];

  const rows: Row[] = items.map((p) => [monthName(p.period), num(p.paid_days), money(p.gross), money(p.total_deductions), money(p.net_pay), label(p.run_status)]);

  async function pdf(p: Payslip, save: boolean) {
    setError(null);
    try {
      if (save) await api.download(`${BASE}/${p.id}/pdf`, `payslip-${p.period}.pdf`);
      else await api.open(`${BASE}/${p.id}/pdf`);
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <select aria-label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{error ?? slips.error}</ErrorNote>
      <div className="two-col">
        <div className="stack">
          <Panel title="My payslips" sub={`Newest first${slips.loading ? " · Loading…" : ""}`} flush>
            <DataTable
              columns={["Month", "Paid days", "Gross", "Deductions", "Net pay", "Status"]}
              rows={rows}
              selectable={false}
              actions={(i) => (
                <>
                  <button type="button" className="btn" onClick={() => setPicked(items[i].id)}>
                    View
                  </button>
                  <button type="button" className="btn" onClick={() => pdf(items[i], true)}>
                    <Icon name="download" className="sm" />
                    PDF
                  </button>
                </>
              )}
              empty={slips.loading ? "Loading…" : year ? "No payslips for this year." : undefined}
              emptyState={{ title: "No payslips yet", note: "Payslips appear here once the school finalises the month's payroll." }}
            />
          </Panel>
        </div>
        <aside className="stack">
          {current ? (
            <section className="aside-panel">
              <h3>{`Payslip · ${monthName(current.period)}`}</h3>
              <p>{`${current.full_name} · ${current.employee_no}${current.designation ? ` · ${current.designation}` : ""}`}</p>
              <KV
                rows={[
                  ["Paid days", `${num(current.paid_days)} of ${current.days_in_month}${Number(current.lop_days) ? ` · ${num(current.lop_days)} without pay` : ""}`],
                  ...lines(current, EARNINGS),
                  ["Gross", money(current.gross)],
                  ...lines(current, DEDUCTIONS),
                  ["Total deductions", money(current.total_deductions)],
                  ["Net pay", <strong key="net">{money(current.net_pay)}</strong>],
                  ...(current.remarks ? ([["Remarks", current.remarks]] as [string, string][]) : []),
                ]}
              />
              <div className="row" style={{ marginTop: 16, gap: 8 }}>
                <button type="button" className="btn primary" onClick={() => pdf(current, false)}>
                  <Icon name="file" className="sm" />
                  Open PDF
                </button>
                <button type="button" className="btn" onClick={() => pdf(current, true)}>
                  <Icon name="download" className="sm" />
                  Download
                </button>
              </div>
            </section>
          ) : (
            <Panel title="Payslip">
              <p className="muted">{slips.loading ? "Loading…" : "Choose a month to see its breakdown."}</p>
            </Panel>
          )}
        </aside>
      </div>
    </>
  );
}
