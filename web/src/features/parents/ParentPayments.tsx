"use client";

import { useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText, type Paginated } from "@/lib/api";
import { date, initials, label, money } from "@/lib/format";
import { childNames, PICK_PARENT, useParent } from "./ParentShell";
import type { Receipt, StudentFee } from "./types";

const today = () => new Date().toISOString().slice(0, 10);
/** Collections default to this month server-side; a family history needs an explicit, wide window. */
const fiveYearsBack = () => `${new Date().getFullYear() - 5}-04-01`;

/**
 * SCR-078, live, across all of a parent's children: GET /parents/{id}, then per
 * child GET /fees/student-fees?student_id= (charges, waivers, balance) and
 * GET /accounts/collections?student_id=&from=&to= (receipts).
 */
export function ParentPayments() {
  const { id, data: p, error, loading } = useParent();
  const [child, setChild] = useState("");
  const [from, setFrom] = useState(fiveYearsBack);
  const [fees, setFees] = useState<StudentFee[] | null>(null);
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const childKey = p?.children.map((c) => c.student_id).join(",");
  useEffect(() => {
    if (!p) return;
    let live = true;
    setFees(null);
    setReceipts(null);
    Promise.all(
      p.children.map((c) =>
        Promise.all([
          api.get<Paginated<StudentFee>>("/api/v1/school/fees/student-fees", { student_id: c.student_id, page_size: 200 }),
          api.get<Receipt[]>("/api/v1/school/accounts/collections", { student_id: c.student_id, from, to: today() }),
        ]),
      ),
    )
      .then((per) => {
        if (!live) return;
        setFees(per.flatMap(([f]) => f.items));
        setReceipts(per.flatMap(([, r]) => r).sort((a, b) => b.collected_on.localeCompare(a.collected_on)));
        setFailed(null);
      })
      .catch((e) => live && setFailed(errorText(e)));
    return () => {
      live = false;
    };
    // childKey captures the children
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childKey, from]);

  if (!id) return <PickFirst {...PICK_PARENT} />;
  if (loading && !p) return <Loading what="Loading the parent…" />;
  if (!p) return <ErrorNote>{error ?? "Parent not found."}</ErrorNote>;

  const mine = <T extends { student_id: number }>(xs: T[] | null) => (xs ?? []).filter((x) => !child || String(x.student_id) === child);
  const f = mine(fees);
  const r = mine(receipts);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const charges = sum(f.map((x) => Number(x.amount_due)));
  const paid = sum(r.map((x) => Number(x.amount)));
  const waived = sum(f.filter((x) => x.status === "waived").map((x) => Number(x.amount_due) - Number(x.amount_paid)));
  const balance = sum(f.filter((x) => x.status === "pending").map((x) => Number(x.amount_outstanding)));
  const overdue = f.filter((x) => x.is_overdue).length;
  const ready = fees !== null && receipts !== null;
  const v = (n: number) => (ready ? money(n) : "…");

  const stats = [
    { label: "Charges", value: v(charges), note: "All fees raised" },
    { label: "Payments", value: v(paid), note: `Receipts since ${date(from)}` },
    { label: "Concessions", value: v(waived), note: "Waived" },
    { label: "Closing balance", value: v(balance), note: overdue ? `${overdue} overdue` : `As of ${date(today())}` },
  ];

  const admissionOf = new Map(p.children.map((c) => [c.student_id, c.admission_no]));
  const rows: Row[] = r.map((x) => [
    date(x.collected_on),
    x.receipt_no,
    { name: x.student_name, sub: admissionOf.get(x.student_id) },
    `${x.fee_head_name} · ${x.period}`,
    money(x.amount),
    `Paid · ${label(x.mode)}`,
  ]);

  return (
    <>
      <div className="panel profile-banner">
        <div className="profile-hero">
          <div className="row">
            <span className="avatar mint large">{initials(p.full_name)}</span>
            <div>
              <h2>{p.full_name}</h2>
              <p>{`${childNames(p) ? `Parent of ${childNames(p)}` : "No children linked"} · ${p.children.map((c) => c.section_label ?? "—").join(", ")}`}</p>
            </div>
          </div>
          <Badge>{!ready ? "Loading…" : balance > 0 ? `${money(balance)} outstanding` : "No outstanding balance"}</Badge>
        </div>
      </div>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <select aria-label="Filter by child" value={child} onChange={(e) => setChild(e.target.value)}>
          <option value="">All children</option>
          {p.children.map((c) => (
            <option key={c.student_id} value={c.student_id}>
              {c.full_name}
            </option>
          ))}
        </select>
        <label className="btn">
          <Icon name="calendar" className="sm" />
          <span>From</span>
          <input type="date" value={from} max={today()} onChange={(e) => e.target.value && setFrom(e.target.value)} aria-label="Receipts from" style={{ border: 0, background: "transparent", font: "inherit" }} />
        </label>
      </div>
      <ErrorNote>{failed}</ErrorNote>
      <Panel title="Account transactions" sub={`Amounts in INR · Receipts from ${date(from)} to ${date(today())}`} flush>
        <DataTable
          columns={["Date", "Receipt", "Student", "Description", "Amount", "Status"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          empty={ready ? "No payments recorded in this period." : "Loading payments…"}
        />
      </Panel>
    </>
  );
}
