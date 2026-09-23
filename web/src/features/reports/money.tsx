"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Row } from "@/components/ui/DataTable";
import { date, label, money, pct } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { DateInput, monthLabel, monthStart, num, ReportView, share, today } from "./kit";

const n = (v: string | number | null | undefined) => Number(v ?? 0);

// ---------------------------------------------------------------- SCR-273

type Collection = {
  from_date: string;
  to_date: string;
  receipts: number;
  total: string;
  by_head: { label: string; amount: string }[];
  by_class: { label: string; amount: string }[];
  by_mode: { label: string; amount: string }[];
  by_month: { month: string; amount: string }[];
  /** per fee type: bills falling due in the period against what has been paid on them */
  billed_by_head: { label: string; expected: string; paid: string; outstanding: string; collection_rate: number; bills: number; receipts: number }[];
};

/** SCR-273, live: GET /api/v1/school/analytics/fee-collection (?from&to). */
export function FeeCollectionReport() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [by, setBy] = useState<"head" | "class" | "mode" | "month">("head");
  const res = useApi<Collection>("/api/v1/school/analytics/fee-collection", { from, to });
  const d = res.data;
  const total = n(d?.total);
  const groups = {
    head: { name: "Fee type", items: d?.by_head ?? [] },
    class: { name: "Class", items: d?.by_class ?? [] },
    mode: { name: "Payment mode", items: (d?.by_mode ?? []).map((m) => ({ ...m, label: label(m.label) })) },
    month: { name: "Month", items: (d?.by_month ?? []).map((m) => ({ label: monthLabel(m.month), amount: m.amount })) },
  };
  const g = groups[by];
  // By fee type, the mock's columns: what was billed, what came in on it, what is still owed.
  const billed = d?.billed_by_head ?? [];
  const received = new Map((d?.by_head ?? []).map((h) => [h.label, h]));
  const heads = [...billed.map((b) => b.label), ...[...received.keys()].filter((k) => !billed.some((b) => b.label === k))];
  const headRows: Row[] = heads.map((h) => {
    const b = billed.find((x) => x.label === h);
    return [h, b ? money(b.expected) : "—", b ? money(b.paid) : "—", b ? money(b.outstanding) : "—", b ? pct(b.collection_rate) : "—", num(b?.receipts ?? 0)];
  });
  const byHead = by === "head";
  const rows: Row[] = byHead ? headRows : g.items.map((x) => [x.label, money(x.amount), pct(share(n(x.amount), total))]);
  const expected = billed.reduce((s, b) => s + n(b.expected), 0);
  const paid = billed.reduce((s, b) => s + n(b.paid), 0);
  const range = d ? `${date(d.from_date)} – ${date(d.to_date)}` : "—";
  return (
    <ReportView
      filters={
        <>
          <select aria-label="Group by" value={by} onChange={(e) => setBy(e.target.value as typeof by)}>
            <option value="head">By fee type</option>
            <option value="class">By class</option>
            <option value="mode">By payment mode</option>
            <option value="month">By month</option>
          </select>
          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />
        </>
      }
      error={res.error}
      loading={res.loading}
      stats={[
        { label: "Collected", value: money(d?.total), note: "Received in period" },
        { label: "Receipts", value: num(d?.receipts), note: range },
        { label: "Average receipt", value: d?.receipts ? money(Math.round(total / d.receipts)) : "—", note: "Collected ÷ receipts" },
        { label: "Collection rate", value: expected ? pct(share(paid, expected)) : "—", note: d ? `${money(paid)} of ${money(expected)} billed in period` : "Paid ÷ billed" },
      ]}
      chart={{ kind: "bars", title: "Collection by month", sub: "Money received each month", bars: (d?.by_month ?? []).map((m) => ({ label: monthLabel(m.month), value: n(m.amount), text: money(m.amount) })), empty: "Nothing was collected in this period." }}
      scope={[
        ["Date range", range],
        ["Group by", g.name],
        ["Receipts", num(d?.receipts)],
      ]}
      summaryTitle="By payment mode"
      summary={(d?.by_mode ?? []).map((m) => ({ label: label(m.label), value: share(n(m.amount), total), text: pct(share(n(m.amount), total), 0) }))}
      table={
        byHead
          ? {
              name: "fee-collection-by-head",
              sub: "Bills falling due in the period, what has been paid on them, and receipts taken per head",
              columns: ["Fee type", "Expected", "Collected", "Outstanding", "Collection rate", "Transactions"],
              rows,
              empty: "Nothing was billed or collected in this period.",
            }
          : { name: `fee-collection-by-${by}`, columns: [g.name, "Collected", "Share"], rows, empty: "Nothing was collected in this period." }
      }
    />
  );
}

