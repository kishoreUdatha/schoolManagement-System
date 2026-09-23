"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { date, initials, money } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { StudentPicker } from "./common";
import type { Ledger } from "./types";

/**
 * SCR-161, live: GET /school/finance/ledger/{student_id} (?id=). Fees and
 * receipts in date order with the server's running balance; nothing here is
 * computed on the page.
 */
export function StudentLedger() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const ledger = useApi<Ledger>(id ? `/api/v1/school/finance/ledger/${id}` : null);

  if (!id) {
    return (
      <section className="panel">
        <div className="panel-pad">
          <p className="muted" style={{ marginBottom: 14 }}>
            Choose a student to open their fee ledger.
          </p>
          <div className="form-grid">
            <StudentPicker value={null} onChange={(s) => s && router.push(`${routeOf(161)}?id=${s.id}`)} />
          </div>
        </div>
      </section>
    );
  }
  if (ledger.loading && !ledger.data) return <Loading what="Loading the ledger…" />;
  const l = ledger.data;
  if (!l) return <ErrorNote>{ledger.error ?? "Student not found."}</ErrorNote>;

  const entries = l.entries.filter((e) => (!kind || e.kind === kind) && (!status || e.status === status));
  const rows: Row[] = entries.map((e) => [
    date(e.on),
    e.kind === "receipt" ? (e.reference ?? "—") : `Fee #${e.fee_id ?? "—"}`,
    `${e.detail}${e.kind === "charge" && e.status && e.status !== "pending" ? ` · ${e.status}` : ""}${e.note ? ` · ${e.note}` : ""}`,
    Number(e.charged) ? money(e.charged) : "—",
    Number(e.paid) ? money(e.paid) : "—",
    money(e.balance),
  ]);
  const owing = Number(l.balance) > 0;
  const lastOn = l.entries.length ? l.entries[l.entries.length - 1].on : null;

  const stats = [
    { label: "Charges", value: money(l.total_charged), note: "Every fee raised" },
    { label: "Payments", value: money(l.total_paid), note: "Recorded receipts" },
    { label: "Waived", value: money(l.total_waived), note: "Fees written off" },
    { label: "Closing balance", value: money(l.balance), note: lastOn ? `As of ${date(lastOn)}` : "No entries yet" },
  ];

  return (
    <>
      <div className="panel profile-banner">
        <div className="profile-hero">
          <div className="row">
            <span className="avatar mint large">{initials(l.student_name)}</span>
            <div>
              <h2>{l.student_name}</h2>
              <p>{`${[l.class_name, l.section_name].filter(Boolean).join(" ") || "No class"} · ${l.admission_no}`}</p>
            </div>
          </div>
          <div className="row">
            <span className={`badge ${owing ? "warn" : ""}`}>{owing ? `${money(l.balance)} outstanding` : "No outstanding balance"}</span>
            {owing ? (
              <Link className="btn primary" href={`${routeOf(158)}?student=${l.student_id}`}>
                <Icon name="money" className="sm" />
                Collect fee
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <select aria-label="Filter entries" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All entries</option>
          <option value="charge">Charges</option>
          <option value="receipt">Receipts</option>
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="waived">Waived</option>
        </select>
        <button type="button" className="btn" onClick={() => router.push(routeOf(161))}>
          <Icon name="users" className="sm" />
          Another student
        </button>
      </div>
      <Panel
        title="Account transactions"
        sub="Amounts in INR · Opening balance ₹0"
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
          empty={kind || status ? "No entries match these filters." : undefined}
          emptyState={{ title: "No transactions yet", note: "Charges and receipts for this student will appear here once fees are raised." }}
        />
      </Panel>
    </>
  );
}
