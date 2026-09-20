"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { StudentPicker, type PickedStudent } from "@/components/StudentPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  Textarea,
  WarnBox,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { readableDate, toIso } from "@/lib/dates";

type Assignment = {
  id: number;
  student_id: number;
  student_name: string | null;
  admission_no: string | null;
  fee_head_id: number;
  fee_head_name: string | null;
  academic_year_id: number;
  academic_year_name: string | null;
  amount: string;
  class_amount: string | null;
  difference: string | null;
  is_extra: boolean;
  period: string | null;
  due_day_of_month: number;
  reason: string;
  starts_on: string;
  ends_on: string | null;
  is_active: boolean;
  approved_by: string | null;
};
type FeeHead = { id: number; name: string; code: string };
type Year = { id: number; name: string; is_current: boolean };

/** What one child pays, when it differs from their class.
 *
 *  Deliberately kept apart from concessions, which live on the accounts
 *  screen: an assignment says what the charge is, a concession says what
 *  comes off it. Using one for the other's job is how a bill stops being
 *  explainable.
 */
export default function FeeAssignmentsPage() {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [heads, setHeads] = useState<FeeHead[]>([]);
  const [years, setYears] = useState<Year[]>([]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<PickedStudent | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    fee_head_id: "",
    academic_year_id: "",
    amount: "",
    reason: "",
    starts_on: toIso(),
    ends_on: "",
    due_day_of_month: "10",
  });

  const load = () =>
    api
      .get<Assignment[]>("/api/v1/school/finance/assignments")
      .then((r) => setRows(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    api
      .get<FeeHead[]>("/api/v1/school/fees/heads")
      .then((r) => setHeads(r.data))
      .catch(() => setHeads([]));
    api
      .get<Year[]>("/api/v1/school/academic-years")
      .then((r) => {
        setYears(r.data);
        const current = r.data.find((y) => y.is_current) ?? r.data[0];
        if (current) setForm((f) => ({ ...f, academic_year_id: String(current.id) }));
      })
      .catch(() => setYears([]));
  }, []);

  const save = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/v1/school/finance/assignments", {
        student_id: picked.id,
        fee_head_id: Number(form.fee_head_id),
        academic_year_id: Number(form.academic_year_id),
        amount: form.amount,
        reason: form.reason,
        starts_on: form.starts_on,
        ends_on: form.ends_on || null,
        due_day_of_month: Number(form.due_day_of_month) || 10,
      });
      setOpen(false);
      setPicked(null);
      setForm((f) => ({ ...f, amount: "", reason: "", ends_on: "" }));
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = async (a: Assignment) => {
    setError(null);
    setApplied(null);
    try {
      const r = await api.post<{ updated: number; left_alone_count: number }>(
        `/api/v1/school/finance/assignments/${a.id}/apply`
      );
      setApplied(
        `${r.data.updated} unpaid charge(s) updated for ${a.student_name}.` +
          (r.data.left_alone_count
            ? ` ${r.data.left_alone_count} already had money against them and were left alone — refund or waive those instead.`
            : "")
      );
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const stop = async (a: Assignment) => {
    if (!window.confirm(`Stop the special amount for ${a.student_name}?`)) return;
    try {
      await api.patch(`/api/v1/school/finance/assignments/${a.id}`, {
        is_active: false,
        ends_on: toIso(),
      });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const live = rows.filter((r) => r.is_active);
  const extras = live.filter((r) => r.is_extra);
  const reductions = live.filter(
    (r) => r.difference !== null && Number(r.difference) < 0
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Per-child fee amounts"
        subtitle="Children charged something other than what their class pays."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Set an amount
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {applied && <NoticeBox>{applied}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="In force" value={live.length} />
        <StatCard label="Paying less" value={reductions.length} accent="emerald" />
        <StatCard
          label="Extra heads"
          value={extras.length}
          hint="charged something their class is not"
          accent="neutral"
        />
        <StatCard label="Ended" value={rows.length - live.length} accent="neutral" />
      </div>

      <WarnBox>
        This sets what a child is charged. A discount off the class amount is a
        concession, which lives on the accounts screen — using one for the other
        means two places disagree about the same bill.
      </WarnBox>

      <Card>
        <CardHeader>
          <CardTitle>Amounts</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Student", "Head", "Class pays", "They pay", "From", "Why", ""]}
            empty={rows.length === 0 && "Nobody has been set a different amount yet."}
          >
            {rows.map((a) => (
              <tr key={a.id} className={a.is_active ? undefined : "opacity-60"}>
                <td className={tdStrong}>
                  <Link
                    href={`/school/fees/ledger/${a.student_id}`}
                    className="hover:underline"
                  >
                    {a.student_name}
                  </Link>
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {a.admission_no}
                  </span>
                </td>
                <td className={td}>
                  {a.fee_head_name}
                  {a.is_extra && (
                    <Badge tone="neutral" className="ml-2">
                      Extra
                    </Badge>
                  )}
                </td>
                <td className={td}>
                  {a.class_amount ? inr(a.class_amount) : <span className="text-ink-subtle">Not charged</span>}
                </td>
                <td className={tdStrong}>
                  {inr(a.amount)}
                  {a.difference !== null && Number(a.difference) !== 0 && (
                    <span
                      className={
                        Number(a.difference) < 0
                          ? "block text-[11px] font-normal text-success"
                          : "block text-[11px] font-normal text-danger"
                      }
                    >
                      {Number(a.difference) < 0 ? "−" : "+"}
                      {inr(Math.abs(Number(a.difference)))}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {readableDate(a.starts_on)}
                  {a.ends_on && (
                    <span className="block text-[11px] text-ink-subtle">
                      to {readableDate(a.ends_on)}
                    </span>
                  )}
                </td>
                <td className={td}>{a.reason}</td>
                <td className={td}>
                  {a.is_active ? (
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => apply(a)}>
                        Apply
                      </Button>
                      <Button variant="secondary" onClick={() => stop(a)}>
                        Stop
                      </Button>
                    </div>
                  ) : (
                    <Badge tone="neutral">Ended</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <p className="text-[12px] text-ink-subtle">
        &ldquo;Apply&rdquo; pushes the amount onto charges already raised. Anything
        with money against it is left alone and reported, because rewriting it
        would make a receipt describe a bill that no longer exists.
      </p>

      <Modal open={open} onClose={() => setOpen(false)} title="Set a child's amount">
        <div className="space-y-4">
          <StudentPicker value={picked} onChange={setPicked} />
          <Select
            label="Fee head"
            value={form.fee_head_id}
            onChange={(e) => setForm({ ...form, fee_head_id: e.target.value })}
          >
            <option value="">Choose…</option>
            {heads.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </Select>
          <Select
            label="Academic year"
            value={form.academic_year_id}
            onChange={(e) => setForm({ ...form, academic_year_id: e.target.value })}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
          <Input
            label="Amount"
            type="number"
            min={0}
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <div className="flex gap-3">
            <Input
              label="From"
              type="date"
              value={form.starts_on}
              onChange={(e) => setForm({ ...form, starts_on: e.target.value })}
            />
            <Input
              label="Until (optional)"
              type="date"
              value={form.ends_on}
              onChange={(e) => setForm({ ...form, ends_on: e.target.value })}
            />
          </div>
          <Textarea
            label="Why"
            value={form.reason}
            hint="Somebody will read this in two years and have to explain the bill."
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              loading={busy}
              disabled={
                !picked ||
                !form.fee_head_id ||
                !form.academic_year_id ||
                form.amount === "" ||
                form.reason.trim().length < 3
              }
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
