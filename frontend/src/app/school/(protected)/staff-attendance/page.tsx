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
          <h1 className="text-2xl font-bold text-slate-900">Staff attendance</h1>
          <p className="mt-1 text-sm text-slate-500">
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
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">Staff member</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>
      )}

      <Card>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Staff</th>
              <th className="px-4 py-2 font-medium">Role</th>
              <th className="px-4 py-2 font-medium">Check-in</th>
              <th className="px-4 py-2 font-medium">Check-out</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-mono text-xs">{r.date}</td>
                <td className="px-4 py-2 font-medium text-slate-900">
                  {r.user_full_name}
                </td>
                <td className="px-4 py-2 text-slate-600">{r.user_role}</td>
                <td className="px-4 py-2">{fmtTime(r.check_in_at)}</td>
                <td className="px-4 py-2">{fmtTime(r.check_out_at)}</td>
                <td className="px-4 py-2">
                  <Badge tone={statusTone[r.status]}>{r.status}</Badge>
                  {r.manually_overridden && (
                    <span className="ml-2 text-xs text-slate-500">override</span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-slate-600">
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
          <span className="text-sm font-medium text-slate-700">Staff *</span>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : "")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
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
          <span className="text-sm font-medium text-slate-700">Status *</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Status)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm"
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
          <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
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
