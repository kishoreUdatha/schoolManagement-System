"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { Payslip, Run, RunDetail, Salary, StaffPayRow } from "./types";
import { monthLabel } from "./ui";

const BASE = "/api/v1/school/payroll";
/** How many of the latest payroll months to search for a person's payslips. */
const MONTHS = 12;

const allowances = (s: Salary) => Number(s.conveyance) + Number(s.special_allowance) + Number(s.other_allowance);
const account = (s: Salary) => (s.bank_account_no ? `${s.bank_name ?? "Bank"} · ••${s.bank_account_no.slice(-4)}` : "Not set");

/** One person's payslips across the latest runs: GET /payroll/runs/{id} for each. */
function useSlips(runs: Run[] | null, staffId: number | null) {
  const [slips, setSlips] = useState<Payslip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${staffId}:${(runs ?? []).map((r) => `${r.id}.${r.status}`).join(",")}`;
  useEffect(() => {
    if (!runs || staffId === null) return;
    let live = true;
    setSlips(null);
    setError(null);
    const latest = [...runs].sort((a, b) => b.period.localeCompare(a.period)).slice(0, MONTHS);
    Promise.all(latest.map((r) => api.get<RunDetail>(`${BASE}/runs/${r.id}`)))
      .then((details) => live && setSlips(details.flatMap((d) => d.payslips.filter((p) => p.staff_id === staffId))))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
    // key stands for runs and staffId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { slips, error };
}

/**
 * NEW-062, live: GET /payroll/staff to pick a person (?id= staff id), GET
 * /payroll/staff/{id}/salaries for every salary revision, their payslips
 * from GET /payroll/runs/{id} (latest twelve months) with the PDF from GET
 * /payroll/payslips/{id}/pdf, and each finalised run's bank file from GET
 * /payroll/runs/{id}/bank-file.csv.
 */
export function SalaryHistory() {
  const router = useRouter();
  const path = usePathname();
  const idParam = useSearchParams().get("id");
  const staff = useApi<StaffPayRow[]>(`${BASE}/staff`);
  const runs = useApi<Run[]>(`${BASE}/runs`);
  const [error, setError] = useState<string | null>(null);

  const people = useMemo(() => [...(staff.data ?? [])].sort((a, b) => a.full_name.localeCompare(b.full_name)), [staff.data]);
  const staffId = idParam ? Number(idParam) : null;
  const person = people.find((p) => p.staff_id === staffId) ?? null;
  const pick = (id: string) => router.replace(id ? `${path}?id=${id}` : path, { scroll: false });

  // Default to the first person with a salary set.
  useEffect(() => {
    if (!idParam && people.length) pick(String((people.find((p) => p.salary) ?? people[0]).staff_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idParam, people]);

  const history = useApi<Salary[]>(staffId !== null ? `${BASE}/staff/${staffId}/salaries` : null);
  const { slips, error: slipError } = useSlips(runs.data, staffId);

  const revisions = [...(history.data ?? [])].sort((a, b) => b.effective_from.localeCompare(a.effective_from));
  const current = revisions[0];
  const first = revisions[revisions.length - 1];
  const paidSlips = (slips ?? []).filter((p) => p.run_status !== "draft");
  const netPaid = paidSlips.reduce((s, p) => s + Number(p.net_pay), 0);

  const stats = [
    { label: "Monthly gross", value: current ? money(current.monthly_gross) : history.loading ? "…" : "—", note: current ? `Since ${date(current.effective_from)}` : "No salary set" },
    {
      label: "Revisions",
      value: history.data ? String(revisions.length) : "…",
      note:
        current && first && current !== first && Number(first.monthly_gross)
          ? `${(((Number(current.monthly_gross) - Number(first.monthly_gross)) / Number(first.monthly_gross)) * 100).toFixed(1)}% since ${date(first.effective_from)}`
          : "Salary records on file",
    },
    { label: "Payslips", value: slips ? String(slips.length) : "…", note: `In the last ${MONTHS} payroll months` },
    { label: "Net paid", value: slips ? money(netPaid) : "…", note: "Finalised and paid months" },
  ];

  const historyRows: Row[] = revisions.map((s, i) => {
    const prev = revisions[i + 1];
    const change = prev && Number(prev.monthly_gross) ? ((Number(s.monthly_gross) - Number(prev.monthly_gross)) / Number(prev.monthly_gross)) * 100 : null;
    return [
      date(s.effective_from),
      money(s.basic),
      money(s.da),
      money(s.hra),
      money(allowances(s)),
      `${money(s.monthly_gross)}${change === null ? "" : ` (${change >= 0 ? "+" : ""}${change.toFixed(1)}%)`}`,
      account(s),
    ];
  });

  const slipRows: Row[] = (slips ?? []).map((p) => [
    monthLabel(p.period),
    label(p.run_status),
    `${Number(p.paid_days)} / ${p.days_in_month}`,
    money(p.gross),
    money(p.total_deductions),
    money(p.net_pay),
  ]);

  const allRuns = [...(runs.data ?? [])].sort((a, b) => b.period.localeCompare(a.period));
  const runRows: Row[] = allRuns.map((r) => [monthLabel(r.period), label(r.status), String(r.staff_count), money(r.total_net), r.paid_on ? `${date(r.paid_on)}${r.payment_ref ? ` · ${r.payment_ref}` : ""}` : "—"]);

  const run = (fn: () => Promise<unknown>) => {
    setError(null);
    fn().catch((e) => setError(errorText(e)));
  };

  return (
    <>
      <div className="filterbar">
        <select aria-label="Staff member" value={idParam ?? ""} onChange={(e) => pick(e.target.value)}>
          <option value="">{staff.loading ? "Loading staff…" : "Choose a staff member"}</option>
          {people.map((p) => (
            <option key={p.staff_id} value={p.staff_id}>
              {`${p.full_name} · ${p.employee_no}${p.designation ? ` · ${p.designation}` : ""}${p.is_active ? "" : " (inactive)"}`}
            </option>
          ))}
        </select>
        {person ? (
          <Link href={`${routeOf(183)}`} className="btn">
            <Icon name="settings" className="sm" />
            Change salary in Payroll Setup
          </Link>
        ) : null}
      </div>
      <ErrorNote>{error ?? staff.error ?? runs.error ?? history.error ?? slipError}</ErrorNote>
      <StatStrip items={stats} compact />
      <div className="stack">
        <Panel title={person ? `Salary history · ${person.full_name}` : "Salary history"} sub="Every salary revision, newest first" flush>
          <DataTable
            columns={["Effective from", "Basic", "DA", "HRA", "Other allowances", "Monthly gross", "Bank account"]}
            rows={historyRows}
            selectable={false}
            rowAction={false}
            empty={staffId === null ? "Choose a staff member." : history.loading ? "Loading salary history…" : undefined}
            emptyState={{
              title: "No salary set",
              note: "Set up a salary structure for this person in Payroll Setup to start their salary history.",
              action: (
                <Link href={routeOf(183)} className="btn primary">
                  <Icon name="settings" className="sm" />
                  Set up salary
                </Link>
              ),
            }}
          />
        </Panel>
        <Panel title="Payslips" sub={`${person ? person.full_name : "This person"} · latest ${MONTHS} payroll months`} flush>
          <DataTable
            columns={["Month", "Payroll status", "Paid days", "Gross", "Deductions", "Net pay"]}
            rows={slipRows}
            selectable={false}
            actions={(i) => {
              const p = slips![i];
              return (
                <button type="button" className="btn" onClick={() => run(() => api.open(`${BASE}/payslips/${p.id}/pdf`))}>
                  <Icon name="file" className="sm" />
                  Payslip PDF
                </button>
              );
            }}
            empty={staffId === null ? "Choose a staff member." : slips === null ? "Loading payslips…" : undefined}
            emptyState={{
              title: "No payslips yet",
              note: `No payslips for ${person ? person.full_name : "this person"} in the last ${MONTHS} payroll months.`,
            }}
          />
        </Panel>
        <Panel title="Bank files" sub="The bulk-transfer file for each payroll month, for the bank's portal. Available once the month is finalised." flush>
          <DataTable
            columns={["Month", "Status", "Staff", "Net total", "Paid on"]}
            rows={runRows}
            selectable={false}
            actions={(i) => {
              const r = allRuns[i];
              return r.status === "draft" ? (
                <Link href={`${routeOf(184)}?id=${r.id}`} className="btn">
                  Finalise first
                </Link>
              ) : (
                <button type="button" className="btn" onClick={() => run(() => api.download(`${BASE}/runs/${r.id}/bank-file.csv`, `salary-${r.period}.csv`))}>
                  <Icon name="download" className="sm" />
                  Bank file
                </button>
              );
            }}
            empty={runs.loading ? "Loading payroll months…" : undefined}
            emptyState={{
              title: "No payroll run yet",
              note: "Bank files appear here once a payroll month is finalised.",
              action: (
                <Link href={routeOf(184)} className="btn primary">
                  <Icon name="money" className="sm" />
                  Payroll processing
                </Link>
              ),
            }}
          />
        </Panel>
      </div>
    </>
  );
}
