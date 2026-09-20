"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type Status = "present" | "late" | "absent" | "on_leave" | "sick" | "holiday";

type Today = {
  date: string;
  has_record: boolean;
  check_in_at: string | null;
  check_out_at: string | null;
  status: Status | null;
  is_holiday: boolean;
  holiday_name: string | null;
  school_start_time: string | null;
  manually_overridden: boolean;
  override_remark: string | null;
};

function fmtTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const statusTone: Record<Status, "emerald" | "amber" | "rose" | "neutral" | "brand"> = {
  present: "emerald",
  late: "amber",
  absent: "rose",
  on_leave: "neutral",
  sick: "neutral",
  holiday: "brand",
};

export function CheckInCard() {
  const [today, setToday] = useState<Today | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      const { data } = await api.get<Today>("/api/v1/staff/attendance/today");
      setToday(data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function checkIn() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post("/api/v1/staff/attendance/check-in");
      setNotice("Checked in.");
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function checkOut() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.post("/api/v1/staff/attendance/check-out");
      setNotice("Checked out.");
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!today) return null;

  const checkedIn = !!today.check_in_at;
  const checkedOut = !!today.check_out_at;

  return (
    <Card>
      <CardHeader>
        <CardTitle>My attendance today</CardTitle>
        {today.status && (
          <Badge tone={statusTone[today.status]}>{today.status}</Badge>
        )}
      </CardHeader>
      <CardBody className="space-y-3">
        {today.is_holiday && (
          <div className="rounded-lg bg-warning-bg px-4 py-3 text-[13px] font-medium text-warning dark:bg-amber-500/15 dark:text-amber-200">
            Today is a holiday ({today.holiday_name}). No check-in needed.
          </div>
        )}
        {today.manually_overridden && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Marked <strong>{today.status}</strong> by school admin.{" "}
            {today.override_remark && <em>“{today.override_remark}”</em>}
          </div>
        )}

        {!today.is_holiday && !today.manually_overridden && (
          <div className="space-y-2 text-sm">
            <Row
              label="Check-in"
              value={checkedIn ? fmtTime(today.check_in_at) : "—"}
            />
            <Row
              label="Check-out"
              value={checkedOut ? fmtTime(today.check_out_at) : "—"}
            />
            {today.school_start_time && (
              <Row
                label="School start"
                value={`${today.school_start_time} (15-min grace)`}
              />
            )}
            <div className="flex gap-2 pt-2">
              {!checkedIn ? (
                <Button onClick={checkIn} loading={busy} className="flex-1">
                  Check in now
                </Button>
              ) : !checkedOut ? (
                <Button
                  variant="secondary"
                  onClick={checkOut}
                  loading={busy}
                  className="flex-1"
                >
                  Check out
                </Button>
              ) : (
                <div className="flex-1 rounded-md bg-emerald-50 px-3 py-2 text-center text-sm text-emerald-700">
                  Day complete ✓
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        {notice && (
          <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>
        )}
      </CardBody>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-1.5 last:border-0">
      <span className="text-[12px] font-bold text-ink-muted">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}