// ---------------------------------------------------------------- SCR-274

type Dues = {
  as_of: string;
  total: string;
  students_owing: number;
  buckets: { label: string; amount: string }[];
  defaulters: { student_id: number; student_name: string; admission_no: string; section_label: string | null; owed: string; items: number; oldest_days: number }[];
};

/** SCR-274, live: GET /api/v1/school/analytics/dues-ageing. */
export function DuesReport() {
  const router = useRouter();
  const [by, setBy] = useState<"student" | "class">("student");
  const res = useApi<Dues>("/api/v1/school/analytics/dues-ageing");
  const d = res.data;
  const total = n(d?.total);
  const buckets = d?.buckets ?? [];
  const notDue = n(buckets.find((b) => b.label.toLowerCase().startsWith("not"))?.amount);
  const over60 = buckets.filter((b) => /61|90/.test(b.label)).reduce((s, b) => s + n(b.amount), 0);
  const people = d?.defaulters ?? [];
  const classes = new Map<string, { accounts: number; owed: number; items: number; oldest: number }>();
  people.forEach((p) => {
    const k = p.section_label ?? "No section";
    const c = classes.get(k) ?? { accounts: 0, owed: 0, items: 0, oldest: 0 };
    classes.set(k, { accounts: c.accounts + 1, owed: c.owed + n(p.owed), items: c.items + p.items, oldest: Math.max(c.oldest, p.oldest_days) });
  });
  const columns = by === "student" ? ["Student", "Class", "Outstanding", "Items", "Oldest due"] : ["Class", "Accounts", "Outstanding", "Items", "Oldest due"];
  const rows: Row[] =
    by === "student"
      ? people.map((p) => [{ name: p.student_name, sub: p.admission_no }, p.section_label ?? "—", money(p.owed), num(p.items), p.oldest_days > 0 ? `${p.oldest_days} days` : "Not yet due"])
      : [...classes].map(([k, c]) => [k, num(c.accounts), money(c.owed), num(c.items), c.oldest > 0 ? `${c.oldest} days` : "Not yet due"]);
  return (
    <ReportView
      filters={
        <select aria-label="Group by" value={by} onChange={(e) => setBy(e.target.value as typeof by)}>
          <option value="student">By student</option>
          <option value="class">By class</option>
        </select>
      }
      error={res.error}
      loading={res.loading}
      stats={[
        { label: "Outstanding", value: money(d?.total), note: d ? `As of ${date(d.as_of)}` : "Unpaid fees" },
        { label: "Students owing", value: num(d?.students_owing), note: "With any balance" },
        { label: "Overdue", value: d ? money(total - notDue) : "—", note: "Past the due date" },
        { label: "Over 60 days", value: d ? money(over60) : "—", note: "Oldest debt" },
      ]}
      chart={{ kind: "bars", title: "Dues by age", sub: "How long the unpaid money has been due", bars: buckets.map((b) => ({ label: b.label, value: n(b.amount), text: money(b.amount) })), empty: "Nothing is owed." }}
      scope={[
        ["As of", d ? date(d.as_of) : "—"],
        ["Buckets", "Not yet due, then 30-day steps"],
        ["Group by", by === "student" ? "Student" : "Class & section"],
      ]}
      summaryTitle="Share of dues"
      summary={total ? buckets.map((b) => ({ label: b.label, value: share(n(b.amount), total), text: pct(share(n(b.amount), total), 0) })) : []}
      table={{
        name: `outstanding-dues-by-${by}`,
        columns,
        rows,
        empty: "Nothing is owed.",
        onView: by === "student" ? (i) => router.push(`${routeOf(62)}?id=${people[i].student_id}`) : undefined,
      }}
    />
  );
}

// ---------------------------------------------------------------- SCR-275

type CashBook = {
  from_date: string;
  to_date: string;
  income: { fees: Record<string, string>; fees_by_head: Record<string, string>; other: Record<string, string>; store: Record<string, string> };
  expenses: { by_category: Record<string, string>; payroll: string; refunds: string };
  total_in: string;
  total_out: string;
  net: string;
  by_mode: Record<string, { in: string; out: string }>;
};

