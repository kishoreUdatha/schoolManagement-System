"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { Payslip, Run, RunDetail } from "./types";
import { Dialog, Field, downloadAuthed, monthLabel, today, useNewFlag } from "./ui";

import { ask } from "@/lib/dialog";
const BASE = "/api/v1/school/payroll/runs";
const allowances = (p: Payslip) => ["da", "hra", "conveyance", "special_allowance", "other_allowance", "bonus"].reduce((t, k) => t + Number(p[k as keyof Payslip] ?? 0), 0);

/**
 * SCR-184, live: GET /api/v1/school/payroll/runs and /runs/{id} (?id=);
 * POST /runs to start a month, /recalculate, /finalize, /reopen, /paid;
 * PATCH /runs/{id}/payslips/{slip} to adjust a draft slip; DELETE a draft;
 * GET /runs/{id}/bank-file.csv. Every figure is this one run's month.
 */
export function PayrollProcessing() {
  const router = useRouter();
  const path = usePathname();
  const id = useSearchParams().get("id");
  const runs = useApi<Run[]>(BASE);
  const run = useApi<RunDetail>(id ? `${BASE}/${id}` : null);
  const [creating, closeCreating] = useNewFlag();
  const [adjusting, setAdjusting] = useState<Payslip | null>(null);
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = (v: number | string | null, extra = "") => router.replace(v ? `${path}?id=${v}${extra}` : path, { scroll: false });

  // Open the latest month when none is named.
  useEffect(() => {
    if (!id && runs.data?.length) open(runs.data.reduce((a, b) => (b.period > a.period ? b : a)).id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, runs.data]);

  async function act(fn: () => Promise<unknown>, done: string) {
    setErr(null);
    setBusy(true);
    try {
      const r = (await fn()) as Partial<Run> | null;
      notify(r?.skipped_without_salary?.length ? `${done} Skipped (no salary set): ${r.skipped_without_salary.join(", ")}.` : done);
      run.reload();
      runs.reload();
      return true;
    } catch (e) {
      setErr(errorText(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: FormEvent<HTMLFormElement>) {
    const period = String(new FormData(e.currentTarget).get("period") ?? "");
    setErr(null);
    setBusy(true);
    try {
      const r = await api.post<RunDetail>(BASE, { period });
      notify(r.skipped_without_salary.length ? `Payroll drafted. Skipped (no salary set): ${r.skipped_without_salary.join(", ")}.` : "Payroll drafted from attendance and salaries.");
      runs.reload();
      closeCreating();
      open(r.id);
    } catch (x) {
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  }

  async function adjust(e: FormEvent<HTMLFormElement>) {
    if (!adjusting || !r) return;
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    const ok = await act(
      () =>
        api.patch(`${BASE}/${r.id}/payslips/${adjusting.id}`, {
          lop_days: v("lop_days") || null,
          bonus: v("bonus") || null,
          other_deduction: v("other_deduction") || null,
          tds: v("tds") || null,
          remarks: v("remarks") || null,
        }),
      `${adjusting.full_name}'s payslip adjusted.`,
    );
    if (ok) setAdjusting(null);
  }

  async function paid(e: FormEvent<HTMLFormElement>) {
    if (!r) return;
    const f = new FormData(e.currentTarget);
    const ok = await act(
      () => api.post(`${BASE}/${r.id}/paid`, { paid_on: String(f.get("paid_on")), payment_ref: String(f.get("payment_ref") ?? "").trim() || null }),
      "Payroll marked as paid.",
    );
    if (ok) setPaying(false);
  }

  const r = run.data;
  const month = r ? monthLabel(r.period) : "";
  const stats = [
    { label: "Employees", value: r ? String(r.staff_count) : "…", note: r ? `On the ${month} run` : "This run" },
    { label: "Gross payroll", value: r ? money(r.total_gross) : "…", note: r ? `Basic + allowances · ${month}` : "Basic + allowances" },
    { label: "Deductions", value: r ? money(r.total_deductions) : "…", note: r ? `PF, ESI, PT, TDS · ${month}` : "PF, ESI, PT, TDS" },
    { label: "Net payroll", value: r ? money(r.total_net) : "…", note: r ? `Amount payable · ${month}` : "Amount payable" },
  ];
  const slips = r?.payslips ?? [];
  const rows: Row[] = slips.map((p) => [
    { name: p.full_name, sub: [p.employee_no, `${Number(p.paid_days)}/${p.days_in_month} days`, p.remarks].filter(Boolean).join(" · ") },
    money(p.basic),
    money(allowances(p)),
    money(p.total_deductions),
    money(p.net_pay),
    Number(p.lop_days) > 0 ? `LOP ${Number(p.lop_days)} days` : label(p.run_status),
  ]);
  const draft = r?.status === "draft";

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <select aria-label="Payroll month" value={id ?? ""} onChange={(e) => open(e.target.value)}>
          <option value="">{runs.loading ? "Loading runs…" : runs.data?.length ? "Choose a month" : "No payroll run yet"}</option>
          {runs.data?.map((x) => (
            <option key={x.id} value={x.id}>
              {`${monthLabel(x.period)} · ${label(x.status)}`}
            </option>
          ))}
        </select>
        {r ? (
          <>
            {draft ? (
              <>
                <button type="button" className="btn" disabled={busy} onClick={() => act(() => api.post(`${BASE}/${r.id}/recalculate`), "Recalculated from the latest attendance and salaries.")}>
                  Recalculate
                </button>
                <button type="button" className="btn primary" disabled={busy} onClick={async () => (await ask(`Finalise the ${month} payroll? Staff will see their payslips.`)) && act(() => api.post(`${BASE}/${r.id}/finalize`), "Payroll finalised. Staff can now see their payslips.")}>
                  Finalise
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={async () => {
                    if (!(await ask(`Delete the ${month} draft payroll?`))) return;
                    if (await act(() => api.delete(`${BASE}/${r.id}`), "Draft deleted.")) open(null);
                  }}
                >
                  Delete draft
                </button>
              </>
            ) : null}
            {r.status === "finalized" ? (
              <>
                <button type="button" className="btn" disabled={busy} onClick={async () => (await ask("Reopen this finalised payroll for changes? Payslips can be edited again until it is finalised.")) && act(() => api.post(`${BASE}/${r.id}/reopen`), "Reopened for changes.")}>
                  Reopen
                </button>
                <button type="button" className="btn primary" disabled={busy} onClick={() => setPaying(true)}>
                  Mark as paid
                </button>
              </>
            ) : null}
            {!draft ? (
              <button type="button" className="btn" onClick={() => downloadAuthed(`${BASE}/${r.id}/bank-file.csv`, `salary-${r.period}.csv`).catch((e) => setErr(errorText(e)))}>
                Bank file (CSV)
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <ErrorNote>{err ?? runs.error ?? run.error}</ErrorNote>
      {r?.skipped_without_salary.length ? (
        <div className="tip warn" style={{ marginBottom: 16 }}>
          <span>{`Skipped because no salary is set: ${r.skipped_without_salary.join(", ")}.`}</span>
        </div>
      ) : null}
      <Panel
        title={r ? `${month} payroll` : "Payroll"}
        sub={r ? (draft ? "Review amounts before finalising · figures change when you recalculate" : r.paid_on ? `Paid on ${date(r.paid_on)}${r.payment_ref ? ` · ${r.payment_ref}` : ""}` : "Finalised · staff can see these payslips") : "Choose a month, or start a new run"}
        action={r ? <Badge>{label(r.status)}</Badge> : undefined}
        flush
      >
        <DataTable
          columns={["Employee", "Basic pay", "Allowances", "Deductions", "Net pay", "Status"]}
          rows={rows}
          selectable={false}
          onView={(i) => (draft ? setAdjusting(slips[i]) : router.push(`${routeOf(185)}?run=${r?.id}&id=${slips[i].id}`))}
          empty={run.loading ? "Loading payslips…" : r ? "No payslips on this run." : "No run chosen."}
        />
      </Panel>

      {creating ? (
        <Dialog title="New payroll run" onClose={closeCreating} onSubmit={create} submit="Draft payroll" busy={busy} error={err}>
          <p>Drafts every active member of staff with a salary, taking loss-of-pay days from attendance. Nothing is paid until you finalise and mark it paid.</p>
          <Field label="Month" required>
            <input name="period" type="month" required defaultValue={today().slice(0, 7)} />
          </Field>
        </Dialog>
      ) : null}

      {adjusting ? (
        <Dialog title={`Adjust · ${adjusting.full_name}`} onClose={() => setAdjusting(null)} onSubmit={adjust} submit="Save adjustment" busy={busy} error={err}>
          <p>{`Gross ${money(adjusting.gross)} · deductions ${money(adjusting.total_deductions)} · net ${money(adjusting.net_pay)}. Loss-of-pay from attendance: ${Number(adjusting.lop_days_auto)} day(s).`}</p>
          <div className="form-grid">
            <Field label="Loss-of-pay days">
              <input name="lop_days" type="number" min={0} max={31} step="0.5" defaultValue={Number(adjusting.lop_days)} />
            </Field>
            <Field label="Bonus (₹)">
              <input name="bonus" type="number" min={0} step="0.01" defaultValue={Number(adjusting.bonus)} />
            </Field>
            <Field label="TDS (₹)">
              <input name="tds" type="number" min={0} step="0.01" defaultValue={Number(adjusting.tds)} />
            </Field>
            <Field label="Other deduction (₹)">
              <input name="other_deduction" type="number" min={0} step="0.01" defaultValue={Number(adjusting.other_deduction)} />
            </Field>
            <Field label="Remarks" full>
              <input name="remarks" maxLength={300} defaultValue={adjusting.remarks ?? ""} />
            </Field>
          </div>
        </Dialog>
      ) : null}

      {paying && r ? (
        <Dialog title={`Mark ${month} as paid`} onClose={() => setPaying(false)} onSubmit={paid} submit="Mark as paid" busy={busy} error={err}>
          <div className="form-grid">
            <Field label="Paid on" required>
              <input name="paid_on" type="date" required defaultValue={today()} />
            </Field>
            <Field label="Payment reference">
              <input name="payment_ref" maxLength={120} placeholder="NEFT batch or UTR" />
            </Field>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
