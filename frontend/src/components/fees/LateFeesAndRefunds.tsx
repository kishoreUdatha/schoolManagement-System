"use client";

import { useEffect, useState } from "react";

import { StudentPicker } from "@/components/StudentPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, Select, Table, humanize, inr, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { Banknote, CheckCircle2, Inbox, Wallet } from "lucide-react";
import { api, apiError } from "@/lib/api";

type Head = { id: number; name: string };
type Rule = {
  id: number;
  name: string;
  fee_head_id: number | null;
  fee_head_name: string | null;
  charge_head_id: number;
  charge_head_name: string;
  basis: "per_day" | "once" | "percent_per_month";
  amount: string;
  grace_days: number;
  max_amount: string | null;
  is_active: boolean;
};
type PreviewRow = {
  student_fee_id: number;
  student_name: string;
  period: string;
  head_name: string;
  due_date: string;
  days_late: number;
  outstanding: string;
  rule_name: string;
  charge: string;
  already_charged: string;
  delta: string;
};
type Refund = {
  id: number;
  student_id: number;
  student_name: string;
  section_label: string | null;
  fee_label: string | null;
  amount: string;
  reason: string;
  mode: string;
  status: "requested" | "approved" | "rejected" | "processed";
  requested_by_name: string | null;
  decided_by_name: string | null;
  decision_note: string | null;
  processed_on: string | null;
  reference: string | null;
};
type Option = { student_fee_id: number; label: string; paid: string; refundable: string; receipt_no: string | null };

const base = "/api/v1/school/fees";
const statusTone = { requested: "amber", approved: "brand", rejected: "rose", processed: "emerald" } as const;
const today = () => new Date().toISOString().slice(0, 10);

