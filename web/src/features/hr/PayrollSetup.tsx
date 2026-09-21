"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { PayrollSettings, Salary, StaffPayRow } from "./types";
import { Field, today } from "./ui";

const EARNINGS: [keyof Salary, string][] = [
  ["basic", "Basic pay"],
  ["da", "Dearness allowance"],
  ["hra", "House rent allowance"],
  ["conveyance", "Conveyance"],
  ["special_allowance", "Special allowance"],
  ["other_allowance", "Other allowance"],
];

const RATES: [keyof PayrollSettings, string, number | undefined][] = [
  ["pf_employee_rate", "PF employee %", 100],
  ["pf_employer_rate", "PF employer %", 100],
  ["pf_wage_ceiling", "PF wage ceiling ₹", undefined],
  ["esi_employee_rate", "ESI employee %", 100],
  ["esi_employer_rate", "ESI employer %", 100],
  ["esi_gross_ceiling", "ESI gross limit ₹", undefined],
  ["default_professional_tax", "Default professional tax ₹", undefined],
];

/**
 * SCR-183, live: GET /api/v1/school/payroll/staff for each person's current
 * structure, PUT /payroll/staff/{id}/salary to set or revise it (same
 * effective date corrects, a later one revises), GET/PATCH
 * /payroll/settings for the statutory rates.
 */
