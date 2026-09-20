"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select, Table, humanize, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

export type LeaveType = {
  id: number;
  name: string;
  code: string;
  kind: string;
  annual_days: string;
  is_paid: boolean;
  carry_forward_max: string;
  document_after_days: number | null;
  is_active: boolean;
};
export type Balance = {
  id: number;
  user_id: number;
  user_name: string;
  leave_type_id: number;
  leave_type_name: string;
  year: number;
  allotted: string;
  carried_forward: string;
  adjustment: string;
  used: string;
  available: string;
  note: string | null;
  is_paid: boolean;
};

const base = "/api/v1/school/hr";
const KINDS = ["casual", "sick", "earned", "unpaid", "other"];

export function LeaveSetup({ canEdit }: { canEdit: boolean }) {
  const thisYear = new Date().getFullYear();
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [year, setYear] = useState(String(thisYear));
  const [form, setForm] = useState({ id: 0, name: "", code: "", kind: "casual", annual_days: "12", is_paid: true, carry_forward_max: "0", document_after_days: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadTypes = () => api.get<LeaveType[]>(`${base}/leave-types`).then((r) => setTypes(r.data)).catch((e) => setError(apiError(e)));
  const loadBalances = () =>
    api.get<Balance[]>(`${base}/leave-balances`, { params: { year } }).then((r) => setBalances(r.data)).catch((e) => setError(apiError(e)));

  useEffect(() => {
    loadTypes();
  }, []);
  useEffect(() => {
    loadBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      setNotice(done);
      setError(null);
      loadTypes();
      loadBalances();
      return true;
    } catch (e) {
      setError(apiError(e));
      return false;
    }
  }

  async function saveType(e: FormEvent) {
    e.preventDefault();
    const body = {
      name: form.name,
      code: form.code.toUpperCase(),
      kind: form.kind,
      annual_days: form.annual_days,
      is_paid: form.is_paid,
      carry_forward_max: form.carry_forward_max,
      document_after_days: form.document_after_days ? Number(form.document_after_days) : null,
      is_active: true,
    };
    const ok = await run(
      () => (form.id ? api.put(`${base}/leave-types/${form.id}`, body) : api.post(`${base}/leave-types`, body)),
      form.id ? "Leave type updated." : "Leave type added."
    );
    if (ok) setForm({ id: 0, name: "", code: "", kind: "casual", annual_days: "12", is_paid: true, carry_forward_max: "0", document_after_days: "" });
  }

  const byStaff = balances.reduce<Record<string, Balance[]>>((acc, b) => {
    (acc[b.user_name] ||= []).push(b);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      <Card>
        <CardHeader>
          <CardTitle>Leave types</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {canEdit && (
            <form className="flex flex-wrap items-end gap-2" onSubmit={saveType}>
              <Input label="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Casual leave" />
              <Input label="Code *" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="CL" />
              <div className="w-32">
                <Select label="Counts as" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {humanize(k)}
                    </option>
                  ))}
                </Select>
              </div>
              <Input label="Days a year" type="number" min={0} step="0.5" value={form.annual_days} onChange={(e) => setForm({ ...form, annual_days: e.target.value })} />
              <Input label="Carry forward up to" type="number" min={0} step="0.5" value={form.carry_forward_max} onChange={(e) => setForm({ ...form, carry_forward_max: e.target.value })} />
              <Input label="Proof after days" type="number" min={1} value={form.document_after_days} onChange={(e) => setForm({ ...form, document_after_days: e.target.value })} />
              <label className="flex items-center gap-2 pb-2 text-sm text-ink">
                <input type="checkbox" checked={form.is_paid} onChange={(e) => setForm({ ...form, is_paid: e.target.checked })} />
                Paid
              </label>
              <Button type="submit">{form.id ? "Save" : "Add"}</Button>
              {form.id > 0 && (
                <Button type="button" variant="ghost" onClick={() => setForm({ id: 0, name: "", code: "", kind: "casual", annual_days: "12", is_paid: true, carry_forward_max: "0", document_after_days: "" })}>
                  Cancel
                </Button>
              )}
            </form>
          )}
          <Table head={["Type", "Code", "Days a year", "Carry forward", "Paid", ""]} empty={types.length === 0 && "No leave types yet."}>
            {types.map((t) => (
              <tr key={t.id}>
                <td className={tdStrong}>
                  {t.name}
                  {!t.is_active && <Badge tone="rose" className="ml-2">off</Badge>}
                  {t.document_after_days && <div className="text-xs font-normal text-ink-subtle">proof needed beyond {t.document_after_days} days</div>}
                </td>
                <td className={td}>{t.code}</td>
                <td className={td}>{Number(t.annual_days)}</td>
                <td className={td}>{Number(t.carry_forward_max) || "—"}</td>
                <td className={td}>{t.is_paid ? "Yes" : "No"}</td>
                <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                  {canEdit && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setForm({
                            id: t.id, name: t.name, code: t.code, kind: t.kind, annual_days: String(Number(t.annual_days)),
                            is_paid: t.is_paid, carry_forward_max: String(Number(t.carry_forward_max)),
                            document_after_days: t.document_after_days ? String(t.document_after_days) : "",
                          })
                        }
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete ${t.name}?`) && run(() => api.delete(`${base}/leave-types/${t.id}`), "Deleted.")}>
                        Delete
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <CardTitle>Balances</CardTitle>
            <div className="flex items-end gap-2">
              <div className="w-28">
                <Select label="Year" value={year} onChange={(e) => setYear(e.target.value)}>
                  {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </div>
              {canEdit && (
                <Button
                  onClick={() =>
                    window.confirm(`Give every staff member their ${year} leave? Existing balances are updated, days already used are kept.`) &&
                    run(async () => {
                      const r = await api.post<{ created: number; updated: number }>(`${base}/leave-balances/allot`, { year: Number(year), carry_forward: true });
                      setNotice(`${r.data.created} balance(s) created, ${r.data.updated} updated.`);
                    }, "")
                  }
                >
                  Allot {year}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {balances.length === 0 ? (
            <p className="text-sm text-ink-subtle">Nothing allotted for {year} yet.</p>
          ) : (
            <div className="space-y-4">
              {Object.entries(byStaff).map(([name, rows]) => (
                <div key={name}>
                  <div className="mb-1 text-sm font-semibold text-ink">{name}</div>
                  <div className="flex flex-wrap gap-2">
                    {rows.map((b) => (
                      <div key={b.id} className="rounded-md border border-surface-border px-3 py-2 text-sm">
                        <div className="text-ink">{b.leave_type_name}</div>
                        <div className="text-xs text-ink-subtle">
                          {Number(b.available)} left of {Number(b.allotted) + Number(b.carried_forward) + Number(b.adjustment)}
                          {Number(b.carried_forward) > 0 && ` (incl. ${Number(b.carried_forward)} carried)`}
                          {Number(b.used) > 0 && ` · ${Number(b.used)} used`}
                        </div>
                        {b.note && <div className="text-xs text-ink-subtle">{b.note}</div>}
                        {canEdit && (
                          <button
                            type="button"
                            className="mt-1 text-xs text-brand-500 hover:underline"
                            onClick={() => {
                              const adjustment = window.prompt(`Adjust ${b.leave_type_name} for ${b.user_name} (+/- days)`, String(Number(b.adjustment)));
                              if (adjustment === null) return;
                              const note = window.prompt("Why?", b.note ?? "") ?? "";
                              run(() => api.patch(`${base}/leave-balances/${b.id}`, { adjustment, note: note || null }), "Balance adjusted.");
                            }}
                          >
                            Adjust
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
