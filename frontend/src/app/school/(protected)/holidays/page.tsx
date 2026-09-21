"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { HolidayCalendar, CalendarHoliday } from "@/components/HolidayCalendar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type HolidayType = "national" | "school" | "vacation";

type Holiday = CalendarHoliday & {
  description: string | null;
  days: number;
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const typeTone = {
  national: "rose",
  school: "amber",
  vacation: "emerald",
} as const;

export default function HolidaysPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [workingDays, setWorkingDays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [createDate, setCreateDate] = useState<string | undefined>();
  const [editing, setEditing] = useState<Holiday | null>(null);

  async function load() {
    try {
      const [h, profile] = await Promise.all([
        api.get<Holiday[]>("/api/v1/school/holidays", { params: { year, month } }),
        api.get<{ working_days: string }>("/api/v1/school/profile"),
      ]);
      setHolidays(h.data);
      setWorkingDays(profile.data.working_days.split(",").map((d) => d.trim()));
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  async function remove(h: Holiday) {
    if (!window.confirm(`Delete "${h.name}"?`)) return;
    try {
      await api.delete(`/api/v1/school/holidays/${h.id}`);
      setNotice(`Deleted ${h.name}.`);
      setEditing(null);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m += 12;
      y -= 1;
    } else if (m > 12) {
      m -= 12;
      y += 1;
    }
    setYear(y);
    setMonth(m);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Holidays</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Holidays are excluded from attendance and visible to parents.
          </p>
        </div>
        <Button
          onClick={() => {
            setCreateDate(undefined);
            setOpenCreate(true);
          }}
        >
          + New holiday
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => shiftMonth(-1)}>
            ← Prev
          </Button>
          <span className="text-base font-semibold text-ink">
            {MONTHS[month - 1]} {year}
          </span>
          <Button size="sm" variant="secondary" onClick={() => shiftMonth(1)}>
            Next →
          </Button>
        </div>
        <div className="flex gap-3 text-xs text-ink-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm bg-rose-300" />
            national
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm bg-amber-300" />
            school
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-3 rounded-sm bg-emerald-300" />
            vacation
          </span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>
      )}

      <HolidayCalendar
        year={year}
        month={month}
        holidays={holidays}
        workingDays={workingDays}
        onSelectHoliday={(h) => setEditing(holidays.find((x) => x.id === h.id) ?? null)}
        onClickDate={(iso) => {
          setCreateDate(iso);
          setOpenCreate(true);
        }}
      />

      <Card>
        <table className="min-w-full divide-y divide-surface-border text-[13px]">
          <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-bold">Name</th>
              <th className="px-4 py-3 font-bold">Type</th>
              <th className="px-4 py-3 font-bold">Dates</th>
              <th className="px-4 py-3 font-bold">Days</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {holidays.map((h) => (
              <tr key={h.id} className="hover:bg-surface-subtle">
                <td className="px-4 py-3 font-medium text-ink">{h.name}</td>
                <td className="px-4 py-3">
                  <Badge tone={typeTone[h.type]}>{h.type}</Badge>
                </td>
                <td className="px-4 py-3 text-ink-muted">
                  {h.start_date === h.end_date
                    ? h.start_date
                    : `${h.start_date} → ${h.end_date}`}
                </td>
                <td className="px-4 py-3 text-ink-muted">{h.days}</td>
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
            {holidays.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-ink-muted">
                  No holidays in {MONTHS[month - 1]} {year}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {(openCreate || editing) && (
        <HolidayFormModal
          existing={editing}
          defaultDate={createDate}
          onClose={() => {
            setOpenCreate(false);
            setEditing(null);
          }}
          onSaved={(action) => {
            setOpenCreate(false);
            setEditing(null);
            setNotice(action);
            load();
          }}
        />
      )}
    </div>
  );
}

function HolidayFormModal({
  existing,
  defaultDate,
  onClose,
  onSaved,
}: {
  existing: Holiday | null;
  defaultDate?: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    type: (existing?.type ?? "school") as HolidayType,
    start_date: existing?.start_date ?? defaultDate ?? "",
    end_date: existing?.end_date ?? defaultDate ?? "",
    description: existing?.description ?? "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        ...form,
        description: form.description || null,
      };
      if (existing) {
        await api.patch(`/api/v1/school/holidays/${existing.id}`, payload);
        onSaved("Holiday updated.");
      } else {
        await api.post("/api/v1/school/holidays", payload);
        onSaved("Holiday added.");
      }
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
      title={existing ? `Edit ${existing.name}` : "New holiday"}
    >
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Name *"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Type *</span>
            <select
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as HolidayType })
              }
              className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="national">National</option>
              <option value="school">School</option>
              <option value="vacation">Vacation (range)</option>
            </select>
          </label>
          <Input
            label="Start date *"
            type="date"
            value={form.start_date}
            onChange={(e) =>
              setForm({
                ...form,
                start_date: e.target.value,
                end_date: form.end_date || e.target.value,
              })
            }
            required
          />
          <Input
            label="End date *"
            type="date"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            required
          />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Description</span>
          <textarea
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            rows={2}
          />
        </label>
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {existing ? "Save" : "Add"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
