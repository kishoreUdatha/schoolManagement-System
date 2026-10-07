"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { errorText } from "@/lib/api";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { downloadCsv } from "@/features/staff/util";
import type { SchoolClass } from "@/features/students/types";
import { useYears } from "@/features/admissions/shared";
import { downloadAuthed, isoToday, modeLabel } from "./common";
import { FinanceReports } from "./FinanceReports";
import { DateRange } from "./IncomeList";
import type { FeeHead } from "./types";

const BASE = "/api/v1/school/finance/reports";
const REPORTS: [string, string][] = [
  ["summary", "Money in and out (summary)"],
  ["monthly", "Month-wise collections"],
  ["class", "Dues by class"],
  ["branch", "Dues by branch"],
  ["feetype", "Students by fee type"],
  ["concessions", "Concessions given"],
  ["cheques", "Bounced cheques"],
  ["slips", "Fee reminder slips"],
];

/**
 * SCR-171, live: the fee office's reports in one place. A Report picker
 * chooses: the money in / out summary (GET /finance/report) or one of
 * GET /finance/reports/{monthly-collections, dues-by, fee-type-students,
 * concessions, bounced-cheques} and the printable reminder-slips.pdf.
 */
export function FeeReports() {
  const [report, setReport] = useState("summary");
  return (
    <>
      <div className="filterbar report-pick">
        <label className="row" style={{ gap: 8 }}>
          <span className="muted small">Report</span>
          <select aria-label="Report" value={report} onChange={(e) => setReport(e.target.value)}>
            {REPORTS.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      {report === "summary" ? <FinanceReports /> : null}
      {report === "monthly" ? <Monthly /> : null}
      {report === "class" || report === "branch" ? <DuesBy by={report} /> : null}
      {report === "feetype" ? <FeeTypeStudents /> : null}
      {report === "concessions" ? <ConcessionsReport /> : null}
      {report === "cheques" ? <BouncedCheques /> : null}
      {report === "slips" ? <ReminderSlips /> : null}
    </>
  );
}

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

function Monthly() {
  type M = { modes: string[]; total: string; receipts: number; year_from: string; months: { month: string; label: string; receipts: number; total: string; modes: Record<string, string> }[] };
  const r = useApi<M>(`${BASE}/monthly-collections`);
  const d = r.data;
  if (!d) return r.error ? <ErrorNote>{r.error}</ErrorNote> : <Loading what="Loading collections…" />;
  const best = d.months.reduce((a, m) => (Number(m.total) > Number(a.total) ? m : a), d.months[0]);
  return (
    <>
      <StatStrip
        compact
        items={[
          { label: "Collected this year", value: money(d.total), note: `${d.receipts} receipts` },
          { label: "Best month", value: Number(best.total) ? best.label : "—", note: Number(best.total) ? money(best.total) : "Nothing collected" },
          { label: "Methods", value: String(d.modes.length), note: d.modes.map(modeLabel).join(", ") || "—" },
          { label: "Year", value: `FY ${d.year_from.slice(0, 4)}-${String(Number(d.year_from.slice(0, 4)) + 1).slice(2)}`, note: "April to March" },
        ]}
      />
      <Panel flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="num">Receipts</th>
                {d.modes.map((m) => (
                  <th key={m} className="num">
                    {modeLabel(m)}
                  </th>
                ))}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {d.months.map((m) => (
                <tr key={m.month} className={Number(m.total) ? "" : "muted-row"}>
                  <td>{m.label}</td>
                  <td className="num">{m.receipts || "—"}</td>
                  {d.modes.map((k) => (
                    <td key={k} className="num">
                      {m.modes[k] ? money(m.modes[k]) : "—"}
                    </td>
                  ))}
                  <td className="num">
                    <strong>{Number(m.total) ? money(m.total) : "—"}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function DuesBy({ by }: { by: string }) {
  type Row = { name: string; students: number; students_owing: number; raised: string; paid: string; due: string; overdue: string; collected_pct: number | null };
  const r = useApi<{ rows: Row[]; totals: { raised: string; paid: string; due: string; overdue: string }; students_owing: number }>(`${BASE}/dues-by`, { by });
  const d = r.data;
  if (!d) return r.error ? <ErrorNote>{r.error}</ErrorNote> : <Loading what="Loading dues…" />;
  const t = d.totals;
  return (
    <>
      <StatStrip
        compact
        items={[
          { label: "Raised", value: money(t.raised), note: "Fees charged, waivers left out" },
          { label: "Collected", value: money(t.paid), note: pct(Number(t.paid), Number(t.raised)) + " of raised" },
          { label: "Still due", value: money(t.due), note: `${d.students_owing} students owe` },
          { label: "Overdue", value: money(t.overdue), note: "Past the due date" },
        ]}
      />
      <Panel flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{by === "class" ? "Class" : "Branch"}</th>
                <th className="num">Students</th>
                <th className="num">Owing</th>
                <th className="num">Raised</th>
                <th className="num">Collected</th>
                <th className="num">Still due</th>
                <th className="num">Overdue</th>
                <th className="num">Collected %</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((x) => (
                <tr key={x.name}>
                  <td>{x.name}</td>
                  <td className="num">{x.students}</td>
                  <td className="num">{x.students_owing}</td>
                  <td className="num">{money(x.raised)}</td>
                  <td className="num">{money(x.paid)}</td>
                  <td className="num">{money(x.due)}</td>
                  <td className="num">{Number(x.overdue) ? <span className="badge warn">{money(x.overdue)}</span> : "—"}</td>
                  <td className="num">{x.collected_pct === null ? "—" : `${x.collected_pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function FeeTypeStudents() {
  type Row = { student_id: number; student_name: string; admission_no: string; class_label: string | null; period: string; due_date: string; amount_due: string; amount_paid: string; outstanding: string; state: string };
  const heads = useApi<FeeHead[]>("/api/v1/school/fees/heads", { active_only: true });
  const [head, setHead] = useState<number | "">("");
  const [state, setState] = useState("all");
  const r = useApi<{ head: { name: string } | null; rows: Row[]; totals: { amount_due: string; amount_paid: string; outstanding: string } }>(head ? `${BASE}/fee-type-students` : null, { fee_head_id: head, state });
  const d = r.data;
  return (
    <>
      <div className="filterbar">
        <select aria-label="Fee type" value={head} onChange={(e) => setHead(e.target.value ? Number(e.target.value) : "")}>
          <option value="">Choose a fee type</option>
          {(heads.data ?? []).map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
        <select aria-label="Who" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="all">Everyone charged</option>
          <option value="unpaid">Still owing</option>
          <option value="paid">Paid in full</option>
        </select>
        {d ? <span className="filter-count">{`${d.rows.length} · ${money(d.totals.outstanding)} still due`}</span> : null}
        <button
          type="button"
          className="btn"
          disabled={!d?.rows.length}
          onClick={() => downloadCsv(`${d!.head?.name ?? "fee"}-students.csv`, ["Student", "Admission no.", "Class", "Period", "Due date", "Charged", "Paid", "Outstanding", "Status"], d!.rows.map((x) => [x.student_name, x.admission_no, x.class_label ?? "", x.period, x.due_date, x.amount_due, x.amount_paid, x.outstanding, x.state]))}
        >
          <Icon name="download" className="sm" />
          Export
        </button>
      </div>
      <ErrorNote>{r.error ?? heads.error}</ErrorNote>
      {!head ? (
        <p className="muted">Choose a fee type to list the students charged it.</p>
      ) : !d ? (
        <Loading what="Loading…" />
      ) : (
        <Panel flush>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Period</th>
                  <th className="num">Charged</th>
                  <th className="num">Paid</th>
                  <th className="num">Outstanding</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {d.rows.map((x, i) => (
                  <tr key={`${x.student_id}-${x.period}-${i}`}>
                    <td>
                      {x.student_name}
                      <small className="muted" style={{ display: "block", fontWeight: 500 }}>{x.admission_no}</small>
                    </td>
                    <td>{x.class_label ?? "—"}</td>
                    <td>{x.period === "ONETIME" ? "One-time" : x.period}</td>
                    <td className="num">{money(x.amount_due)}</td>
                    <td className="num">{money(x.amount_paid)}</td>
                    <td className="num">{Number(x.outstanding) ? money(x.outstanding) : "—"}</td>
                    <td>
                      <span className={`badge ${x.state === "paid" ? "" : x.state === "waived" ? "neutral" : "warn"}`}>{x.state}</span>
                    </td>
                  </tr>
                ))}
                {!d.rows.length ? (
                  <tr>
                    <td colSpan={7} className="table-empty">
                      Nobody here.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}

function ConcessionsReport() {
  type Row = { id: number; student_id: number; student_name: string; admission_no: string; class_label: string | null; reason: string; fee: string; value: string; valid_from: string; valid_to: string | null; status: string; approved_by_name: string | null; conceded_this_year: string };
  const r = useApi<{ rows: Row[]; by_reason: { reason: string; students: number; concessions: number; amount: string }[]; total: string; pending: number }>(`${BASE}/concessions`);
  const d = r.data;
  if (!d) return r.error ? <ErrorNote>{r.error}</ErrorNote> : <Loading what="Loading concessions…" />;
  return (
    <>
      <StatStrip
        compact
        items={[
          { label: "Taken off this year", value: money(d.total), note: "From fees falling due this year" },
          { label: "Concessions", value: String(d.rows.filter((x) => x.status === "in force").length), note: "In force now" },
          { label: "Biggest type", value: d.by_reason[0]?.reason ?? "—", note: d.by_reason[0] ? money(d.by_reason[0].amount) : "None given" },
          { label: "Waiting for approval", value: String(d.pending), note: d.pending ? "Under Approval requests" : "Nothing waiting" },
        ]}
      />
      {d.by_reason.length ? (
        <Panel title="By type" flush>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th className="num">Students</th>
                  <th className="num">Concessions</th>
                  <th className="num">Taken off this year</th>
                </tr>
              </thead>
              <tbody>
                {d.by_reason.map((x) => (
                  <tr key={x.reason}>
                    <td style={{ textTransform: "capitalize" }}>{x.reason}</td>
                    <td className="num">{x.students}</td>
                    <td className="num">{x.concessions}</td>
                    <td className="num">{money(x.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
      <div className="gap" />
      <Panel title="Every concession" flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Type</th>
                <th>On</th>
                <th>Concession</th>
                <th>From – to</th>
                <th>Status</th>
                <th className="num">Taken off this year</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((x) => (
                <tr key={x.id}>
                  <td>
                    {x.student_name}
                    <small className="muted" style={{ display: "block", fontWeight: 500 }}>{[x.class_label, x.admission_no].filter(Boolean).join(" · ")}</small>
                  </td>
                  <td style={{ textTransform: "capitalize" }}>{x.reason}</td>
                  <td>{x.fee}</td>
                  <td>{x.value}</td>
                  <td>{`${date(x.valid_from)} – ${x.valid_to ? date(x.valid_to) : "open"}`}</td>
                  <td>
                    <span className={`badge ${x.status === "in force" ? "" : x.status === "pending" ? "warn" : "neutral"}`}>{x.status}</span>
                  </td>
                  <td className="num">{Number(x.conceded_this_year) ? money(x.conceded_this_year) : "—"}</td>
                </tr>
              ))}
              {!d.rows.length ? (
                <tr>
                  <td colSpan={7} className="table-empty">
                    No concessions given yet. They're added under Fee setup → Discounts &amp; scholarships.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function BouncedCheques() {
  type Row = { id: number; cheque_no: string; bank_name: string; drawer_name: string | null; cheque_date: string; received_on: string; amount: string; reason: string | null; student_id: number; student_name: string; admission_no: string; charge_raised: boolean };
  const [from, setFrom] = useState(`${isoToday().slice(0, 4)}-04-01` > isoToday() ? `${Number(isoToday().slice(0, 4)) - 1}-04-01` : `${isoToday().slice(0, 4)}-04-01`);
  const [to, setTo] = useState(isoToday());
  const r = useApi<{ rows: Row[]; total: string }>(`${BASE}/bounced-cheques`, { from, to });
  const d = r.data;
  return (
    <>
      <div className="filterbar">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        {d ? <span className="filter-count">{`${d.rows.length} bounced · ${money(d.total)}`}</span> : null}
      </div>
      <ErrorNote>{r.error}</ErrorNote>
      <Panel flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cheque</th>
                <th>Student</th>
                <th>Received</th>
                <th className="num">Amount</th>
                <th>Reason</th>
                <th>Bounce charge</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(d?.rows ?? []).map((x) => (
                <tr key={x.id}>
                  <td>
                    {x.cheque_no}
                    <small className="muted" style={{ display: "block", fontWeight: 500 }}>{`${x.bank_name}${x.drawer_name ? ` · ${x.drawer_name}` : ""}`}</small>
                  </td>
                  <td>
                    {x.student_name}
                    <small className="muted" style={{ display: "block", fontWeight: 500 }}>{x.admission_no}</small>
                  </td>
                  <td>{date(x.received_on)}</td>
                  <td className="num">{money(x.amount)}</td>
                  <td className="wrap">{x.reason ?? "—"}</td>
                  <td>{x.charge_raised ? "Charged" : "—"}</td>
                  <td className="num">
                    <Link className="btn" href={`${routeOf(158)}?student=${x.student_id}`}>
                      Collect
                    </Link>
                  </td>
                </tr>
              ))}
              {d && !d.rows.length ? (
                <tr>
                  <td colSpan={7} className="table-empty">
                    No cheque bounced in these dates.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function ReminderSlips() {
  // the classes of the current academic year (the list needs a year)
  const years = useYears();
  const classes = useApi<SchoolClass[]>(years.current ? "/api/v1/school/classes" : null, { academic_year_id: years.current?.id });
  const [classId, setClassId] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [payBy, setPayBy] = useState("");
  const [busy, setBusy] = useState(false);
  async function print() {
    setBusy(true);
    try {
      const q = new URLSearchParams();
      if (classId) q.set("class_id", classId);
      if (overdue) q.set("overdue_only", "true");
      if (payBy) q.set("pay_by", payBy);
      await downloadAuthed(`${BASE}/reminder-slips.pdf?${q}`, `fee-reminder-slips_${isoToday()}.pdf`);
      notify("Reminder slips saved. Print them and send them home with the children.");
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Panel title="Fee reminder slips" sub="One slip per student who owes: each unpaid fee, its due date and the total, to print and send home.">
      <div className="form-grid three">
        <label className="field">
          <span>Class</span>
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">Every class</option>
            {(classes.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Ask them to pay by</span>
          <input type="date" value={payBy} min={isoToday()} onChange={(e) => setPayBy(e.target.value)} />
        </label>
        <label className="field">
          <span>Which fees</span>
          <select value={overdue ? "overdue" : "all"} onChange={(e) => setOverdue(e.target.value === "overdue")}>
            <option value="all">Everything unpaid</option>
            <option value="overdue">Only overdue</option>
          </select>
        </label>
      </div>
      <div className="gap" />
      <button type="button" className="btn primary" disabled={busy} onClick={print}>
        <Icon name="download" className="sm" />
        {busy ? "Preparing…" : "Download slips (PDF)"}
      </button>
      <p className="muted small" style={{ marginTop: 8 }}>
        Several slips to an A4 page, with a cut line between them. To send reminders by message instead, use Outstanding dues → Send reminder.
      </p>
    </Panel>
  );
}
