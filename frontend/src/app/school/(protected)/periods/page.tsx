"use client";

import { CalendarDays, Coffee, LayoutGrid, Timer } from "lucide-react";
import { FormEvent, ReactNode, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader, Select, fieldClass } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { FormGrid, FormSection, Req, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

/** The mock's `.field` with its rose asterisk. Input takes a plain-string
 *  label, so a required field is spelt out here rather than having the
 *  requirement smuggled into the text as " *". */
function ReqField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-bold text-ink-muted">
        {label}
        <Req />
      </span>
      {children}
    </label>
  );
}

const DAYS = [
  "",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

type Period = {
  id: number;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  label: string | null;
  is_break: boolean;
};

function trim(t: string) {
  return t?.slice(0, 5) ?? "";
}

export default function PeriodsPage() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    try {
      const { data } = await api.get<Period[]>("/api/v1/school/periods");
      setPeriods(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(p: Period) {
    if (
      !window.confirm(
        `Delete ${DAYS[p.day_of_week]} period ${p.period_number}? This removes it from all section timetables.`
      )
    )
      return;
    try {
      await api.delete(`/api/v1/school/periods/${p.id}`);
      setNotice(`Deleted ${DAYS[p.day_of_week]} period ${p.period_number}.`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  const grouped = DAYS.slice(1).map((dayName, i) => ({
    dayName,
    day: i + 1,
    items: periods.filter((p) => p.day_of_week === i + 1),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Periods"
        subtitle="School-wide weekly period schedule. Used by every section's timetable."
        actions={<Button onClick={() => setOpen(true)}>+ New period</Button>}
      />

      {/* The week as it currently stands, counted off the slots already
          loaded — no second request. */}
      <StatStrip
        stats={[
          {
            label: "Slots defined",
            value: periods.length || "—",
            note: "Across the whole week",
            icon: LayoutGrid,
          },
          {
            label: "Days scheduled",
            value: grouped.filter((g) => g.items.length > 0).length || "—",
            note: `of ${grouped.length} weekdays`,
            icon: CalendarDays,
          },
          {
            label: "Teaching periods",
            value: periods.filter((p) => !p.is_break).length || "—",
            note: "Available to timetable",
            icon: Timer,
          },
          {
            label: "Breaks",
            value: periods.filter((p) => p.is_break).length || "—",
            note: "Lunch, recess and the like",
            icon: Coffee,
          },
        ]}
      />

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {grouped.map((g) => (
          <Card key={g.day} className="p-4">
            <div className="flex items-center justify-between border-b border-surface-border pb-2">
              <h3 className="font-semibold text-ink">{g.dayName}</h3>
              <span className="text-xs text-ink-muted">{g.items.length} slot(s)</span>
            </div>
            <div className="mt-2 divide-y divide-surface-border text-sm">
              {g.items.length === 0 && (
                <div className="py-3 text-sm text-ink-muted">No periods yet.</div>
              )}
              {g.items.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2"
                >
                  <div>
                    <span className="text-[12px] tabular-nums text-ink-muted">
                      P{p.period_number}
                    </span>{" "}
                    <span className="font-medium">
                      {trim(p.start_time)} – {trim(p.end_time)}
                    </span>{" "}
                    {p.label && (
                      <span className="text-ink-muted">· {p.label}</span>
                    )}
                    {p.is_break && (
                      <Badge tone="amber" className="ml-2">
                        break
                      </Badge>
                    )}
                  </div>
                  <button
                    onClick={() => remove(p)}
                    className="text-xs text-danger hover:underline"
                  >
                    delete
                  </button>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      <CreatePeriodModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          setNotice("Period added.");
          load();
        }}
      />
    </div>
  );
}

function CreatePeriodModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    day_of_week: 1,
    period_number: 1,
    start_time: "08:30",
    end_time: "09:15",
    label: "Period 1",
    is_break: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/school/periods", {
        ...form,
        label: form.label || null,
      });
      onCreated();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New period" size="md">
      <form onSubmit={submit} className="space-y-4">
        {/* Six fields is past the point where one undifferentiated grid reads
            as a list of unrelated boxes, so the mock's numbered sections. */}
        <div className="space-y-[25px]">
          <FormSection step={1} title="When it runs">
            <FormGrid>
              {/* The day select has no `required` attribute and its label has
                  always carried a plain asterisk — left as it was rather than
                  changing what the form claims about itself. */}
              <Select
                label="Day"
                value={form.day_of_week}
                onChange={(e) =>
                  setForm({ ...form, day_of_week: Number(e.target.value) })
                }
              >
                {DAYS.slice(1).map((d, i) => (
                  <option key={i + 1} value={i + 1}>
                    {d}
                  </option>
                ))}
              </Select>
              <ReqField label="Period number">
                <input
                  className={fieldClass}
                  type="number"
                  min="1"
                  max="20"
                  value={form.period_number}
                  onChange={(e) =>
                    setForm({ ...form, period_number: Number(e.target.value) })
                  }
                  required
                />
              </ReqField>
              <ReqField label="Start">
                <input
                  className={fieldClass}
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  required
                />
              </ReqField>
              <ReqField label="End">
                <input
                  className={fieldClass}
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  required
                />
              </ReqField>
            </FormGrid>
          </FormSection>

          <FormSection step={2} title="What it is">
            <FormGrid>
              <Input
                label="Label"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Period 1, Lunch break, …"
              />
              <label className="flex items-center gap-2 self-end pb-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_break}
                  onChange={(e) => setForm({ ...form, is_break: e.target.checked })}
                  className="rounded border-surface-border"
                />
                This is a break (lunch, recess)
              </label>
            </FormGrid>
          </FormSection>
        </div>
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Add
          </Button>
        </div>
      </form>
    </Modal>
  );
}
