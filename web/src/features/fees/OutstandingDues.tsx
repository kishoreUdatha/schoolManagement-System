"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, dateTime, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { DuesAgeing, ReminderLog } from "./types";

const AGE: [string, string, (d: number) => boolean][] = [
  ["", "All ages", () => true],
  ["current", "Not yet due", (d) => d <= 0],
  ["1-30", "1–30 days overdue", (d) => d >= 1 && d <= 30],
  ["31-60", "31–60 days overdue", (d) => d >= 31 && d <= 60],
  ["61-90", "61–90 days overdue", (d) => d >= 61 && d <= 90],
  ["90+", "Over 90 days overdue", (d) => d > 90],
];

/**
 * SCR-162, live: GET /school/analytics/dues-ageing (school-wide total, ageing
 * buckets and every student who owes), GET /school/fees/reminders and
 * POST /school/fees/reminders/run to send today's due reminders.
 */
export function OutstandingDues() {
  const router = useRouter();
  const dues = useApi<DuesAgeing>("/api/v1/school/analytics/dues-ageing");
  const sent = useApi<ReminderLog[]>("/api/v1/school/fees/reminders", { limit: 1 });
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("");
  const [age, setAge] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const d = dues.data;
  const bucket = (label: string) => Number(d?.buckets.find((b) => b.label === label)?.amount ?? 0);
  const notDue = bucket("Not yet due");
  const stats = [
    { label: "Total outstanding", value: d ? money(d.total) : "…", note: d ? `As of ${date(d.as_of)}` : "School-wide" },
    { label: "Overdue", value: d ? money(Number(d.total) - notDue) : "…", note: "Past due date" },
    { label: "Not yet due", value: d ? money(notDue) : "…", note: "Raised, due later" },
    { label: "Accounts", value: d ? d.students_owing.toLocaleString("en-IN") : "…", note: "Students with a balance" },
  ];

  const classes = useMemo(() => Array.from(new Set((d?.defaulters ?? []).map((x) => x.section_label).filter((x): x is string => Boolean(x)))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [d]);
  const test = AGE.find(([k]) => k === age)?.[2] ?? (() => true);
  const items = (d?.defaulters ?? []).filter((x) => {
    const term = q.trim().toLowerCase();
    if (term && !`${x.student_name} ${x.admission_no}`.toLowerCase().includes(term)) return false;
    if (cls && x.section_label !== cls) return false;
    return test(x.oldest_days);
  });
  const rows: Row[] = items.map((x) => [
    { name: x.student_name, sub: x.admission_no },
    x.section_label ?? "—",
    `${x.items} unpaid`,
    money(x.owed),
    x.oldest_days > 0 ? String(x.oldest_days) : "Not yet due",
  ]);

  async function runReminders() {
    if (!window.confirm("Send a fee reminder to every family with fees due or overdue? Families already reminded today are skipped.")) return;
    setRunning(true);
    setError(null);
    try {
      const r = await api.post<{ sent?: number; skipped_already_sent?: number }>("/api/v1/school/fees/reminders/run");
      notify(
        r?.sent
          ? `${r.sent} reminder(s) sent. They appear in each family's notices.`
          : r?.skipped_already_sent
            ? `No new reminders: ${r.skipped_already_sent} family(ies) were already reminded today.`
            : "Nobody is due a reminder right now.",
      );
      sent.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRunning(false);
    }
  }

  const last = sent.data?.[0];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search outstanding dues…" aria-label="Search records" />
        </div>
        <select aria-label="Filter by class" value={cls} onChange={(e) => setCls(e.target.value)}>
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select aria-label="Filter by age" value={age} onChange={(e) => setAge(e.target.value)}>
          {AGE.map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button type="button" className="btn primary" onClick={runReminders} disabled={running}>
          <Icon name="bell" className="sm" />
          {running ? "Sending…" : "Send reminder"}
        </button>
      </div>
      <ErrorNote>{error ?? dues.error}</ErrorNote>
      <Panel title="Outstanding accounts" sub={`Amounts in INR${last?.sent_at ? ` · Last reminder sent ${dateTime(last.sent_at)}` : ""}${dues.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Student", "Class", "Items", "Outstanding", "Overdue days"]}
          rows={rows}
          onView={(i) => router.push(`${routeOf(161)}?id=${items[i].student_id}`)}
          empty={dues.loading ? "Loading dues…" : q || cls || age ? "No accounts match these filters." : "Nobody owes the school anything."}
        />
      </Panel>
    </>
  );
}
