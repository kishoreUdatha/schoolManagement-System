"use client";

import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date, label, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import type { Loan } from "./types";

/** Where a loan stands, in the words a badge colours. */
function state(l: Loan): string {
  if (l.lost_on) return "Lost";
  // Not "Returned": the badge reads that word as a warning.
  if (l.returned_on) return "Complete";
  if (l.overdue_days > 0) return `Overdue ${l.overdue_days} day${l.overdue_days === 1 ? "" : "s"}`;
  return "Issued";
}

/** The fine owed or accruing on a loan, "—" when none. */
function fine(l: Loan): string {
  const accruing = Number(l.accruing_fine);
  if (!l.returned_on && !l.lost_on && accruing > 0) return `${money(accruing)} if returned today`;
  const owed = Number(l.fine_amount);
  if (owed > 0) return `${money(owed)} · ${label(l.fine_status)}`;
  return "—";
}

/**
 * NEW-093, live: GET /staff/library, the books the signed-in employee has
 * borrowed (last 100 loans, newest first). Issue, return and renew happen at
 * the library desk, so this screen only reads.
 */
export function MyLibraryLoans() {
  const loans = useApi<Loan[]>("/api/v1/staff/library");
  const [show, setShow] = useState("open");
  const [search, setSearch] = useState("");

  const all = useMemo(() => loans.data ?? [], [loans.data]);
  const open = all.filter((l) => !l.returned_on && !l.lost_on);
  const overdue = open.filter((l) => l.overdue_days > 0);
  const q = search.trim().toLowerCase();
  const items = all
    .filter((l) => (show === "open" ? !l.returned_on && !l.lost_on : show === "overdue" ? !l.returned_on && !l.lost_on && l.overdue_days > 0 : true))
    .filter((l) => !q || `${l.title} ${l.accession_no}`.toLowerCase().includes(q));
  const soonest = [...open].sort((a, b) => a.due_on.localeCompare(b.due_on))[0];
  const owed = all.reduce((n, l) => n + (l.fine_status === "pending" ? Number(l.fine_amount) : 0) + (!l.returned_on && !l.lost_on ? Number(l.accruing_fine) : 0), 0);

  const ready = loans.data !== null;
  const stats = [
    { label: "Books with me", value: ready ? String(open.length) : "…", note: "Not yet returned" },
    { label: "Overdue", value: ready ? String(overdue.length) : "…", note: "Past the due date" },
    { label: "Next due", value: ready ? (soonest ? date(soonest.due_on) : "—") : "…", note: soonest ? soonest.title : "Nothing due" },
    { label: "Fines", value: ready ? money(owed) : "…", note: "Unpaid and accruing" },
  ];

  const rows: Row[] = items.map((l) => [
    l.title,
    l.accession_no,
    date(l.issued_on),
    date(l.due_on),
    l.returned_on ? date(l.returned_on) : l.lost_on ? `Lost ${date(l.lost_on)}` : "—",
    l.renew_count ? String(l.renew_count) : "—",
    fine(l),
    state(l),
  ]);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or accession no…" aria-label="Search loans" />
        </div>
        <select aria-label="Show" value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="open">With me now</option>
          <option value="overdue">Overdue</option>
          <option value="all">All loans</option>
        </select>
      </div>
      <ErrorNote>{loans.error}</ErrorNote>
      <Panel title="My library loans" sub={`Books issued to you at the library desk${loans.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Title", "Accession no", "Issued", "Due", "Returned", "Renewed", "Fine", "Status"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          empty={loans.loading ? "Loading…" : all.length ? (show === "open" ? "You have returned every book." : "No loan matches these filters.") : undefined}
          emptyState={{ title: "No library loans yet", note: "Books issued to you at the library desk will appear here." }}
        />
      </Panel>
    </>
  );
}
