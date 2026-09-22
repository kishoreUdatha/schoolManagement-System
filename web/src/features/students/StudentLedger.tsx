"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { date, label, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { saveCsv } from "./files";
import { StudentFrame, today } from "./StudentFrame";
import type { Ledger } from "./records";
import type { StudentProfile } from "./types";

/** SCR-062, live: GET /finance/ledger/{id} (charges, receipts, waivers, running balance). */
export function StudentLedger() {
  return <StudentFrame active={62}>{(s) => <LedgerBody s={s} />}</StudentFrame>;
}

/** The screen's content under the banner; the profile's tab renders it too. */
export function LedgerBody({ s }: { s: StudentProfile }) {
  const ledger = useApi<Ledger>(`/api/v1/school/finance/ledger/${s.id}`);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const l = ledger.data;
  const entries = (l?.entries ?? []).filter((e) => (!kind || e.kind === kind) && (!status || e.status === status));
  const kinds = Array.from(new Set(l?.entries.map((e) => e.kind) ?? []));
  const statuses = Array.from(new Set(l?.entries.map((e) => e.status).filter((x): x is string => !!x) ?? []));

  const stats = [
    { label: "Charges", value: l ? money(l.total_charged) : "…", note: "All periods" },
    { label: "Payments", value: l ? money(l.total_paid) : "…", note: "Recorded receipts" },
    { label: "Concessions", value: l ? money(l.total_waived) : "…", note: "Waived" },
    { label: "Closing balance", value: l ? money(l.balance) : "…", note: `As of ${date(today())}` },
  ];

  const rows: Row[] = entries.map((e) => [
    date(e.on),
    e.reference ?? (e.fee_id ? `Fee #${e.fee_id}` : "—"),
    e.detail,
    e.charged ? money(e.charged) : "—",
    e.paid ? money(e.paid) : "—",
    money(e.balance),
  ]);

  function exportCsv() {
    saveCsv(
      `ledger-${s.admission_no}.csv`,
      ["Date", "Kind", "Reference", "Description", "Debit", "Credit", "Balance", "Status"],
      entries.map((e) => [e.on, e.kind, e.reference, e.detail, e.charged, e.paid, e.balance, e.status]),
    );
  }

  return (
    <>
      <ErrorNote>{ledger.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <select aria-label="Filter entry type" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All entries</option>
          {kinds.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {statuses.map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={exportCsv} disabled={!entries.length}>
          <Icon name="download" className="sm" />
          Export
        </button>
      </div>
      <Panel
        title="Account transactions"
        sub={`Amounts in INR · ${l && l.balance > 0 ? `${money(l.balance)} outstanding` : "No outstanding balance"}`}
        action={
          <button type="button" className="btn" onClick={() => window.print()}>
            <Icon name="download" className="sm" />
            Print ledger
          </button>
        }
        flush
      >
        <DataTable
          columns={["Date", "Reference", "Description", "Debit", "Credit", "Balance"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          empty={ledger.loading ? "Loading the ledger…" : "No fee has been charged to this student yet."}
        />
      </Panel>
    </>
  );
}

/** "Collect fee", carrying the student. */
export function CollectFeeLink() {
  const id = useSearchParams().get("id");
  return (
    <Link href={id ? `/fees-finance/fee-collection?id=${id}` : "/fees-finance/fee-collection"} className="btn primary">
      <Icon name="arrow" className="sm" />
      Collect fee
    </Link>
  );
}
