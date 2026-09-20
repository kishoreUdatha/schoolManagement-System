"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Table, inr, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";

import { Payslip, Run, monthLabel, runTone } from "./types";

type RunDetail = Run & { payslips: Payslip[] };

export function PayrollRunView({ runId, basePath }: { runId: string; basePath: string }) {
  const router = useRouter();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState<Payslip | null>(null);
  const [paying, setPaying] = useState(false);
  const url = `/api/v1/school/payroll/runs/${runId}`;

  async function load() {
    try {
      const { data } = await api.get<RunDetail>(url);
      setRun(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  async function act(path: string, msg: string) {
    try {
      const { data } = await api.post<RunDetail | Run>(`${url}/${path}`);
      if ("skipped_without_salary" in data && data.skipped_without_salary.length) {
        setNotice(`${msg} Skipped (no salary): ${data.skipped_without_salary.join(", ")}.`);
      } else {
        setNotice(msg);
      }
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function remove() {
    if (!run || !window.confirm(`Delete the ${monthLabel(run.period)} draft payroll?`)) return;
    try {
      await api.delete(url);
      router.push(basePath);
    } catch (e) {
      setError(apiError(e));
    }
  }

  if (!run) return <div className="text-sm text-ink-muted">{error ?? "Loading…"}</div>;
  const draft = run.status === "draft";

  return (
    <div className="space-y-6">
      <Link href={basePath} className="text-sm text-ink-muted hover:underline">
        ← Payroll
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Payroll · {monthLabel(run.period)}</h1>
          <div className="mt-1.5 text-[13px] text-ink-muted">
            <Badge tone={runTone[run.status]}>{run.status}</Badge>
            {run.paid_on && ` · paid on ${run.paid_on}${run.payment_ref ? ` (${run.payment_ref})` : ""}`}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {draft && (
            <>
              <Button variant="secondary" onClick={() => act("recalculate", "Recalculated from latest attendance and salaries.")}>
                Recalculate
              </Button>
              <Button variant="ghost" onClick={remove}>
                Delete draft
              </Button>
              <Button onClick={() => act("finalize", "Payroll finalized. Staff can now see their payslips.")}>Finalize</Button>
            </>
          )}
          {run.status === "finalized" && (
            <>
              <Button variant="ghost" onClick={() => act("reopen", "Reopened for changes.")}>
                Reopen
              </Button>
              <Button onClick={() => setPaying(true)}>Mark as paid</Button>
            </>
          )}
          {!draft && (
            <Button
              variant="secondary"
              onClick={() => openAuthed(`${url}/bank-file.csv`, `salary-${run.period}.csv`).catch((e) => setError(apiError(e)))}
            >
              Bank file (CSV)
            </Button>
          )}
        </div>
      </div>
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Staff" value={run.staff_count} />
        <StatCard label="Gross" value={inr(run.total_gross)} />
        <StatCard label="Net pay" value={inr(run.total_net)} accent="emerald" />
        <StatCard label="Employer cost" value={inr(run.total_employer_cost)} hint="Gross + employer PF & ESI" />
      </div>

      <Card>
        <Table head={["Staff", "Paid days", "Gross", "PF", "ESI", "PT", "TDS", "Other", "Net", ""]} empty={run.payslips.length === 0 && "No payslips."}>
          {run.payslips.map((p) => (
            <tr key={p.id} className="hover:bg-surface-hover">
              <td className={tdStrong}>
                {p.full_name}
                <div className="text-xs font-normal text-ink-subtle">
                  {p.employee_no}
                  {p.remarks && ` · ${p.remarks}`}
                </div>
              </td>
              <td className={td}>
                {Number(p.paid_days)}/{p.days_in_month}
                {Number(p.lop_days) > 0 && (
                  <div className="text-xs text-amber-500">
                    LOP {Number(p.lop_days)}
                    {p.lop_days !== p.lop_days_auto && ` (auto ${Number(p.lop_days_auto)})`}
                  </div>
                )}
              </td>
              <td className={td}>
                {inr(p.gross)}
                {Number(p.bonus) > 0 && <div className="text-xs text-ink-subtle">incl. bonus {inr(p.bonus)}</div>}
              </td>
              <td className={td}>{inr(p.pf_employee)}</td>
              <td className={td}>{inr(p.esi_employee)}</td>
              <td className={td}>{inr(p.professional_tax)}</td>
              <td className={td}>{inr(p.tds)}</td>
              <td className={td}>{inr(p.other_deduction)}</td>
              <td className={tdStrong}>{inr(p.net_pay)}</td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {draft && (
                  <Button size="sm" variant="secondary" onClick={() => setAdjusting(p)}>
                    Adjust
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => openAuthed(`/api/v1/school/payroll/payslips/${p.id}/pdf`).catch((e) => setError(apiError(e)))}
                >
                  Payslip
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {adjusting && (
        <AdjustModal
          url={`${url}/payslips/${adjusting.id}`}
          slip={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            load();
          }}
        />
      )}
      {paying && (
        <PaidModal
          url={`${url}/paid`}
          onClose={() => setPaying(false)}
          onSaved={() => {
            setPaying(false);
            setNotice("Marked as paid.");
            load();
          }}
        />
      )}
    </div>
  );
}

function AdjustModal({ url, slip, onClose, onSaved }: { url: string; slip: Payslip; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    lop_days: String(Number(slip.lop_days)),
    bonus: String(Number(slip.bonus)),
    other_deduction: String(Number(slip.other_deduction)),
    tds: String(Number(slip.tds)),
    remarks: slip.remarks ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await api.patch(url, { ...form, remarks: form.remarks.trim() || null });
      onSaved();
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <Modal open onClose={onClose} title={`Adjust — ${slip.full_name}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Loss-of-pay days"
            type="number"
            min="0"
            max={slip.days_in_month}
            step="0.5"
            value={form.lop_days}
            onChange={set("lop_days")}
            hint={`From attendance: ${Number(slip.lop_days_auto)}`}
          />
          <Input label="Bonus / arrears ₹" type="number" min="0" value={form.bonus} onChange={set("bonus")} />
          <Input label="TDS ₹" type="number" min="0" value={form.tds} onChange={set("tds")} />
          <Input label="Other deductions ₹" type="number" min="0" value={form.other_deduction} onChange={set("other_deduction")} hint="Advance recovery, fines…" />
        </div>
        <Input label="Remarks (shown on payslip)" value={form.remarks} onChange={set("remarks")} />
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save & recompute</Button>
        </div>
      </form>
    </Modal>
  );
}

function PaidModal({ url, onClose, onSaved }: { url: string; onClose: () => void; onSaved: () => void }) {
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title="Mark payroll as paid">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.post(url, { paid_on: paidOn, payment_ref: ref.trim() || null });
            onSaved();
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Paid on *" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} required />
          <Input label="Bank batch / reference" value={ref} onChange={(e) => setRef(e.target.value)} />
        </div>
        <p className="text-xs text-ink-subtle">Paid payroll is locked permanently.</p>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Mark paid</Button>
        </div>
      </form>
    </Modal>
  );
}
