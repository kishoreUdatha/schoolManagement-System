"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type LateFeeType = "none" | "percent" | "fixed";

type FeeHead = {
  id: number;
  name: string;
  code: string;
  is_recurring: boolean;
  late_fee_type: LateFeeType;
  late_fee_value: string;
  late_fee_after_days: number;
  is_active: boolean;
};

export default function FeeHeadsPage() {
  const [items, setItems] = useState<FeeHead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FeeHead | null>(null);

  async function load() {
    try {
      const { data } = await api.get<FeeHead[]>("/api/v1/school/fees/heads");
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(h: FeeHead) {
    if (!window.confirm(`Delete fee head "${h.name}"?`)) return;
    try {
      await api.delete(`/api/v1/school/fees/heads/${h.id}`);
      setNotice(`Deleted ${h.name}.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/school/fees" className="text-sm text-brand-700 hover:underline">
        ← Back to Fees
      </Link>

      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Fee heads</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Categories of fees you charge. Recurring heads auto-generate monthly;
            one-time heads (e.g. Admission Fee) generate when a student is admitted.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>+ New head</Button>
      </div>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>
      )}

      <Card>
        <table className="min-w-full divide-y divide-surface-border text-[13px]">
          <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-bold">Code</th>
              <th className="px-4 py-3 font-bold">Name</th>
              <th className="px-4 py-3 font-bold">Recurring</th>
              <th className="px-4 py-3 font-bold">Late fee</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {items.map((h) => (
              <tr key={h.id} className="hover:bg-surface-subtle">
                <td className="px-4 py-3 text-[12px] font-mono">{h.code}</td>
                <td className="px-4 py-3 font-medium text-ink">{h.name}</td>
                <td className="px-4 py-3">
                  {h.is_recurring ? (
                    <Badge tone="brand">monthly</Badge>
                  ) : (
                    <Badge tone="neutral">one-time</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {h.late_fee_type === "none" ? (
                    "—"
                  ) : (
                    <>
                      {h.late_fee_type === "percent"
                        ? `${h.late_fee_value}%`
                        : `₹${h.late_fee_value}`}
                      <span className="text-xs text-ink-muted">
                        {" "}
                        after {h.late_fee_after_days}d
                      </span>
                    </>
                  )}
                </td>
                <td className="px-4 py-3">
                  {h.is_active ? (
                    <Badge tone="emerald">active</Badge>
                  ) : (
                    <Badge tone="neutral">inactive</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(h)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => remove(h)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-ink-muted">
                  No fee heads yet — click <strong>+ New head</strong>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <FormModal
        open={open}
        onClose={() => setOpen(false)}
        onSaved={(name) => {
          setOpen(false);
          setNotice(`Created ${name}.`);
          load();
        }}
      />
      {editing && (
        <FormModal
          open
          head={editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            setNotice(`Updated ${name}.`);
            load();
          }}
        />
      )}
    </div>
  );
}

function FormModal({
  open,
  head,
  onClose,
  onSaved,
}: {
  open: boolean;
  head?: FeeHead;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [form, setForm] = useState({
    name: head?.name ?? "",
    code: head?.code ?? "",
    is_recurring: head?.is_recurring ?? true,
    late_fee_type: (head?.late_fee_type ?? "none") as LateFeeType,
    late_fee_value: Number(head?.late_fee_value ?? "0"),
    late_fee_after_days: head?.late_fee_after_days ?? 0,
    is_active: head?.is_active ?? true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = !!head;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        code: form.code,
        is_recurring: form.is_recurring,
        late_fee_type: form.late_fee_type,
        late_fee_value: form.late_fee_value,
        late_fee_after_days: form.late_fee_after_days,
        ...(editing ? { is_active: form.is_active } : {}),
      };
      if (editing && head) {
        await api.patch(`/api/v1/school/fees/heads/${head.id}`, payload);
      } else {
        await api.post("/api/v1/school/fees/heads", payload);
      }
      onSaved(form.name);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${head?.name}` : "New fee head"}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Code *"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="e.g. TUI, ADM, TRA"
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_recurring}
            onChange={(e) => setForm({ ...form, is_recurring: e.target.checked })}
            className="rounded border-surface-border"
          />
          Recurring (charged every month) — uncheck for one-time fees
        </label>
        <div className="rounded-lg border border-surface-border bg-surface-subtle p-3 text-xs text-ink-muted">
          Late fee rules below are <strong>stored but not auto-applied</strong> at runtime in this
          MVP. Future scope: compute and add to amount_due when overdue.
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Late fee type</span>
            <select
              value={form.late_fee_type}
              onChange={(e) =>
                setForm({ ...form, late_fee_type: e.target.value as LateFeeType })
              }
              className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="none">None</option>
              <option value="percent">% of amount</option>
              <option value="fixed">Fixed ₹</option>
            </select>
          </label>
          <Input
            label="Late fee value"
            type="number"
            min="0"
            step="0.01"
            value={form.late_fee_value}
            onChange={(e) =>
              setForm({ ...form, late_fee_value: Number(e.target.value) })
            }
            disabled={form.late_fee_type === "none"}
          />
          <Input
            label="Grace days"
            type="number"
            min="0"
            value={form.late_fee_after_days}
            onChange={(e) =>
              setForm({ ...form, late_fee_after_days: Number(e.target.value) })
            }
            disabled={form.late_fee_type === "none"}
          />
        </div>
        {editing && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="rounded border-surface-border"
            />
            Active
          </label>
        )}
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {editing ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