/** Category -> [in, out] for one cash book. */
function lines(c: CashBook | null) {
  const m = new Map<string, [number, number]>();
  if (!c) return m;
  const add = (k: string, i: number, o: number) => {
    const v = m.get(k) ?? [0, 0];
    m.set(k, [v[0] + i, v[1] + o]);
  };
  Object.entries(c.income.fees_by_head).forEach(([k, v]) => add(`Fees · ${k}`, n(v), 0));
  Object.entries(c.income.other).forEach(([k, v]) => add(`Other income · ${label(k)}`, n(v), 0));
  Object.entries(c.income.store).forEach(([k, v]) => add(`Store · ${label(k)}`, n(v), 0));
  Object.entries(c.expenses.by_category).forEach(([k, v]) => add(`Expense · ${k}`, 0, n(v)));
  if (n(c.expenses.payroll)) add("Payroll", 0, n(c.expenses.payroll));
  if (n(c.expenses.refunds)) add("Refunds", 0, n(c.expenses.refunds));
  return m;
}

/** The same number of days immediately before [from, to]. */
function previous(from: string, to: string) {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
  const pt = new Date(f.getTime() - 86400000);
  const pf = new Date(pt.getTime() - (days - 1) * 86400000);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(pf), to: iso(pt) };
}

/** SCR-275, live: GET /api/v1/school/accounts/cash-book (?from&to), twice: the period and the one before it. */
export function FinanceSummary() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const ok = Boolean(from && to && from <= to);
  const prev = ok ? previous(from, to) : null;
  const res = useApi<CashBook>(ok ? "/api/v1/school/accounts/cash-book" : null, { from, to });
  const before = useApi<CashBook>(prev ? "/api/v1/school/accounts/cash-book" : null, prev ?? undefined);
  const d = res.data;
  const now = lines(d);
  const then = lines(before.data);
  const keys = [...new Set([...now.keys(), ...then.keys()])];
  const rows: Row[] = keys.map((k) => {
    const [i, o] = now.get(k) ?? [0, 0];
    const [pi, po] = then.get(k) ?? [0, 0];
    const net = i - o;
    const pnet = pi - po;
    const change = before.data ? (pnet ? pct(((net - pnet) / Math.abs(pnet)) * 100) : net ? "New" : "—") : "…";
    return [k, i ? money(i) : "—", o ? money(o) : "—", money(net), before.data ? money(pnet) : "…", change];
  });
  const tin = n(d?.total_in);
  const tout = n(d?.total_out);
  const modes = Object.entries(d?.by_mode ?? {});
  return (
    <ReportView
      filters={
        <>
          <DateInput label="From" value={from} onChange={setFrom} />
          <DateInput label="To" value={to} onChange={setTo} />
        </>
      }
      error={ok ? (res.error ?? before.error) : "Choose a start date on or before the end date."}
      loading={res.loading}
      stats={[
        { label: "Money in", value: money(d?.total_in), note: "Fees, other income and store" },
        { label: "Money out", value: money(d?.total_out), note: "Expenses, payroll and refunds" },
        { label: "Net", value: money(d?.net), note: d ? `${date(d.from_date)} – ${date(d.to_date)}` : "In period" },
        { label: "Previous period net", value: money(before.data?.net), note: prev ? `${date(prev.from)} – ${date(prev.to)}` : "—" },
      ]}
      chart={{ kind: "bars", title: "Money in by mode", sub: "How the money arrived", bars: modes.map(([k, v]) => ({ label: label(k), value: n(v.in), text: money(v.in) })), empty: "Nothing came in during this period." }}
      scope={[
        ["Date range", d ? `${date(d.from_date)} – ${date(d.to_date)}` : "—"],
        ["Compared with", prev ? `${date(prev.from)} – ${date(prev.to)}` : "—"],
        ["Group by", "Income head and expense category"],
      ]}
      summaryTitle="In and out"
      summary={tin || tout ? [
        { label: "Money in", value: share(tin, Math.max(tin, tout)), text: money(tin) },
        { label: "Money out", value: share(tout, Math.max(tin, tout)), text: money(tout) },
      ] : []}
      table={{ name: "finance-summary", columns: ["Category", "Income", "Expenses", "Net", "Previous period", "Change"], rows, empty: "No money moved in this period." }}
    />
  );
}

