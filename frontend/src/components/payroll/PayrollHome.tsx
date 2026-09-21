"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { CalendarCheck, IndianRupee, TriangleAlert, Users } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Table, inr, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

import { Run, monthLabel, runTone } from "./types";

type Salary = {
  id: number;
  effective_from: string;
  basic: string;
  da: string;
  hra: string;
  conveyance: string;
  special_allowance: string;
  other_allowance: string;
  pf_applicable: boolean;
  esi_applicable: boolean;
  professional_tax: string | null;
  tds_monthly: string;
  bank_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  pan: string | null;
  uan: string | null;
  monthly_gross: string;
};

type StaffRow = {
  staff_id: number;
  full_name: string;
  employee_no: string;
  designation: string | null;
  is_active: boolean;
  salary: Salary | null;
};

type Settings = Record<
  | "pf_employee_rate"
  | "pf_employer_rate"
  | "pf_wage_ceiling"
  | "esi_employee_rate"
  | "esi_employer_rate"
  | "esi_gross_ceiling"
  | "default_professional_tax",
  string
>;

/** Payroll landing page: monthly runs, salary structures, statutory settings. */
export function PayrollHome({ basePath }: { basePath: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"runs" | "salaries" | "settings">("runs");
  const [runs, setRuns] = useState<Run[]>([]);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [editing, setEditing] = useState<StaffRow | null>(null);

  async function load() {
    try {
      const [r, s] = await Promise.all([
        api.get<Run[]>("/api/v1/school/payroll/runs"),
        api.get<StaffRow[]>("/api/v1/school/payroll/staff"),
      ]);
      setRuns(r.data);
      setStaff(s.data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createRun(e: FormEvent) {
    e.preventDefault();
    try {
      const { data } = await api.post<Run>("/api/v1/school/payroll/runs", { period });
      router.push(`${basePath}/runs/${data.id}`);
    } catch (err) {
      setError(apiError(err));
    }
  }

  const withoutSalary = staff.filter((s) => s.is_active && !s.salary);
  const onPayroll = staff.filter((s) => s.is_active && s.salary).length;
  const paidRuns = runs.filter((r) => r.status === "paid").length;
  // Periods are "YYYY-MM", so the highest string is the latest month. The
  // figure below is that one run's net pay and is labelled as such — a
  // month's payroll is not "total payroll", and a tile that says otherwise
  // is a number somebody will quote in a governors' meeting.
  const latest = runs.length
    ? runs.reduce((a, b) => (b.period > a.period ? b : a))
    : null;

  return (
    <div className="space-y-[18px]">
      <PageHeader title="Payroll" subtitle="Salary structures, monthly payroll, payslips and the bank transfer file." />

      <StatStrip
        stats={[
          {
            label: "Payroll runs",
            value: runs.length,
            note: runs.length ? `${paidRuns} marked paid` : "None run yet",
            icon: CalendarCheck,
          },
          {
            label: "On payroll",
            value: onPayroll,
            note: `${staff.length} staff on record`,
            icon: Users,
          },
          {
            label: "No salary set",
            value: withoutSalary.length,
            note: "Active staff a run would skip",
            icon: TriangleAlert,
          },
          {
            label: "Latest run, net pay",
            value: latest ? inr(latest.total_net) : "—",
            note: latest
              ? `${monthLabel(latest.period)} · ${latest.staff_count} staff`
              : undefined,
            icon: IndianRupee,
          },
        ]}
      />

      <nav className="flex gap-1 border-b border-surface-border">
        {(["runs", "salaries", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {t === "runs" ? "Monthly payroll" : t === "salaries" ? "Salaries" : "Settings"}
          </button>
        ))}
      </nav>
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {tab === "runs" && (
        <>
          <Card>
            <CardBody>
              <form onSubmit={createRun} className="flex flex-wrap items-end gap-3">
                <Input label="Month" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} required />
                <Button type="submit">Run payroll</Button>
                {withoutSalary.length > 0 && (
                  <span className="text-sm text-warning">
                    {withoutSalary.length} active staff have no salary set and will be skipped.
                  </span>
                )}
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Monthly payroll</CardTitle>
                <p className="mt-[5px] text-[11px] text-ink-muted">
                  Every run the school has processed. Each total is that month&apos;s alone.
                </p>
              </div>
            </CardHeader>
            <Table head={["Month", "Status", "Staff", "Gross", "Deductions", "Net pay", "Employer cost", ""]} empty={runs.length === 0 && "No payroll yet."}>
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-surface-hover">
                  <td className={tdStrong}>{r.period}</td>
                  <td className="px-4 py-3">
                    <Badge tone={runTone[r.status]}>{r.status}</Badge>
                    {r.paid_on && <div className="text-xs text-ink-subtle">on {r.paid_on}</div>}
                  </td>
                  <td className={td}>{r.staff_count}</td>
                  <td className={td}>{inr(r.total_gross)}</td>
                  <td className={td}>{inr(r.total_deductions)}</td>
                  <td className={tdStrong}>{inr(r.total_net)}</td>
                  <td className={td}>{inr(r.total_employer_cost)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`${basePath}/runs/${r.id}`}>
                      <Button size="sm" variant="secondary">
                        Open
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </Table>
            <PanelFooter
              left={`Showing ${runs.length} run(s)`}
              right={runs.length ? `${paidRuns} paid, ${runs.length - paidRuns} not yet` : undefined}
            />
          </Card>
        </>
      )}

      {tab === "salaries" && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Salary structures</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">
                What each member of staff is on, and since when.
              </p>
            </div>
          </CardHeader>
          <Table head={["Staff", "Designation", "Monthly gross", "PF / ESI", "Bank", "Since", ""]}>
            {staff.map((s) => (
              <tr key={s.staff_id} className="hover:bg-surface-hover">
                <td className={tdStrong}>
                  {s.full_name} {!s.is_active && <Badge>inactive</Badge>}
                  <div className="text-xs font-normal text-ink-subtle">{s.employee_no}</div>
                </td>
                <td className={td}>{s.designation ?? "—"}</td>
                <td className={td}>{s.salary ? inr(s.salary.monthly_gross) : <span className="text-warning">not set</span>}</td>
                <td className={td}>
                  {s.salary ? `${s.salary.pf_applicable ? "PF" : "—"} / ${s.salary.esi_applicable ? "ESI" : "—"}` : "—"}
                </td>
                <td className={td}>{s.salary?.bank_account_no ? `${s.salary.bank_ifsc} ••${s.salary.bank_account_no.slice(-4)}` : "—"}</td>
                <td className={td}>{s.salary?.effective_from ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>
                    {s.salary ? "Revise" : "Set salary"}
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
          <PanelFooter
            left={`Showing ${staff.length} member(s) of staff`}
            right={withoutSalary.length ? `${withoutSalary.length} active staff with no salary set` : "Every active member of staff has a salary"}
          />
        </Card>
      )}

      {tab === "settings" && <SettingsCard onSaved={() => setNotice("Settings saved. They apply to payroll you run or recalculate from now.")} />}

      {editing && (
        <SalaryModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setNotice(`Salary saved for ${editing.full_name}.`);
            load();
          }}
        />
      )}
    </div>
  );
}

function SalaryModal({ row, onClose, onSaved }: { row: StaffRow; onClose: () => void; onSaved: () => void }) {
  const s = row.salary;
  const firstOfMonth = new Date().toISOString().slice(0, 8) + "01";
  const [form, setForm] = useState({
    effective_from: firstOfMonth,
    basic: s?.basic ?? "",
    da: s?.da ?? "0",
    hra: s?.hra ?? "0",
    conveyance: s?.conveyance ?? "0",
    special_allowance: s?.special_allowance ?? "0",
    other_allowance: s?.other_allowance ?? "0",
    pf_applicable: s?.pf_applicable ?? true,
    esi_applicable: s?.esi_applicable ?? true,
    professional_tax: s?.professional_tax ?? "",
    tds_monthly: s?.tds_monthly ?? "0",
    bank_name: s?.bank_name ?? "",
    bank_account_no: s?.bank_account_no ?? "",
    bank_ifsc: s?.bank_ifsc ?? "",
    pan: s?.pan ?? "",
    uan: s?.uan ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gross = ["basic", "da", "hra", "conveyance", "special_allowance", "other_allowance"].reduce(
    (t, k) => t + Number(form[k as keyof typeof form] || 0),
    0
  );
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const n = (v: string) => (v.trim() ? v.trim().toUpperCase() : null);
    try {
      await api.put(`/api/v1/school/payroll/staff/${row.staff_id}/salary`, {
        ...form,
        professional_tax: form.professional_tax === "" ? null : form.professional_tax,
        bank_name: form.bank_name.trim() || null,
        bank_account_no: form.bank_account_no.trim() || null,
        bank_ifsc: n(form.bank_ifsc),
        pan: n(form.pan),
        uan: form.uan.trim() || null,
      });
      onSaved();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Salary — ${row.full_name}`} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Effective from *"
          type="date"
          value={form.effective_from}
          onChange={set("effective_from")}
          hint={s ? `Current structure since ${s.effective_from}. Same date corrects it; a later date is a revision.` : undefined}
          required
        />
        <div className="text-xs font-semibold uppercase text-ink-subtle">Monthly earnings (₹)</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Basic *" type="number" min="0" step="0.01" value={form.basic} onChange={set("basic")} required />
          <Input label="Dearness allowance" type="number" min="0" step="0.01" value={form.da} onChange={set("da")} />
          <Input label="HRA" type="number" min="0" step="0.01" value={form.hra} onChange={set("hra")} />
          <Input label="Conveyance" type="number" min="0" step="0.01" value={form.conveyance} onChange={set("conveyance")} />
          <Input label="Special allowance" type="number" min="0" step="0.01" value={form.special_allowance} onChange={set("special_allowance")} />
          <Input label="Other allowance" type="number" min="0" step="0.01" value={form.other_allowance} onChange={set("other_allowance")} />
        </div>
        <div className="text-sm text-ink-muted">Monthly gross: {inr(gross)}</div>
        <div className="text-xs font-semibold uppercase text-ink-subtle">Deductions</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={form.pf_applicable} onChange={(e) => setForm({ ...form, pf_applicable: e.target.checked })} />
            Provident fund
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={form.esi_applicable} onChange={(e) => setForm({ ...form, esi_applicable: e.target.checked })} />
            ESI (if gross within limit)
          </label>
          <div />
          <Input label="Professional tax" placeholder="School default" type="number" min="0" value={form.professional_tax} onChange={set("professional_tax")} />
          <Input label="TDS per month" type="number" min="0" value={form.tds_monthly} onChange={set("tds_monthly")} />
        </div>
        <div className="text-xs font-semibold uppercase text-ink-subtle">Bank & statutory IDs</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Bank" value={form.bank_name} onChange={set("bank_name")} />
          <Input label="Account no." value={form.bank_account_no} onChange={set("bank_account_no")} />
          <Input label="IFSC" value={form.bank_ifsc} onChange={set("bank_ifsc")} />
          <Input label="PAN" value={form.pan} onChange={set("pan")} />
          <Input label="UAN" value={form.uan} onChange={set("uan")} />
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function SettingsCard({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Settings>("/api/v1/school/payroll/settings").then((r) => setForm(r.data)).catch((e) => setError(apiError(e)));
  }, []);

  if (!form) return <ErrorBox>{error}</ErrorBox>;
  const set = (k: keyof Settings) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statutory rates</CardTitle>
      </CardHeader>
      <CardBody>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.patch("/api/v1/school/payroll/settings", form);
              onSaved();
            } catch (err) {
              setError(apiError(err));
            }
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="PF employee %" type="number" step="0.01" value={form.pf_employee_rate} onChange={set("pf_employee_rate")} />
            <Input label="PF employer %" type="number" step="0.01" value={form.pf_employer_rate} onChange={set("pf_employer_rate")} />
            <Input label="PF wage ceiling ₹" type="number" value={form.pf_wage_ceiling} onChange={set("pf_wage_ceiling")} />
            <Input label="ESI employee %" type="number" step="0.01" value={form.esi_employee_rate} onChange={set("esi_employee_rate")} />
            <Input label="ESI employer %" type="number" step="0.01" value={form.esi_employer_rate} onChange={set("esi_employer_rate")} />
            <Input label="ESI gross limit ₹" type="number" value={form.esi_gross_ceiling} onChange={set("esi_gross_ceiling")} />
            <Input
              label="Default professional tax ₹"
              type="number"
              value={form.default_professional_tax}
              onChange={set("default_professional_tax")}
              hint="Varies by state; override per staff member"
            />
          </div>
          <ErrorBox>{error}</ErrorBox>
          <Button type="submit">Save settings</Button>
        </form>
      </CardBody>
    </Card>
  );
}
