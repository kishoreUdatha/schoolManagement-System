"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  Textarea,
  WarnBox,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  FilterBar,
  PanelFooter,
  PersonCell,
  StatStrip,
} from "@/components/ui/Workspace";
import { CalendarRange, PhoneOff, TriangleAlert, Hourglass } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { shortDate } from "@/lib/dates";

/** A select sized for the filter bar: same height as the search box, and no
 *  stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Student = {
  student_id: number;
  admission_no: string;
  student_name: string;
  section_label: string | null;
  marked_days: number;
  present_days: number;
  absent_days: number;
  percent: number;
  last_contact_on: string | null;
  last_contact_method: string | null;
  last_contact_note: string | null;
  follow_up_on: string | null;
  follow_up_due: boolean;
  never_contacted: boolean;
};
type AtRisk = {
  below: number;
  from_date: string;
  to_date: string;
  students: Student[];
  count: number;
  never_contacted: number;
  follow_ups_due: number;
};
type Contact = {
  id: number;
  student_name: string | null;
  contacted_on: string;
  method: string;
  spoke_to: string | null;
  note: string;
  agreed_action: string | null;
  follow_up_on: string | null;
  recorded_by: string | null;
};

const METHODS = ["phone", "message", "email", "meeting", "home_visit"];

const pctTone = (p: number) => (p < 50 ? "rose" : p < 70 ? "amber" : "neutral");

/** The chronic-absence report, turned into a worklist.
 *
 *  On its own the report re-discovers the same children every month. What
 *  changes anything is whether somebody has spoken to the family, so the last
 *  contact sits beside the percentage and a child nobody has rung is flagged
 *  as loudly as a child whose attendance is worst.
 */
