"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

type Status = "present" | "late" | "absent" | "on_leave" | "sick" | "holiday";

type AttendanceRow = {
  id: number;
  user_id: number;
  user_full_name: string | null;
  user_role: string | null;
  date: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: Status;
  manually_overridden: boolean;
  override_remark: string | null;
};

type StaffLite = {
  id: number;
  user_id: number;
  full_name: string;
  role: string;
  employee_no: string;
};

const statusTone: Record<Status, "emerald" | "amber" | "rose" | "neutral" | "brand"> = {
  present: "emerald",
  late: "amber",
  absent: "rose",
  on_leave: "neutral",
  sick: "neutral",
  holiday: "brand",
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function StaffAttendancePage() {
  const [date, setDate] = useState(todayIso());
  const [userId, setUserId] = useState<number | "">("");
  const [records, setRecords] = useState<AttendanceRow[]>([]);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);

  async function load() {
    try {
      const params: Record<string, string | number> = {};
      if (userId) params.user_id = userId;
      if (date) params.date = date;
      const { data } = await api.get<AttendanceRow[]>(
        "/api/v1/school/staff-attendance",
        { params }
      );
      setRecords(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    api
      .get<StaffLite[]>("/api/v1/school/staff?status=active")
      .then((r) => setStaff(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, userId]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Staff attendance</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            See check-ins and override status (on leave, sick, etc.).
          </p>
        </div>
        <Button onClick={() => setOverrideOpen(true)}>Override status</Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
          <span className="text-[12px] font-bold text-ink-muted">Staff member</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : "")}
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="">All</option>
            {staff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name} ({s.employee_no}) — {s.role}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="secondary"
          onClick={() => {
            setDate("");
            setUserId("");
          }}
        >
          Clear
        </Button>
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
              <th className="px-4 py-3 font-bold">Date</th>
              <th className="px-4 py-3 font-bold">Staff</th>
              <th className="px-4 py-3 font-bold">Role</th>
              <th className="px-4 py-3 font-bold">Check-in</th>
              <th className="px-4 py-3 font-bold">Check-out</th>
              <th className="px-4 py-3 font-bold">Status</th>
              <th className="px-4 py-3 font-bold">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-[12px] tabular-nums">{r.date}</td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  {r.user_full_name}
                </td>
                <td className="px-4 py-3 text-slate-600">{r.user_role}</td>
                <td className="px-4 py-3">{fmtTime(r.check_in_at)}</td>
                <td className="px-4 py-3">{fmtTime(r.check_out_at)}</td>
                <td className="px-4 py-3">
                  <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                  {r.manually_overridden && (
                    <span className="ml-2 text-xs text-slate-500">override</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {r.override_remark || ""}
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No records.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {overrideOpen && (
        <OverrideModal
          staff={staff}
          defaultDate={date || todayIso()}
          onClose={() => setOverrideOpen(false)}
          onSaved={() => {
            setOverrideOpen(false);
            setNotice("Override applied.");
            load();
          }}
        />
      )}
    </div>
  );
}

function OverrideModal({
  staff,
  defaultDate,
  onClose,
  onSaved,
}: {
  staff: StaffLite[];
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [userId, setUserId] = useState<number | "">("");
  const [date, setDate] = useState(defaultDate);
  const [status, setStatus] = useState<Status>("on_leave");
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!userId) {
      setError("Pick a staff member.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/school/staff-attendance/override", {
        user_id: userId,
        date,
        status,
        remark: remark || null,
      });
      onSaved();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Override status">
      <form onSubmit={submit} className="space-y-4">
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Staff *</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : "")}
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            required
          >
            <option value="">Select…</option>
            {staff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name} ({s.employee_no}) — {s.role}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Date *"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-bold text-ink-muted">Status *</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
          >
            <option value="on_leave">On leave</option>
            <option value="sick">Sick</option>
            <option value="absent">Absent</option>
            <option value="present">Present</option>
            <option value="late">Late</option>
          </select>
        </label>
        <Input
          label="Remark"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="Reason, leave application ref, …"
        />
        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Save override
          </Button>
        </div>
      </form>
    </Modal>
  );
}