export function PayrollSetup() {
  const router = useRouter();
  const path = usePathname();
  const id = useSearchParams().get("id");
  const staff = useApi<StaffPayRow[]>("/api/v1/school/payroll/staff");
  const settings = useApi<PayrollSettings>("/api/v1/school/payroll/settings");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [gross, setGross] = useState(0);

  const row = staff.data?.find((s) => String(s.staff_id) === id) ?? null;
  const s = row?.salary ?? null;
  const pick = (v: string) => router.replace(v ? `${path}?id=${v}` : path, { scroll: false });

  // Open the first person without a salary, or the first on the list.
  useEffect(() => {
    if (!id && staff.data?.length) pick(String((staff.data.find((x) => x.is_active && !x.salary) ?? staff.data[0]).staff_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, staff.data]);

  useEffect(() => setGross(s ? Number(s.monthly_gross) : 0), [s]);

  async function saveSalary(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!row) return;
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? "").trim();
    const upper = (k: string) => text(k).toUpperCase() || null;
    setBusy(true);
    setErr(null);
    try {
      await api.put(`/api/v1/school/payroll/staff/${row.staff_id}/salary`, {
        effective_from: text("effective_from"),
        basic: text("basic") || "0",
        da: text("da") || "0",
        hra: text("hra") || "0",
        conveyance: text("conveyance") || "0",
        special_allowance: text("special_allowance") || "0",
        other_allowance: text("other_allowance") || "0",
        pf_applicable: f.get("pf_applicable") === "on",
        esi_applicable: f.get("esi_applicable") === "on",
        professional_tax: text("professional_tax") === "" ? null : text("professional_tax"),
        tds_monthly: text("tds_monthly") || "0",
        bank_name: text("bank_name") || null,
        bank_account_no: text("bank_account_no") || null,
        bank_ifsc: upper("bank_ifsc"),
        pan: upper("pan"),
        uan: text("uan") || null,
      });
      notify(`Salary saved for ${row.full_name}.`);
      staff.reload();
    } catch (x) {
      setErr(errorText(x));
    } finally {
      setBusy(false);
    }
  }

  async function saveRates(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(RATES.map(([k]) => [k, String(f.get(k) ?? "").trim() || null]));
    setErr(null);
    try {
      await api.patch("/api/v1/school/payroll/settings", body);
      notify("Statutory rates saved. They apply to payroll you run or recalculate from now.");
      settings.reload();
    } catch (x) {
      setErr(errorText(x));
    }
  }

  const recount = (e: FormEvent<HTMLFormElement>) => {
    const f = new FormData(e.currentTarget);
    setGross(EARNINGS.reduce((t, [k]) => t + (Number(f.get(k)) || 0), 0));
  };

  const components: Row[] = s
    ? [
        ...EARNINGS.map(([k, name]) => [name, money(s[k] as string), "Monthly", "Earning", Number(s[k]) > 0 ? "Active" : "Not paid"]),
        ["Provident fund", settings.data ? `${settings.data.pf_employee_rate}% of wage` : "—", "Monthly", "Deduction", s.pf_applicable ? "Active" : "Not applicable"],
        ["ESI", settings.data ? `${settings.data.esi_employee_rate}% of gross` : "—", "Monthly", "Deduction", s.esi_applicable ? "Active" : "Not applicable"],
        ["Professional tax", money(s.professional_tax ?? settings.data?.default_professional_tax), "Monthly", "Deduction", s.professional_tax === null ? "School default" : "Active"],
        ["TDS", money(s.tds_monthly), "Monthly", "Deduction", Number(s.tds_monthly) > 0 ? "Active" : "Not deducted"],
      ]
    : [];

  const missing = (staff.data ?? []).filter((x) => x.is_active && !x.salary).length;

  return (
    <div className="stack">
      <div className="filterbar">
        <select aria-label="Staff member" value={id ?? ""} onChange={(e) => pick(e.target.value)}>
          <option value="">{staff.loading ? "Loading staff…" : "Choose a staff member"}</option>
          {staff.data?.map((x) => (
            <option key={x.staff_id} value={x.staff_id}>
              {`${x.full_name} · ${x.employee_no}${x.salary ? "" : " (no salary set)"}${x.is_active ? "" : " (inactive)"}`}
            </option>
          ))}
        </select>
        <span className="muted small">{staff.data ? `${staff.data.length} staff on record · ${missing} active without a salary (a payroll run skips them)` : ""}</span>
      </div>
      <ErrorNote>{err ?? staff.error ?? settings.error}</ErrorNote>
      <form id="payroll-setup" className="panel" onSubmit={saveSalary} onChange={recount} key={`${row?.staff_id}-${s?.id}`}>
        <div className="panel-head">
          <div>
            <h2>Salary structure</h2>
            <p>{row ? `${row.full_name} · ${row.designation ?? "—"}${s ? ` · current since ${date(s.effective_from)}` : " · no salary set yet"}` : "Choose a staff member"}</p>
          </div>
          <strong className="mono">{`${money(gross)} / month`}</strong>
        </div>
        <div className="panel-body">
          <fieldset disabled={!row || busy} style={{ border: 0, padding: 0, margin: 0 }}>
            <div className="form-grid">
              <Field label="Effective from" required>
                <input name="effective_from" type="date" required defaultValue={s?.effective_from ?? today()} />
              </Field>
              <Field label="Pay cycle">
                <input value="Monthly" readOnly />
              </Field>
              {EARNINGS.map(([k, name]) => (
                <Field key={k} label={`${name} (₹)`} required={k === "basic"}>
                  <input name={k} type="number" min={0} step="0.01" required={k === "basic"} defaultValue={s ? Number(s[k]) : ""} />
                </Field>
              ))}
              <Field label="Professional tax (₹)">
                <input name="professional_tax" type="number" min={0} step="0.01" defaultValue={s?.professional_tax ?? ""} placeholder="School default" />
              </Field>
              <Field label="TDS per month (₹)">
                <input name="tds_monthly" type="number" min={0} step="0.01" defaultValue={s ? Number(s.tds_monthly) : 0} />
              </Field>
              <label className="field">
                <span>Provident fund</span>
                <span className="row">
                  <input type="checkbox" name="pf_applicable" defaultChecked={s?.pf_applicable ?? true} /> Deduct PF
                </span>
              </label>
              <label className="field">
                <span>ESI</span>
                <span className="row">
                  <input type="checkbox" name="esi_applicable" defaultChecked={s?.esi_applicable ?? true} /> Deduct ESI (if gross is within the limit)
                </span>
              </label>
              <Field label="Bank">
                <input name="bank_name" maxLength={120} defaultValue={s?.bank_name ?? ""} />
              </Field>
              <Field label="Account no.">
                <input name="bank_account_no" maxLength={34} defaultValue={s?.bank_account_no ?? ""} />
              </Field>
              <Field label="IFSC">
                <input name="bank_ifsc" defaultValue={s?.bank_ifsc ?? ""} />
              </Field>
              <Field label="PAN">
                <input name="pan" defaultValue={s?.pan ?? ""} />
              </Field>
              <Field label="UAN">
                <input name="uan" defaultValue={s?.uan ?? ""} />
              </Field>
            </div>
          </fieldset>
        </div>
        <div className="form-footer">
          <span>Same effective date corrects the structure; a later date records a revision.</span>
          <button type="submit" className="btn primary" disabled={!row || busy}>
            <Icon name="check" className="sm" />
            {busy ? "Saving…" : "Save payroll setup"}
          </button>
        </div>
      </form>
      <Panel title="Salary components" sub={s ? `Current structure for ${row?.full_name}` : "Shown once a salary is set"} flush>
        <DataTable columns={["Component", "Amount", "Frequency", "Type", "Status"]} rows={components} selectable={false} rowAction={false} empty="No salary set for this person yet." />
      </Panel>
      <form className="panel" onSubmit={saveRates} key={JSON.stringify(settings.data)}>
        <div className="panel-head">
          <div>
            <h2>Statutory rates</h2>
            <p>School-wide; used when payroll is run or recalculated</p>
          </div>
        </div>
        <div className="panel-body">
          <div className="form-grid">
            {RATES.map(([k, name, max]) => (
              <Field key={k} label={name}>
                <input name={k} type="number" min={0} max={max} step="0.01" defaultValue={settings.data ? Number(settings.data[k]) : ""} />
              </Field>
            ))}
          </div>
        </div>
        <div className="form-footer">
          <span>Professional tax varies by state; override it per person above.</span>
          <button type="submit" className="btn" disabled={!settings.data}>
            <Icon name="check" className="sm" />
            Save rates
          </button>
        </div>
      </form>
    </div>
  );
}