/** `canApprove` = school admin or principal; accountants request and pay out. */
export function LateFeesAndRefunds({ canApprove }: { canApprove: boolean }) {
  const [heads, setHeads] = useState<Head[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; total: string; rules: number } | null>(null);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState({ id: 0, name: "", fee_head_id: "", charge_head_id: "", basis: "per_day", amount: "", grace_days: "0", max_amount: "" });
  const [newRefund, setNewRefund] = useState<{ student_id: number; student_name: string } | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [rf, setRf] = useState({ student_fee_id: "", amount: "", reason: "", mode: "bank_transfer" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRules = () => api.get<Rule[]>(`${base}/late-fee-rules`).then((r) => setRules(r.data)).catch((e) => setError(apiError(e)));
  const loadPreview = () => api.get<{ rows: PreviewRow[]; total: string; rules: number }>(`${base}/late-fees/preview`).then((r) => setPreview(r.data)).catch(() => setPreview(null));
  const loadRefunds = () =>
    api.get<Refund[]>(`${base}/refunds`, { params: status ? { status } : {} }).then((r) => setRefunds(r.data)).catch((e) => setError(apiError(e)));

  useEffect(() => {
    api.get<Head[]>("/api/v1/school/fees/heads").then((r) => setHeads(r.data)).catch(() => setHeads([]));
    loadRules();
    loadPreview();
  }, []);

  useEffect(() => {
    loadRefunds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      setNotice(done);
      setError(null);
      loadRules();
      loadPreview();
      loadRefunds();
      return true;
    } catch (e) {
      setError(apiError(e));
      return false;
    }
  }

  async function openRefund(student: { id: number; full_name: string }) {
    setNewRefund({ student_id: student.id, student_name: student.full_name });
    setRf({ student_fee_id: "", amount: "", reason: "", mode: "bank_transfer" });
    try {
      const r = await api.get<Option[]>(`${base}/refunds/options/${student.id}`);
      setOptions(r.data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  const decide = (r: Refund, approve: boolean) => {
    const note = window.prompt(approve ? "Note (optional)" : "Why is it rejected? (required)", "");
    if (note === null) return;
    run(() => api.post(`${base}/refunds/${r.id}/decide`, { approve, note: note.trim() || null }), approve ? "Approved." : "Rejected.");
  };

  const payout = (r: Refund) => {
    const on = window.prompt("Date paid out (YYYY-MM-DD)", today());
    if (!on) return;
    const reference = window.prompt("Reference (UTR, cheque no., …)", "") ?? "";
    run(() => api.post(`${base}/refunds/${r.id}/process`, { processed_on: on, reference: reference.trim() || null }), "Refund paid out and the parent told.");
  };

  // The state of the refund queue, counted off the refunds already loaded.
  const requested = refunds.filter((r) => r.status === "requested");
  const toPay = refunds.filter((r) => r.status === "approved");
  const paidOut = refunds.filter((r) => r.status === "processed");
  const waitingAmount = requested.reduce((n, r) => n + Number(r.amount), 0);

  return (
    <div className="space-y-6">
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Late fee rules</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              What is charged when a fee is paid late, and the head it is booked
              under.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const body = {
                name: form.name,
                fee_head_id: form.fee_head_id ? Number(form.fee_head_id) : null,
                charge_head_id: Number(form.charge_head_id),
                basis: form.basis,
                amount: form.amount,
                grace_days: Number(form.grace_days),
                max_amount: form.max_amount || null,
                is_active: true,
              };
              const ok = await run(
                () => (form.id ? api.put(`${base}/late-fee-rules/${form.id}`, body) : api.post(`${base}/late-fee-rules`, body)),
                form.id ? "Rule updated." : "Rule added."
              );
              if (ok) setForm({ id: 0, name: "", fee_head_id: "", charge_head_id: "", basis: "per_day", amount: "", grace_days: "0", max_amount: "" });
            }}
          >
            <Input label="Name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Monthly tuition late fee" />
            <div className="w-40">
              <Select label="Applies to" value={form.fee_head_id} onChange={(e) => setForm({ ...form, fee_head_id: e.target.value })}>
                <option value="">Every fee head</option>
                {heads.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <Select label="Charge under *" value={form.charge_head_id} onChange={(e) => setForm({ ...form, charge_head_id: e.target.value })} required>
                <option value="">Choose…</option>
                {heads.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <Select label="How" value={form.basis} onChange={(e) => setForm({ ...form, basis: e.target.value })}>
                <option value="per_day">Per day late</option>
                <option value="once">One flat charge</option>
                <option value="percent_per_month">% of dues per month</option>
              </Select>
            </div>
            <Input label={form.basis === "percent_per_month" ? "Percent *" : "Amount *"} type="number" min={0.01} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <Input label="Grace days" type="number" min={0} value={form.grace_days} onChange={(e) => setForm({ ...form, grace_days: e.target.value })} />
            <Input label="Cap" type="number" min={0} step="0.01" value={form.max_amount} onChange={(e) => setForm({ ...form, max_amount: e.target.value })} />
            <Button type="submit">{form.id ? "Save" : "Add rule"}</Button>
            {form.id > 0 && (
              <Button type="button" variant="ghost" onClick={() => setForm({ id: 0, name: "", fee_head_id: "", charge_head_id: "", basis: "per_day", amount: "", grace_days: "0", max_amount: "" })}>
                Cancel
              </Button>
            )}
          </form>
          <Table head={["Rule", "Applies to", "Charge", "Grace", "Cap", ""]} empty={rules.length === 0 && "No rules — nothing is charged for late payment."}>
            {rules.map((r) => (
              <tr key={r.id}>
                <td className={tdStrong}>
                  {r.name}
                  {!r.is_active && <Badge tone="rose" className="ml-2">off</Badge>}
                  <div className="text-xs font-normal text-ink-subtle">booked as {r.charge_head_name}</div>
                </td>
                <td className={td}>{r.fee_head_name ?? "Every head"}</td>
                <td className={td}>
                  {r.basis === "percent_per_month" ? `${Number(r.amount)}% per month` : `${inr(r.amount)} ${r.basis === "per_day" ? "per day" : "once"}`}
                </td>
                <td className={td}>{r.grace_days} days</td>
                <td className={td}>{r.max_amount ? inr(r.max_amount) : "—"}</td>
                <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setForm({
                        id: r.id,
                        name: r.name,
                        fee_head_id: r.fee_head_id ? String(r.fee_head_id) : "",
                        charge_head_id: String(r.charge_head_id),
                        basis: r.basis,
                        amount: String(Number(r.amount)),
                        grace_days: String(r.grace_days),
                        max_amount: r.max_amount ? String(Number(r.max_amount)) : "",
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => window.confirm(`Delete ${r.name}?`) && run(() => api.delete(`${base}/late-fee-rules/${r.id}`), "Rule deleted.")}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      {preview && preview.rules > 0 && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Late fees to charge</CardTitle>
              <p className="mt-[5px] text-[11px] text-ink-muted">
                {preview.rows.length} fee(s) · {inr(preview.total)} — nothing is charged until you say so
              </p>
            </div>
            {preview.rows.length > 0 && (
              <Button
                onClick={() =>
                  window.confirm(`Charge ${inr(preview.total)} across ${preview.rows.length} overdue fee(s)?`) &&
                  run(async () => {
                    const r = await api.post<{ created: number; updated: number }>(`${base}/late-fees/apply`, { notify_parents: true });
                    setNotice(`${r.data.created} charge(s) added, ${r.data.updated} updated. Parents were told.`);
                  }, "")
                }
              >
                Charge them
              </Button>
            )}
          </CardHeader>
          <Table head={["Student", "Fee", "Due", "Days late", "Outstanding", "Charge"]} empty={preview.rows.length === 0 && "Nothing overdue past the grace period."}>
            {preview.rows.slice(0, 200).map((r) => (
              <tr key={r.student_fee_id}>
                <td className={tdStrong}>{r.student_name}</td>
                <td className={td}>
                  {r.head_name} {r.period}
                  <div className="text-xs text-ink-subtle">{r.rule_name}</div>
                </td>
                <td className={td}>{r.due_date}</td>
                <td className={td}>{r.days_late}</td>
                <td className={td}>{inr(r.outstanding)}</td>
                <td className={td}>
                  {inr(r.charge)}
                  {Number(r.already_charged) > 0 && <div className="text-xs text-ink-subtle">already {inr(r.already_charged)}</div>}
                </td>
              </tr>
            ))}
          </Table>
          <PanelFooter
            left={`Showing ${Math.min(preview.rows.length, 200)} of ${preview.rows.length} overdue fee(s)`}
            right={`${inr(preview.total)} would be charged`}
          />
        </Card>
      )}

      {/* The state of the refund queue, from the refunds already loaded:
          how many are waiting on somebody, and how much money that is. */}
      <StatStrip
        stats={[
          {
            label: "Waiting for approval",
            value: requested.length,
            note: "Nobody has decided yet",
            icon: Inbox,
          },
          {
            label: "Approved, to pay",
            value: toPay.length,
            note: "Agreed, money not yet out",
            icon: Wallet,
          },
          {
            label: "Paid out",
            value: paidOut.length,
            note: "Recorded with a reference",
            icon: CheckCircle2,
          },
          {
            label: "Amount waiting",
            value: inr(waitingAmount),
            note: "Across the requests not yet decided",
            icon: Banknote,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Refunds</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Asked for by the office, approved by the school, then paid out and
              recorded.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="w-40">
              <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                <option value="requested">Waiting for approval</option>
                <option value="approved">Approved, to pay</option>
                <option value="processed">Paid out</option>
                <option value="rejected">Rejected</option>
              </Select>
            </div>
            <div className="w-64">
              <StudentPicker
                label="New refund for"
                value={null}
                onChange={(s) => s && openRefund({ id: s.id, full_name: s.full_name })}
              />
            </div>
          </div>
        </CardHeader>
        <Table head={["Student", "Against", "Amount", "Reason", "Status", ""]} empty={refunds.length === 0 && "No refunds."}>
          {refunds.map((r) => (
            <tr key={r.id}>
              <td className={tdStrong}>
                {r.student_name}
                {r.section_label && <div className="text-xs font-normal text-ink-subtle">{r.section_label}</div>}
              </td>
              <td className={td}>{r.fee_label ?? "—"}</td>
              <td className={td}>
                {inr(r.amount)}
                <div className="text-xs text-ink-subtle">{humanize(r.mode)}</div>
              </td>
              <td className={td}>
                <div className="max-w-xs">{r.reason}</div>
                {r.decision_note && <div className="text-xs text-ink-subtle">{r.decided_by_name}: {r.decision_note}</div>}
              </td>
              <td className={td}>
                <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                {r.processed_on && <div className="text-xs text-ink-subtle">{r.processed_on}{r.reference ? ` · ${r.reference}` : ""}</div>}
              </td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {r.status === "requested" && canApprove && (
                  <>
                    <Button size="sm" onClick={() => decide(r, true)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => decide(r, false)}>
                      Reject
                    </Button>
                  </>
                )}
                {r.status === "approved" && (
                  <Button size="sm" onClick={() => payout(r)}>
                    Record payout
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`Showing ${refunds.length} refund(s)`}
          right={
            requested.length
              ? `${requested.length} waiting for approval · ${inr(waitingAmount)}`
              : "Nothing waiting for approval"
          }
        />
      </Card>

      <Modal open={!!newRefund} onClose={() => setNewRefund(null)} title={`Refund for ${newRefund?.student_name ?? ""}`}>
        {newRefund && (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(
                () =>
                  api.post(`${base}/refunds`, {
                    student_id: newRefund.student_id,
                    student_fee_id: rf.student_fee_id ? Number(rf.student_fee_id) : null,
                    amount: rf.amount,
                    reason: rf.reason,
                    mode: rf.mode,
                  }),
                "Refund requested."
              );
              if (ok) setNewRefund(null);
            }}
          >
            <Select label="Against which fee" value={rf.student_fee_id} onChange={(e) => {
              const o = options.find((x) => String(x.student_fee_id) === e.target.value);
              setRf({ ...rf, student_fee_id: e.target.value, amount: o ? String(Number(o.refundable)) : rf.amount });
            }}>
              <option value="">Not tied to a fee</option>
              {options.map((o) => (
                <option key={o.student_fee_id} value={o.student_fee_id}>
                  {o.label} — paid {Number(o.paid)}, refundable {Number(o.refundable)}
                </option>
              ))}
            </Select>
            {options.length === 0 && <p className="text-xs text-ink-subtle">This student has no fees with money against them.</p>}
            <Input label="Amount *" type="number" min={0.01} step="0.01" value={rf.amount} onChange={(e) => setRf({ ...rf, amount: e.target.value })} required />
            <Select label="Pay back by" value={rf.mode} onChange={(e) => setRf({ ...rf, mode: e.target.value })}>
              {["bank_transfer", "upi", "cash", "cheque", "card", "other"].map((m) => (
                <option key={m} value={m}>
                  {humanize(m)}
                </option>
              ))}
            </Select>
            <Input label="Reason *" value={rf.reason} onChange={(e) => setRf({ ...rf, reason: e.target.value })} required minLength={3} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setNewRefund(null)}>
                Cancel
              </Button>
              <Button type="submit">Request refund</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
