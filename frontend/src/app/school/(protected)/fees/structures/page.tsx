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
type SchoolClass = { id: number; name: string };

type FeeHead = {
  id: number;
  name: string;
  code: string;
  is_recurring: boolean;
  is_active: boolean;
};

type FeeStructure = {
  id: number;
  academic_year_id: number;
  class_id: number;
  fee_head_id: number;
  fee_head_name: string;
  fee_head_code: string;
  amount: string;
  due_day_of_month: number;
  is_recurring: boolean;
};

export default function FeeStructuresPage() {
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState<number | null>(null);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [heads, setHeads] = useState<FeeHead[]>([]);
  const [structures, setStructures] = useState<FeeStructure[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [editing, setEditing] = useState<FeeStructure | null>(null);

  async function loadAll(yId: number) {
    try {
      const [c, s, hd] = await Promise.all([
        api.get<SchoolClass[]>("/api/v1/school/classes", {
          params: { academic_year_id: yId },
        }),
        api.get<FeeStructure[]>("/api/v1/school/fees/structures", {
          params: { academic_year_id: yId },
        }),
        api.get<FeeHead[]>("/api/v1/school/fees/heads?active_only=true"),
      ]);
      setClasses(c.data);
      setStructures(s.data);
      setHeads(hd.data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    api
      .get<AcademicYear[]>("/api/v1/school/academic-years")
      .then((r) => {
        setYears(r.data);
        const cur = r.data.find((y) => y.is_current) ?? r.data[0];
        if (cur) setYearId(cur.id);
      })
      .catch((e) => setError(apiError(e)));
  }, []);

  useEffect(() => {
    if (yearId) loadAll(yearId);
  }, [yearId]);

  async function remove(s: FeeStructure) {
    if (
      !window.confirm(
        `Delete ${s.fee_head_name} structure for this class? (Won't affect already-generated fees.)`
      )
    )
      return;
    try {
      await api.delete(`/api/v1/school/fees/structures/${s.id}`);
      setNotice("Structure removed.");
      if (yearId) loadAll(yearId);
    } catch (e) {
      setError(apiError(e));
    }
  }

  const byClass = useMemo(() => {
    const map = new Map<number, FeeStructure[]>();
    classes.forEach((c) => map.set(c.id, []));
    structures.forEach((s) => {
      const arr = map.get(s.class_id) ?? [];
      arr.push(s);
      map.set(s.class_id, arr);
    });
    return map;
  }, [classes, structures]);

  return (
    <div className="space-y-6">
      <Link href="/school/fees" className="text-sm text-brand-700 hover:underline">
        ← Back to Fees
      </Link>

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Fee structures</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Amounts per fee head × class × year. Editing only affects future
            generation — already-issued bills stay as they were.
          </p>
        </div>
        <Button onClick={() => setOpenCreate(true)} disabled={!yearId}>
          + New structure
        </Button>
      </div>

      <label className="flex flex-col gap-1 text-sm max-w-xs">
        <span className="text-[12px] font-bold text-ink-muted">Academic year</span>
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

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>
      )}

      <div className="space-y-4">
        {classes.map((c) => {
          const items = byClass.get(c.id) ?? [];
          return (
            <Card key={c.id} className="p-4">
              <h3 className="font-semibold text-slate-900">{c.name}</h3>
              {items.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  No fee structures defined for this class yet.
                </p>
              ) : (
                <table className="mt-3 min-w-full text-sm">
                  <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                    <tr>
                      <th className="py-1 font-medium">Head</th>
                      <th className="py-1 font-medium">Type</th>
                      <th className="py-1 font-medium">Amount</th>
                      <th className="py-1 font-medium">Due day</th>
                      <th className="py-1 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 font-medium text-slate-900">
                          {s.fee_head_name}{" "}
                          <span className="text-xs text-slate-500">
                            ({s.fee_head_code})
                          </span>
                        </td>
                        <td className="py-2">
                          {s.is_recurring ? (
                            <Badge tone="brand">monthly</Badge>
                          ) : (
                            <Badge tone="neutral">one-time</Badge>
                          )}
                        </td>
                        <td className="py-2 font-medium">
                          ₹{Number(s.amount).toLocaleString("en-IN")}
                        </td>
                        <td className="py-2 text-slate-600">{s.due_day_of_month}</td>
                        <td className="py-2 text-right space-x-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditing(s)}
                          >
                            Edit
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => remove(s)}>
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          );
        })}
        {classes.length === 0 && (
          <Card className="p-8 text-center text-slate-500">
            No classes for this year yet. Create some first in{" "}
            <Link href="/school/classes" className="text-brand-700 hover:underline">
              Classes
            </Link>
            .
          </Card>
        )}
      </div>

      {(openCreate || editing) && yearId && (
        <FormModal
          existing={editing}
          yearId={yearId}
          classes={classes}
          heads={heads}
          existingStructures={structures}
          onClose={() => {
            setOpenCreate(false);
            setEditing(null);
          }}
          onSaved={() => {
            setOpenCreate(false);
            setEditing(null);
            setNotice("Saved.");
            loadAll(yearId);
          }}
        />
      )}
    </div>
  );
}

function FormModal({
  existing,
  yearId,
  classes,
  heads,
  existingStructures,
  onClose,
  onSaved,
}: {
  existing: FeeStructure | null;
  yearId: number;
  classes: SchoolClass[];
  heads: FeeHead[];
  existingStructures: FeeStructure[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [classId, setClassId] = useState<number | "">(existing?.class_id ?? "");
  const [headId, setHeadId] = useState<number | "">(existing?.fee_head_id ?? "");
  const [amount, setAmount] = useState(existing?.amount ?? "0");
  const [dueDay, setDueDay] = useState(existing?.due_day_of_month ?? 10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usedHeadIds = useMemo(() => {
    if (!classId) return new Set<number>();
    return new Set(
      existingStructures
        .filter((s) => s.class_id === classId && s.id !== existing?.id)
        .map((s) => s.fee_head_id)
    );
  }, [classId, existingStructures, existing]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (existing) {
        await api.patch(`/api/v1/school/fees/structures/${existing.id}`, {
          amount: Number(amount),
          due_day_of_month: dueDay,
        });
      } else {
        await api.post("/api/v1/school/fees/structures", {
          academic_year_id: yearId,
          class_id: classId,
          fee_head_id: headId,
          amount: Number(amount),
          due_day_of_month: dueDay,
        });
      }
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? `Edit structure` : "New fee structure"}
    >
      <form onSubmit={submit} className="space-y-4">
        {!existing && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-muted">Class *</span>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value ? Number(e.target.value) : "")}
                className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
                required
              >
                <option value="">Select…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-muted">Fee head *</span>
              <select
                value={headId}
                onChange={(e) => setHeadId(e.target.value ? Number(e.target.value) : "")}
                className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
                required
              >
                <option value="">Select…</option>
                {heads.map((h) => {
                  const used = usedHeadIds.has(h.id);
                  return (
                    <option key={h.id} value={h.id} disabled={used}>
                      {h.name} ({h.code}){used ? " — already used in this class" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          </>
        )}
        <Input
          label="Amount (₹) *"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <Input
          label="Due day of month"
          type="number"
          min="1"
          max="31"
          value={dueDay}
          onChange={(e) => setDueDay(Number(e.target.value))}
        />
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {existing ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