// ---------------------------------------------------------------- SCR-277

type Run = {
  id: number;
  period: string;
  status: string;
  staff_count: number;
  total_gross: string;
  total_deductions: string;
  total_net: string;
  total_employer_cost: string;
  paid_on: string | null;
};

type DeptPay = {
  run_id: number | null;
  period: string | null;
  status: string | null;
  departments: { department: string; staff: number; gross: string; deductions: string; net: string; employer_cost: string }[];
};

/** SCR-277, live: GET /api/v1/school/payroll/runs, and GET /api/v1/school/analytics/payroll-by-department (?run_id) for the table. */
export function PayrollSummary() {
  const [status, setStatus] = useState("");
  const [runId, setRunId] = useState("");
  const [by, setBy] = useState<"department" | "run">("department");
  const res = useApi<Run[]>("/api/v1/school/payroll/runs");
  const dept = useApi<DeptPay>("/api/v1/school/analytics/payroll-by-department", { run_id: runId });
  const all = res.data ?? [];
  const runs = status ? all.filter((r) => r.status === status) : all;
  const latest = all[0];
  const recent = [...all].slice(0, 6).reverse();
  const counts = ["draft", "finalized", "paid"].map((s) => [s, all.filter((r) => r.status === s).length] as const);
  const runRows: Row[] = runs.map((r) => [monthLabel(r.period), num(r.staff_count), money(r.total_gross), money(r.total_deductions), money(r.total_net), label(r.status)]);
  const dp = dept.data;
  const deptRows: Row[] = (dp?.departments ?? []).map((x) => [x.department, num(x.staff), money(x.gross), money(x.deductions), money(x.net), dp?.status ? label(dp.status) : "—"]);
  const byDept = by === "department";
  return (
    <ReportView
      filters={
        <>
          <select aria-label="Group by" value={by} onChange={(e) => setBy(e.target.value as typeof by)}>
            <option value="department">By department</option>
            <option value="run">By payroll run</option>
          </select>
          {byDept ? (
            <select aria-label="Payroll run" value={runId} onChange={(e) => setRunId(e.target.value)}>
              <option value="">Latest run</option>
              {all.map((r) => (
                <option key={r.id} value={r.id}>{`${monthLabel(r.period)} · ${label(r.status)}`}</option>
              ))}
            </select>
          ) : (
            <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="finalized">Finalized</option>
              <option value="paid">Paid</option>
            </select>
          )}
        </>
      }
      error={res.error ?? (byDept ? dept.error : null)}
      loading={res.loading}
      stats={[
        { label: "Latest run", value: latest ? monthLabel(latest.period) : "—", note: latest ? label(latest.status) : "No payroll run yet" },
        { label: "Gross pay", value: money(latest?.total_gross), note: "Latest run" },
        { label: "Net pay", value: money(latest?.total_net), note: latest ? `${num(latest.staff_count)} staff` : "Latest run" },
        { label: "Employer cost", value: money(latest?.total_employer_cost), note: "Latest run" },
      ]}
      chart={{ kind: "bars", title: "Net pay by month", sub: "The last six payroll runs", bars: recent.map((r) => ({ label: monthLabel(r.period), value: n(r.total_net), text: money(r.total_net) })), empty: "No payroll has been run yet." }}
      scope={[
        ["Runs", num(all.length)],
        ["Latest", latest ? monthLabel(latest.period) : "—"],
        ["Group by", byDept ? `Department · ${dp?.period ? monthLabel(dp.period) : "latest run"}` : "Payroll run (month)"],
      ]}
      summaryTitle="Runs by status"
      summary={all.length ? counts.map(([s, c]) => ({ label: label(s), value: share(c, all.length), text: `${c}` })) : []}
      table={
        byDept
          ? {
              name: "payroll-by-department",
              sub: dp?.period ? `${monthLabel(dp.period)} payroll run, by the department each person belongs to` : "The latest payroll run, by department",
              columns: ["Department", "Staff", "Gross pay", "Deductions", "Net pay", "Status"],
              rows: deptRows,
              empty: dept.loading ? "Loading…" : "No payroll has been run yet.",
            }
          : { name: "payroll-summary", columns: ["Period", "Staff", "Gross pay", "Deductions", "Net pay", "Status"], rows: runRows, empty: "No payroll runs match." }
      }
    />
  );
}
