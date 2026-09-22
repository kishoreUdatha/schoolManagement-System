"use client";

import { useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { saveCsv } from "./files";
import { StudentFrame } from "./StudentFrame";
import type { Loan } from "./records";
import type { StudentProfile } from "./types";

/** SCR-067, live: GET /library/loans?student_id=&open_only=false (every loan, open and returned). */
export function StudentLibrary() {
  return <StudentFrame active={67}>{(s) => <Body s={s} />}</StudentFrame>;
}

function statusOf(l: Loan) {
  if (l.lost_on) return "Lost";
  if (l.returned_on) return "Returned";
  if (l.overdue_days > 0) return "Overdue";
  return "Issued";
}

function Body({ s }: { s: StudentProfile }) {
  const loans = useApi<Loan[]>("/api/v1/school/library/loans", { student_id: s.id, open_only: false });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const all = loans.data ?? [];
  const list = all.filter((l) => (!q || `${l.title} ${l.accession_no}`.toLowerCase().includes(q.toLowerCase())) && (!status || statusOf(l) === status));
  const open = all.filter((l) => !l.returned_on && !l.lost_on).length;
  const fines = all.reduce((n, l) => n + Number(l.fine_amount || 0) + Number(l.accruing_fine || 0), 0);

  const wait = loans.loading && !loans.data;
  const n = (v: number) => (wait ? "…" : String(v));
  const stats = [
    { label: "On loan", value: n(open), note: "Books with the student now" },
    { label: "Overdue", value: n(all.filter((l) => statusOf(l) === "Overdue").length), note: "Past the due date" },
    { label: "Borrowed", value: n(all.length), note: `${all.filter((l) => l.lost_on).length} lost` },
    { label: "Fines", value: wait ? "…" : money(fines), note: "Charged and still accruing" },
  ];

  const rows: Row[] = list.map((l) => [l.title, l.accession_no, date(l.issued_on), date(l.due_on), String(l.renew_count), statusOf(l)]);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search student library…" aria-label="Search loans" />
        </div>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["Issued", "Overdue", "Returned", "Lost"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          disabled={!list.length}
          onClick={() =>
            saveCsv(
              `library-${s.admission_no}.csv`,
              ["Book", "Copy no.", "Issued on", "Due date", "Returned on", "Renewals", "Status", "Fine"],
              list.map((l) => [l.title, l.accession_no, l.issued_on, l.due_on, l.returned_on, l.renew_count, statusOf(l), l.fine_amount]),
            )
          }
        >
          <Icon name="download" className="sm" />
          Export
        </button>
      </div>
      <ErrorNote>{loans.error}</ErrorNote>
      <Panel title="All loans" sub={loans.data ? `${open} on loan now · ${fines > 0 ? `${money(fines)} in fines` : "No fines"}` : "Loading…"} flush>
        <DataTable
          columns={["Book", "Copy no.", "Issued on", "Due date", "Renewals", "Status"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          empty={loans.loading ? "Loading loans…" : all.length ? "No loans match these filters." : "This student has not borrowed any books yet."}
        />
      </Panel>
    </>
  );
}
