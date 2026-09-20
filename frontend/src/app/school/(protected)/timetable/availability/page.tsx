"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";
import { hhmm } from "@/lib/dates";

const DAYS = [1, 2, 3, 4, 5] as const;
const DAY_NAME: Record<number, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

type Staff = { id: number; user_id: number; full_name: string; role: string; is_active: boolean };
type Period = {
  id: number;
  day_of_week: number;
  period_number: number;
  start_time: string;
  end_time: string;
  label: string | null;
  is_break: boolean;
};
type Block = {
  id: number;
  user_id: number;
  day_of_week: number;
  period_number: number | null;
  reason: string | null;
  full_name: string;
};

/** When a teacher cannot teach, week in and week out.
 *
 *  This is a recurring pattern, not an absence: coordinator time on a Tuesday
 *  afternoon, or a day somebody does not work. A one-off illness belongs in
 *  staff leave, which is what cover reads to find a substitute.
 */
export default function TeacherAvailabilityPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [userId, setUserId] = useState<number | "">("");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Staff[]>("/api/v1/school/staff", { params: { status: "active" } })
      .then((r) => {
        setStaff(r.data);
        const first = r.data.find((s) => s.role === "teacher") ?? r.data[0];
        if (first) setUserId(first.user_id);
      })
      .catch((e) => setError(apiError(e)));

    api
      .get<Period[]>("/api/v1/school/periods")
      .then((r) => setPeriods(r.data))
      .catch((e) => setError(apiError(e)));

    api
      .get<Block[]>("/api/v1/school/cover/unavailability")
      .then((r) => setBlocks(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  // The grid is one column per weekday and one row per period number, so the
  // distinct numbers across the week decide the rows.
  const periodNumbers = useMemo(
    () =>
      Array.from(
        new Set(periods.filter((p) => !p.is_break).map((p) => p.period_number))
      ).sort((a, b) => a - b),
    [periods]
  );

  const periodAt = (day: number, number: number) =>
    periods.find((p) => p.day_of_week === day && p.period_number === number);

  const mine = useMemo(
    () => blocks.filter((b) => b.user_id === userId),
    [blocks, userId]
  );
  const wholeDay = (day: number) =>
    mine.find((b) => b.day_of_week === day && b.period_number === null);
  const atSlot = (day: number, number: number) =>
    mine.find((b) => b.day_of_week === day && b.period_number === number);

  async function toggle(day: number, number: number | null) {
    if (!userId) return;
    const existing = number === null ? wholeDay(day) : atSlot(day, number);
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = existing
        ? await api.delete<Block[]>(`/api/v1/school/cover/unavailability/${existing.id}`)
        : await api.post<Block[]>("/api/v1/school/cover/unavailability", {
            user_id: userId,
            day_of_week: day,
            period_number: number,
            reason: reason.trim() || null,
          });
      setBlocks(res.data);
      setNotice(
        existing
          ? `${DAY_NAME[day]}${number === null ? "" : ` P${number}`} freed up.`
          : `${DAY_NAME[day]}${number === null ? "" : ` P${number}`} blocked out.`
      );
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  const person = staff.find((s) => s.user_id === userId);
  const blockedCount = mine.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Teacher availability"
        subtitle="The hours somebody cannot teach, every week. The generator and cover both respect these."
        actions={
          <Link href="/school/timetable">
            <Button variant="secondary">All timetables</Button>
          </Link>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Select
            label="Teacher"
            value={userId}
            onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Select…</option>
            {staff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name}
                {s.role === "teacher" ? "" : ` — ${s.role}`}
              </option>
            ))}
          </Select>
          <Input
            label="Reason for the next block"
            value={reason}
            placeholder="Coordinator time"
            hint="Optional, and only applied to blocks you add from now on."
            onChange={(e) => setReason(e.target.value)}
          />
          {person && (
            <p className="ml-auto text-[12px] text-ink-subtle">
              {blockedCount === 0
                ? `${person.full_name} is available all week.`
                : `${blockedCount} block(s) set for ${person.full_name}.`}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{person ? person.full_name : "Weekly pattern"}</CardTitle>
          <span className="text-[12px] font-bold text-ink-muted">
            A ticked box means they cannot teach then
          </span>
        </CardHeader>
        <CardBody className="p-0">
          {!userId || periodNumbers.length === 0 ? (
            <p className="px-5 py-10 text-center text-[13px] text-ink-muted">
              {periodNumbers.length === 0
                ? "No periods have been set up yet."
                : "Pick a teacher to see their week."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[680px] border-separate border-spacing-0 text-[13px]">
                <thead>
                  <tr className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                    <th className="w-24 border-b border-surface-border px-4 py-3">Period</th>
                    {DAYS.map((d) => (
                      <th key={d} className="border-b border-surface-border px-4 py-3">
                        {DAY_NAME[d].slice(0, 3)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border-b border-surface-border px-4 py-2 text-[12px] font-bold text-ink-muted">
                      All day
                    </td>
                    {DAYS.map((d) => {
                      const off = wholeDay(d);
                      return (
                        <td key={d} className="border-b border-surface-border px-4 py-2">
                          <label className="flex items-center gap-2 text-[12px] text-ink-muted">
                            <input
                              type="checkbox"
                              checked={!!off}
                              disabled={busy}
                              onChange={() => toggle(d, null)}
                            />
                            {off ? <Badge tone="rose">Off</Badge> : "Available"}
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                  {periodNumbers.map((pn) => (
                    <tr key={pn}>
                      <td className="border-b border-surface-border px-4 py-2 text-[12px] font-bold tabular-nums text-ink-muted">
                        P{pn}
                      </td>
                      {DAYS.map((d) => {
                        const period = periodAt(d, pn);
                        const dayOff = !!wholeDay(d);
                        const slot = atSlot(d, pn);
                        if (!period) {
                          return (
                            <td
                              key={d}
                              className="border-b border-surface-border bg-surface-subtle px-4 py-2 text-center text-[12px] text-ink-subtle"
                            >
                              —
                            </td>
                          );
                        }
                        return (
                          <td key={d} className="border-b border-surface-border px-4 py-2">
                            <label
                              className={
                                "flex items-center gap-2 text-[12px] " +
                                (dayOff ? "text-ink-subtle" : "text-ink-muted")
                              }
                              title={
                                dayOff
                                  ? "The whole day is already blocked"
                                  : slot?.reason ?? undefined
                              }
                            >
                              <input
                                type="checkbox"
                                checked={dayOff || !!slot}
                                // The whole day already covers this slot, so a
                                // per-period tick underneath it would be a
                                // second record saying the same thing.
                                disabled={busy || dayOff}
                                onChange={() => toggle(d, pn)}
                              />
                              <span className="tabular-nums">
                                {hhmm(period.start_time)}
                              </span>
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      {mine.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>What is set</CardTitle>
          </CardHeader>
          <CardBody className="space-y-1">
            {mine
              .slice()
              .sort((a, b) => a.day_of_week - b.day_of_week || (a.period_number ?? 0) - (b.period_number ?? 0))
              .map((b) => (
                <p key={b.id} className="text-[13px] text-ink-muted">
                  <strong className="text-ink">{DAY_NAME[b.day_of_week]}</strong>
                  {b.period_number === null ? " — all day" : ` — period ${b.period_number}`}
                  {b.reason ? ` · ${b.reason}` : ""}
                </p>
              ))}
          </CardBody>
        </Card>
      )}

      <p className="text-[12px] text-ink-subtle">
        This is a repeating weekly pattern. A one-off absence goes in staff leave, which
        is what{" "}
        <Link href="/school/cover" className="font-bold text-brand-600 hover:underline">
          cover
        </Link>{" "}
        reads when it looks for a substitute.
      </p>
    </div>
  );
}