export default function AtRiskPage() {
  const [below, setBelow] = useState(75);
  const [days, setDays] = useState(120);
  const [data, setData] = useState<AtRisk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [logging, setLogging] = useState<Student | null>(null);
  const [history, setHistory] = useState<Contact[] | null>(null);
  const [openFor, setOpenFor] = useState<Student | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    method: "phone",
    spoke_to: "",
    note: "",
    agreed_action: "",
    follow_up_on: "",
  });

  const load = useCallback(() => {
    api
      .get<AtRisk>("/api/v1/school/attendance-ops/at-risk", {
        params: { below, days },
      })
      .then((r) => {
        setData(r.data);
        setError(null);
      })
      .catch((e) => setError(apiError(e)));
  }, [below, days]);

  useEffect(() => {
    load();
  }, [load]);

  const showHistory = async (s: Student) => {
    setOpenFor(s);
    setHistory(null);
    try {
      const r = await api.get<Contact[]>(
        `/api/v1/school/attendance-ops/contacts/${s.student_id}`
      );
      setHistory(r.data);
    } catch (e) {
      setError(apiError(e));
    }
  };

  const log = async () => {
    if (!logging) return;
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await api.post("/api/v1/school/attendance-ops/contacts", {
        student_id: logging.student_id,
        method: form.method,
        spoke_to: form.spoke_to || null,
        note: form.note,
        agreed_action: form.agreed_action || null,
        follow_up_on: form.follow_up_on || null,
      });
      setSaved(`Recorded for ${logging.student_name}.`);
      setLogging(null);
      setForm({ method: "phone", spoke_to: "", note: "", agreed_action: "", follow_up_on: "" });
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = [...(data?.students ?? [])].sort((a, b) => a.percent - b.percent);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Children at risk"
        subtitle="Whose attendance has slipped, and what has been done about it."
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <StatStrip
        stats={[
          {
            label: "At risk",
            value: data?.count ?? "—",
            note: data ? `Below ${data.below}%` : undefined,
            icon: TriangleAlert,
          },
          {
            label: "Never contacted",
            value: data?.never_contacted ?? "—",
            note: "Nobody has rung the family",
            icon: PhoneOff,
          },
          {
            label: "Follow-ups due",
            value: data?.follow_ups_due ?? "—",
            note: "A date that has come round",
            icon: Hourglass,
          },
          {
            label: "Window",
            value: data ? `${shortDate(data.from_date)} – ${shortDate(data.to_date)}` : "—",
            note: `Last ${days} days`,
            icon: CalendarRange,
          },
        ]}
      />

      <FilterBar>
        <select
          aria-label="Attendance threshold"
          value={below}
          onChange={(e) => setBelow(Number(e.target.value))}
          className={filterSelect}
        >
          {[50, 60, 70, 75, 80, 90, 95].map((n) => (
            <option key={n} value={n}>
              Below {n}%
            </option>
          ))}
        </select>
        <select
          aria-label="How far back to look"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className={filterSelect}
        >
          {[30, 60, 90, 120, 180, 365].map((n) => (
            <option key={n} value={n}>
              Last {n} days
            </option>
          ))}
        </select>
        <Button variant="secondary" onClick={load}>
          Apply
        </Button>
      </FilterBar>

      {data && data.never_contacted > 0 && (
        <WarnBox>
          {data.never_contacted} child(ren) below {data.below}% have never been contacted.
          The list on its own changes nothing — it is the conversation with a family that
          does.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Worst first</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Lowest attendance at the top, with the last conversation beside it so the
              list reads as a worklist rather than a report.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Student", "Attendance", "Days", "Last contact", "Follow-up", ""]}
            empty={
              rows.length === 0 &&
              `Nobody is below ${below}% over the last ${days} days.`
            }
          >
            {rows.map((s) => (
              <tr key={s.student_id}>
                <td className={tdStrong}>
                  <PersonCell
                    name={s.student_name}
                    sub={`${s.admission_no}${s.section_label ? ` · ${s.section_label}` : ""}`}
                  />
                </td>
                <td className={td}>
                  <Badge tone={pctTone(s.percent)}>{s.percent}%</Badge>
                </td>
                <td className={td}>
                  {s.present_days} of {s.marked_days}
                  <span className="block text-[11px] text-ink-subtle">
                    {s.absent_days} away
                  </span>
                </td>
                <td className={td}>
                  {s.never_contacted ? (
                    <Badge tone="rose">Never</Badge>
                  ) : (
                    <>
                      {shortDate(s.last_contact_on!)}
                      <span className="block text-[11px] text-ink-subtle">
                        {humanize(s.last_contact_method ?? "")}
                      </span>
                    </>
                  )}
                </td>
                <td className={td}>
                  {s.follow_up_on ? (
                    <Badge tone={s.follow_up_due ? "amber" : "neutral"}>
                      {shortDate(s.follow_up_on)}
                      {s.follow_up_due ? " · due" : ""}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={td}>
                  <div className="flex gap-2">
                    <Button onClick={() => setLogging(s)}>Log contact</Button>
                    <Button variant="secondary" onClick={() => showHistory(s)}>
                      History
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${rows.length} child(ren) below ${below}% over the last ${days} days`}
          right={
            data
              ? `${data.never_contacted} never contacted · ${data.follow_ups_due} follow-up(s) due`
              : "Loading…"
          }
        />
      </Card>

      <Modal
        open={logging !== null}
        onClose={() => setLogging(null)}
        title={logging ? `Contact about ${logging.student_name}` : ""}
      >
        <div className="space-y-4">
          <Select
            label="How"
            value={form.method}
            onChange={(e) => setForm({ ...form, method: e.target.value })}
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {humanize(m)}
              </option>
            ))}
          </Select>
          <Input
            label="Spoke to"
            value={form.spoke_to}
            placeholder="Mother, father, guardian…"
            onChange={(e) => setForm({ ...form, spoke_to: e.target.value })}
          />
          <Textarea
            label="What was said"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
          <Textarea
            label="What was agreed"
            value={form.agreed_action}
            onChange={(e) => setForm({ ...form, agreed_action: e.target.value })}
          />
          <Input
            label="Follow up on"
            type="date"
            value={form.follow_up_on}
            onChange={(e) => setForm({ ...form, follow_up_on: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLogging(null)}>
              Cancel
            </Button>
            <Button onClick={log} loading={busy} disabled={form.note.trim().length < 3}>
              Record
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={openFor !== null}
        onClose={() => setOpenFor(null)}
        title={openFor ? `What has been tried for ${openFor.student_name}` : ""}
        size="lg"
      >
        <div className="space-y-3">
          {history === null && <p className="text-[13px] text-ink-muted">Loading…</p>}
          {history?.length === 0 && (
            <p className="text-[13px] text-ink-subtle">
              Nobody has recorded a conversation about this child yet.
            </p>
          )}
          {history?.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] font-bold text-ink">
                  {shortDate(c.contacted_on)} · {humanize(c.method)}
                  {c.spoke_to ? ` · ${c.spoke_to}` : ""}
                </span>
                {c.follow_up_on && (
                  <Badge tone="neutral">Follow up {shortDate(c.follow_up_on)}</Badge>
                )}
              </div>
              <p className="mt-2 text-[13px] text-ink-muted">{c.note}</p>
              {c.agreed_action && (
                <p className="mt-1 text-[13px] text-ink">Agreed: {c.agreed_action}</p>
              )}
              {c.recorded_by && (
                <p className="mt-1 text-[11px] text-ink-subtle">by {c.recorded_by}</p>
              )}
            </Card>
          ))}
        </div>
      </Modal>
    </div>
  );
}
