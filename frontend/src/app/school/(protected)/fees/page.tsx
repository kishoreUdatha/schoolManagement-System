"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type AcademicYear = { id: number; name: string; is_current: boolean };
type SectionLite = { id: number; name: string };
type SchoolClass = { id: number; name: string; sections: SectionLite[] };

type FeeStatus = "pending" | "paid" | "waived";

type StudentFee = {
  id: number;
  student_id: number;
  student_name: string;
  section_label: string | null;
  fee_head_id: number;
  fee_head_name: string;
  fee_head_code: string;
  period: string;
  amount_due: string;
  amount_paid: string;
  amount_outstanding: string;
  due_date: string;
  status: FeeStatus;
  is_overdue: boolean;
  paid_at: string | null;
  payment_mode: string | null;
  payment_ref: string | null;
};

type Paginated<T> = { items: T[]; total: number; page: number; pages: number };

export default function FeesPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState<number | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState<number | "">("");
  const [sectionId, setSectionId] = useState<number | "">("");
  const [period, setPeriod] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "" | "pending" | "paid" | "overdue" | "waived" | "outstanding"
  >("");
  const [data, setData] = useState<Paginated<StudentFee> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payFee, setPayFee] = useState<StudentFee | null>(null);
  const [genOpen, setGenOpen] = useState(false);

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId]
  );

  async function loadYears() {
    try {
      const { data } = await api.get<AcademicYear[]>("/api/v1/school/academic-years");
      setYears(data);
      if (yearId == null) {
        const cur = data.find((y) => y.is_current) ?? data[0];
        if (cur) setYearId(cur.id);
      }
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function loadClasses(yId: number) {
    try {
      const { data } = await api.get<SchoolClass[]>("/api/v1/school/classes", {
        params: { academic_year_id: yId },
      });
      setClasses(data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function load() {
    try {
      const params: Record<string, string | number> = {
        page,
        page_size: 100,
      };
      if (classId) params.class_id = classId;
      if (sectionId) params.section_id = sectionId;
      if (period) params.period = period;
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get<Paginated<StudentFee>>(
        "/api/v1/school/fees/student-fees",
        { params }
      );
      setData(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    loadYears();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (yearId) loadClasses(yearId);
  }, [yearId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, sectionId, period, statusFilter, page]);

  async function waive(f: StudentFee) {
    if (!window.confirm(`Waive ${f.fee_head_name} for ${f.student_name}?`)) return;
    try {
      await api.post(`/api/v1/school/fees/student-fees/${f.id}/waive`);
      setNotice(`Waived ${f.fee_head_name}.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Fees</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Manage fee records, record payments, generate monthly bills. Set up{" "}
            <Link className="text-brand-700 hover:underline" href="/school/fees/heads">
              heads
            </Link>{" "}
            and{" "}
            <Link className="text-brand-700 hover:underline" href="/school/fees/structures">
              structures
            </Link>{" "}
            first.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/school/fees/heads"
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
          >
            Fee heads
          </Link>
          <Link
            href="/school/fees/structures"
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
          >
            Structures
          </Link>
          <Link
            href="/school/fees/reminders"
            className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-[9px] border border-surface-border bg-surface-raised px-4 py-2 text-xs font-extrabold text-ink transition-colors hover:bg-surface-hover"
          >
            Reminders
          </Link>
          <Button onClick={() => setGenOpen(true)}>Generate monthly</Button>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Year</span>
          <select
            value={yearId ?? ""}
            onChange={(e) => setYearId(Number(e.target.value))}
            className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Class</span>
          <select
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value ? Number(e.target.value) : "");
              setSectionId("");
            }}
            className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="">All</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Section</span>
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : "")}
            disabled={!selectedClass}
            className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="">All</option>
            {selectedClass?.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Period"
          placeholder="2026-06 / ONETIME"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="w-32"
        />
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Status</span>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as typeof statusFilter)
            }
            className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="">All</option>
            <option value="outstanding">Outstanding (pending+overdue)</option>
            <option value="overdue">Overdue only</option>
            <option value="pending">Pending (not overdue)</option>
            <option value="paid">Paid</option>
            <option value="waived">Waived</option>
          </select>
        </label>
      </form>

      {error && (
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-[#E9F7F0] px-4 py-3 text-[13px] font-medium text-[#07845E] dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>
      )}

      <Card>
        <table className="min-w-full divide-y divide-surface-border text-[13px]">
          <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-bold">Student</th>
              <th className="px-4 py-3 font-bold">Head</th>
              <th className="px-4 py-3 font-bold">Period</th>
              <th className="px-4 py-3 font-bold">Due / Paid</th>
              <th className="px-4 py-3 font-bold">Outstanding</th>
              <th className="px-4 py-3 font-bold">Due date</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data?.items.map((f) => (
              <tr key={f.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{f.student_name}</div>
                  <div className="text-xs text-slate-500">{f.section_label}</div>
                </td>
                <td className="px-4 py-3 text-[12px] font-mono">{f.fee_head_code}</td>
                <td className="px-4 py-3">{f.period}</td>
                <td className="px-4 py-3">
                  ₹{Number(f.amount_paid).toLocaleString("en-IN")} / ₹
                  {Number(f.amount_due).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 font-medium">
                  ₹{Number(f.amount_outstanding).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 text-slate-600">{f.due_date}</td>
                <td className="px-4 py-3">
                  {f.status === "paid" ? (
                    <Badge tone="emerald">paid</Badge>
                  ) : f.status === "waived" ? (
                    <Badge tone="neutral">waived</Badge>
                  ) : f.is_overdue ? (
                    <Badge tone="rose">overdue</Badge>
                  ) : (
                    <Badge tone="amber">pending</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right space-x-1">
                  {f.status === "pending" && (
                    <>
                      <Button size="sm" onClick={() => setPayFee(f)}>
                        Pay
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => waive(f)}>
                        Waive
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                  No fee records match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {data && data.pages > 1 && (
        <div className="flex justify-between text-sm text-slate-600">
          <div>
            Page {data.page} of {data.pages} · {data.total} total
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Prev
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </Button>
          </div>
        </div>
      )}

      {payFee && (
        <RecordPaymentModal
          fee={payFee}
          onClose={() => setPayFee(null)}
          onSaved={() => {
            setPayFee(null);
            setNotice("Payment recorded.");
            load();
          }}
        />
      )}

      {genOpen && (
        <GenerateModal
          years={years}
          defaultYearId={yearId ?? undefined}
          onClose={() => setGenOpen(false)}
          onDone={(r) => {
            setGenOpen(false);
            setNotice(
              `Generated ${r.created} new record(s) for ${r.period}` +
                (r.skipped ? `; skipped ${r.skipped} existing.` : ".")
            );
            load();
          }}
        />
      )}
    </div>
  );
}

function RecordPaymentModal({
  fee,
  onClose,
  onSaved,
}: {
  fee: StudentFee;
  onClose: () => void;
  onSaved: () => void;
}) {
  const outstanding = Number(fee.amount_outstanding);
  const [amount, setAmount] = useState(outstanding.toString());
  const [mode, setMode] = useState("Cash");
  const [ref, setRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post(
        `/api/v1/school/fees/student-fees/${fee.id}/record-payment`,
        {
          amount_paid: Number(amount),
          payment_mode: mode || null,
          payment_ref: ref || null,
        }
      );
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Record payment — ${fee.student_name}`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-md bg-slate-50 p-3 text-sm">
          <div>
            <strong>{fee.fee_head_name}</strong> — {fee.period}
          </div>
          <div className="text-slate-600">
            Outstanding: <strong>₹{outstanding.toLocaleString("en-IN")}</strong>
          </div>
        </div>
        <Input
          label="Amount *"
          type="number"
          min="0.01"
          step="0.01"
          max={outstanding}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Mode</span>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option>Cash</option>
              <option>UPI</option>
              <option>Cheque</option>
              <option>Bank transfer</option>
              <option>Card</option>
            </select>
          </label>
          <Input
            label="Reference"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="UPI ref / cheque #"
          />
        </div>
        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Record
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function GenerateModal({
  years,
  defaultYearId,
  onClose,
  onDone,
}: {
  years: AcademicYear[];
  defaultYearId?: number;
  onClose: () => void;
  onDone: (r: { created: number; skipped: number; period: string }) => void;
}) {
  const now = new Date();
  const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [yearId, setYearId] = useState<number | "">(defaultYearId ?? "");
  const [period, setPeriod] = useState(defaultPeriod);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!yearId) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await api.post("/api/v1/school/fees/generate", {
        academic_year_id: yearId,
        period,
      });
      onDone(data);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Generate monthly fees">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-slate-500">
          Creates fee records for every active student in classes that have
          recurring fee structures for this year. Idempotent — existing records
          are skipped.
        </p>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Year *</span>
          <select
            value={yearId}
            onChange={(e) => setYearId(e.target.value ? Number(e.target.value) : "")}
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            required
          >
            <option value="">Select…</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Period (YYYY-MM) *"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          placeholder="2026-06"
          pattern="\d{4}-\d{2}"
          required
        />
        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Generate
          </Button>
        </div>
      </form>
    </Modal>
  );
}
