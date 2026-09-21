"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { Payslip, Run, RunDetail } from "./types";
import { downloadAuthed, monthLabel } from "./ui";

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function upTo999(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${ONES[r % 10]}` : ""}`;
  return [h ? `${ONES[h]} hundred` : "", rest].filter(Boolean).join(" ");
}

/** 43200 -> "Forty-three thousand two hundred rupees only" (Indian grouping). */
export function rupeesInWords(v: string | number): string {
  const total = Math.round(Number(v) * 100);
  if (!Number.isFinite(total)) return "";
  let n = Math.floor(total / 100);
  const paise = total % 100;
  if (n === 0 && paise === 0) return "Zero rupees only";
  const parts: string[] = [];
  for (const [size, name] of [[10_000_000, "crore"], [100_000, "lakh"], [1000, "thousand"]] as const) {
    const q = Math.floor(n / size);
    if (q) parts.push(`${upTo999(q)} ${name}`);
    n %= size;
  }
  if (n) parts.push(upTo999(n));
  let s = `${parts.join(" ")} rupees`;
  if (paise) s += ` and ${upTo999(paise)} paise`;
  s += " only";
  return s[0].toUpperCase() + s.slice(1);
}

function lines(p: Payslip): Row[] {
  const earn: [string, string][] = [
    ["Basic pay", p.basic],
    ["Dearness allowance", p.da],
    ["House rent allowance", p.hra],
    ["Conveyance", p.conveyance],
    ["Special allowance", p.special_allowance],
    ["Other allowance", p.other_allowance],
    ["Bonus", p.bonus],
  ].filter(([, v], i) => i === 0 || Number(v) > 0) as [string, string][];
  const ded: [string, string][] = [
    ["Provident fund", p.pf_employee],
    ["ESI", p.esi_employee],
    ["Professional tax", p.professional_tax],
    ["TDS", p.tds],
    ["Other deductions", p.other_deduction],
  ].filter(([, v]) => Number(v) > 0) as [string, string][];
  return Array.from({ length: Math.max(earn.length, ded.length) }, (_, i) => [
    earn[i]?.[0] ?? "—",
    earn[i] ? money(earn[i][1]) : "—",
    ded[i]?.[0] ?? "—",
    ded[i] ? money(ded[i][1]) : "—",
  ]);
}

/**
 * SCR-185, live: GET /api/v1/school/payroll/runs for the month history and
 * /runs/{id} (?run=) for its payslips; ?id= picks the slip. The PDF comes
 * from GET /payroll/payslips/{id}/pdf.
 */
export function Payslips() {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const runId = params.get("run");
  const slipId = params.get("id");
  const runs = useApi<Run[]>("/api/v1/school/payroll/runs");
  const run = useApi<RunDetail>(runId ? `/api/v1/school/payroll/runs/${runId}` : null);
  const go = (r: string | number | null, s: string | number | null) => {
    const q = new URLSearchParams();
    if (r) q.set("run", String(r));
    if (s) q.set("id", String(s));
    router.replace(q.toString() ? `${path}?${q}` : path, { scroll: false });
  };

  // Default to the latest run that staff can see (finalised or paid).
  useEffect(() => {
    if (runId || !runs.data?.length) return;
    const seen = runs.data.filter((r) => r.status !== "draft");
    const pool = seen.length ? seen : runs.data;
    go(pool.reduce((a, b) => (b.period > a.period ? b : a)).id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, runs.data]);

  useEffect(() => {
    if (run.data?.payslips.length && !run.data.payslips.some((p) => String(p.id) === slipId)) go(run.data.id, run.data.payslips[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.data, slipId]);

  const r = run.data;
  const p = r?.payslips.find((x) => String(x.id) === slipId) ?? null;

  return (
    <>
      <div className="filterbar">
        <select aria-label="Payroll month" value={runId ?? ""} onChange={(e) => go(e.target.value, null)}>
          <option value="">{runs.loading ? "Loading months…" : "Choose a month"}</option>
          {runs.data?.map((x) => (
            <option key={x.id} value={x.id}>
              {`${monthLabel(x.period)} · ${label(x.status)} · ${x.staff_count} staff`}
            </option>
          ))}
        </select>
        <select aria-label="Employee" value={slipId ?? ""} onChange={(e) => go(runId, e.target.value)} disabled={!r}>
          {r?.payslips.map((x) => (
            <option key={x.id} value={x.id}>
              {`${x.full_name} · ${x.employee_no}`}
            </option>
          ))}
        </select>
      </div>
      <ErrorNote>{runs.error ?? run.error}</ErrorNote>
      {!p ? (
        <section className="panel">
          <div className="panel-pad muted">{run.loading || runs.loading ? "Loading payslips…" : runs.data?.length ? "Choose a month and an employee." : "No payroll has been run yet."}</div>
        </section>
      ) : (
        <article className="invoice">
          <div className="spread">
            <Link href="/screens" className="brand">
              <span className="brand-mark">
                <Icon name="book" />
              </span>
              <span>
                BrightCampus
                <small>SCHOOL ERP</small>
              </span>
            </Link>
            <div className="right">
              <h2>Salary payslip</h2>
              <p className="small muted">{monthLabel(p.period)}</p>
            </div>
          </div>
          <div className="invoice-meta">
            <div>
              <p>Employee</p>
              <h3>{p.full_name}</h3>
              <p>{[p.employee_no, p.designation].filter(Boolean).join(" · ")}</p>
              {p.remarks ? <p>{p.remarks}</p> : null}
            </div>
            <div className="right">
              <p>{r?.paid_on ? `Pay date: ${date(r.paid_on)}` : `Status: ${label(p.run_status)}`}</p>
              <p>{`Paid days: ${Number(p.paid_days)} of ${p.days_in_month}${Number(p.lop_days) > 0 ? ` (LOP ${Number(p.lop_days)})` : ""}`}</p>
              {r?.payment_ref ? <p>{`Payment ref: ${r.payment_ref}`}</p> : null}
            </div>
          </div>
          <DataTable columns={["Earnings", "Amount", "Deductions", "Deducted"]} rows={lines(p)} selectable={false} rowAction={false} />
          <div className="invoice-total">
            <div>
              <span>Gross pay</span>
              <strong>{money(p.gross)}</strong>
            </div>
            <div>
              <span>Total deductions</span>
              <strong>{money(p.total_deductions)}</strong>
            </div>
            <div className="grand">
              <span>Net pay</span>
              <strong>{money(p.net_pay)}</strong>
            </div>
          </div>
          <p className="small muted">{`Amount in words: ${rupeesInWords(p.net_pay)}.`}</p>
          <div className="gap" />
          <p className="small muted" style={{ fontSize: "9px", textAlign: "center" }}>
            {p.run_status === "draft" ? "Draft — figures may change until the payroll is finalised" : `Employer contributions: PF ${money(p.pf_employer)} · ESI ${money(p.esi_employer)}`}
          </p>
        </article>
      )}
    </>
  );
}

/** The page-head download, for the slip chosen below. */
export function PayslipDownload() {
  const params = useSearchParams();
  const id = params.get("id");
  const [err, setErr] = useState<string | null>(null);
  return (
    <button
      type="button"
      className="btn primary"
      disabled={!id}
      title={err ?? undefined}
      onClick={() =>
        id &&
        downloadAuthed(`/api/v1/school/payroll/payslips/${id}/pdf`, `payslip-${id}.pdf`).catch((e) => {
          setErr(errorText(e));
          window.alert(errorText(e));
        })
      }
    >
      <Icon name="download" className="sm" />
      Download payslip
    </button>
  );
}
