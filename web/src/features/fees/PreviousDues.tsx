"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { ask } from "@/lib/dialog";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { downloadCsv } from "@/features/staff/util";

type Row = {
  fee_id: number;
  student_id: number;
  student_name: string;
  admission_no: string;
  class_label: string | null;
  fee_head_name: string;
  period: string;
  note: string | null;
  due_date: string;
  kind: "entered" | "carried over";
  amount_due: string;
  amount_paid: string;
  outstanding: string;
  is_active: boolean;
};
type Report = { year_start: string; rows: Row[]; students: number; total: string; entered: string; carried: string };

const BASE = "/api/v1/school/fees/previous-dues";

/**
 * NEW-100, live: dues from earlier years. Entered ones (what students owed
 * when the school started here, under the "Previous year dues" fee type;
 * an opening balance in the books) and carried-over ones (an earlier year's
 * fees still unpaid). GET /fees/previous-dues, POST to enter (one row per
 * student, pasted from a sheet), DELETE /{id} to take one back.
 * Collect opens Collect fees for the student, where they are marked.
 */
export function PreviousDues() {
  const r = useApi<Report>(BASE);
  const [q, setQ] = useState("");
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = r.data;
  if (!d) return r.error ? <ErrorNote>{r.error}</ErrorNote> : <Loading what="Loading previous-year dues…" />;
  const term = q.trim().toLowerCase();
  const rows = d.rows.filter((x) => !term || `${x.student_name} ${x.admission_no} ${x.class_label ?? ""}`.toLowerCase().includes(term));
  const stats = [
    { label: "Owed from earlier years", value: money(d.total), note: `${d.students} student${d.students === 1 ? "" : "s"}` },
    { label: "Entered", value: money(d.entered), note: "From the old register or system" },
    { label: "Carried over", value: money(d.carried), note: "Earlier years' fees still unpaid" },
    { label: "This year began", value: date(d.year_start), note: "Dues before this are previous year" },
  ];

  async function remove(x: Row) {
    if (!(await ask(`Remove ${money(x.outstanding)} entered for ${x.student_name}? Use this only for a due typed in error.`))) return;
    try {
      await api.delete(`${BASE}/${x.fee_id}`);
      notify("Entered due removed.");
      r.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input type="search" placeholder="Student, admission no. or class" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <span className="filter-count">{`${rows.length} shown`}</span>
        <button
          type="button"
          className="btn"
          disabled={!rows.length}
          onClick={() =>
            downloadCsv(
              "previous-year-dues.csv",
              ["Student", "Admission no.", "Class", "Fee", "Note", "Due", "Paid", "Outstanding", "Kind"],
              rows.map((x) => [x.student_name, x.admission_no, x.class_label ?? "", x.fee_head_name, x.note ?? "", x.amount_due, x.amount_paid, x.outstanding, x.kind]),
            )
          }
        >
          <Icon name="download" className="sm" />
          Export
        </button>
        <button type="button" className="btn primary" onClick={() => setEntering(true)}>
          <Icon name="plus" className="sm" />
          Enter previous-year dues
        </button>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Panel flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>Due</th>
                <th>From</th>
                <th className="num">Outstanding</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.fee_id}>
                  <td>
                    {x.student_name}
                    <small className="muted" style={{ display: "block", fontWeight: 500 }}>{`${x.admission_no}${x.is_active ? "" : " · left"}`}</small>
                  </td>
                  <td>{x.class_label ?? "—"}</td>
                  <td className="wrap">
                    {x.kind === "entered" ? x.note ?? x.fee_head_name : `${x.fee_head_name}${x.period === "ONETIME" ? "" : ` · ${x.period}`}`}
                    <small className="muted" style={{ display: "block" }}>{`Due ${date(x.due_date)}${Number(x.amount_paid) ? ` · ${money(x.amount_paid)} paid` : ""}`}</small>
                  </td>
                  <td>
                    <span className={`badge ${x.kind === "entered" ? "blue" : "warn"}`}>{x.kind === "entered" ? "Entered" : "Carried over"}</span>
                  </td>
                  <td className="num">{money(x.outstanding)}</td>
                  <td className="num">
                    <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
                      <Link className="btn primary" href={`${routeOf(158)}?student=${x.student_id}`}>
                        Collect
                      </Link>
                      {x.kind === "entered" && !Number(x.amount_paid) ? (
                        <button type="button" className="btn text" onClick={() => remove(x)}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="table-empty">
                    {d.rows.length ? "No one matches." : "Nothing owed from earlier years. Starting on this system? Enter what students owed from the old register."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
      {entering ? (
        <EnterDues
          onClose={() => setEntering(false)}
          onSaved={() => {
            setEntering(false);
            r.reload();
          }}
        />
      ) : null}
    </>
  );
}

/** Paste rows (admission no., amount, year, note) from a sheet, or type one. */
function EnterDues({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; updated: number; errors: { row: number; error: string }[] } | null>(null);
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, "").trim()))
    // a header row from a sheet is skipped
    .filter((c) => !/admission/i.test(c[0] ?? ""))
    .map(([admission_no, amount, year, note]) => ({ admission_no, amount: (amount ?? "").replace(/[₹\s]/g, ""), year: year || null, note: note || null }));

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!rows.length) {
      setError("Paste or type at least one row.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ added: number; updated: number; errors: { row: number; error: string }[] }>(BASE, { rows });
      setResult(r);
      notify(`${r.added} added, ${r.updated} updated${r.errors.length ? `, ${r.errors.length} not taken` : ""}.`);
      if (!r.errors.length) onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title="Enter previous-year dues"
      onClose={result ? onSaved : onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={result ? onSaved : onClose}>
            {result ? "Done" : "Cancel"}
          </button>
          <button type="submit" className="btn primary" disabled={busy || !rows.length}>
            {busy ? "Saving…" : `Save ${rows.length} row${rows.length === 1 ? "" : "s"}`}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <p className="muted small" style={{ marginBottom: 8 }}>
        One student per line: <strong>admission no., amount, year, note</strong>. Paste straight from Excel or Google Sheets (tab or comma separated). Year and note are optional; the year
        defaults to last year. Entering the same student and year again replaces the amount.
      </p>
      <textarea className="prev-paste" rows={9} value={text} onChange={(e) => setText(e.target.value)} placeholder={"S00001, 5000, 2025-26, Term 3 tuition\nS00002, 1200\nS00007\t3500\t2025-26\tTransport"} />
      <p className="muted small" style={{ marginTop: 6 }}>
        These are an opening balance in the books (owed from before), not this year's income. They're collected on Collect fees like any other fee.
      </p>
      {result ? (
        <div className={`tip ${result.errors.length ? "warn" : ""}`} style={{ marginTop: 10, display: "block" }}>
          <strong>{`${result.added} added · ${result.updated} updated${result.errors.length ? ` · ${result.errors.length} not taken:` : ""}`}</strong>
          {result.errors.length ? (
            <ul style={{ margin: "6px 0 0 18px" }}>
              {result.errors.map((x) => (
                <li key={x.row}>{`Row ${x.row}: ${x.error}`}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
