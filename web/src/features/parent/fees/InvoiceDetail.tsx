"use client";

/*
 * PM-024 · Invoice detail: the child's payable fee lines, under their
 * invoice numbers (one invoice per fee period), with late fees as their own
 * lines. The parent may pay all of them or pick some (the school's
 * instalments are the separate fee periods); amounts are the school's and
 * are not editable here.
 */

import { useEffect, useMemo, useState } from "react";
import { useParent } from "@/components/parent/ParentShell";
import { date, money } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { BAD_STATUS, PmEmpty, PmError, PmLoading, useGoTo } from "../comms/ui";
import { feeName, feesPath, payableFees, sum, type StudentFee } from "./common";

export function InvoiceDetail() {
  const { childId } = useParent();
  const goTo = useGoTo();
  const fees = useApi<StudentFee[]>(childId ? feesPath(childId) : null);
  const payable = useMemo(() => payableFees(fees.data, childId), [fees.data, childId]);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  // Everything payable is selected to start with, as "Pay total" on the fees screen promised.
  useEffect(() => setPicked(new Set(payable.map((f) => f.id))), [payable]);

  if (!childId || fees.loading) return <PmLoading />;
  if (fees.error) return <PmError>{fees.error}</PmError>;
  if (!payable.length) return <PmEmpty title="Nothing to pay">There are no outstanding fees for this child.</PmEmpty>;

  const chosen = payable.filter((f) => picked.has(f.id));
  const regular = payable.filter((f) => !f.is_late_fee);
  const late = payable.filter((f) => f.is_late_fee);
  const invoices = Array.from(new Set(payable.map((f) => f.invoice_no).filter((n): n is string => Boolean(n))));
  const overdue = payable.some((f) => f.is_overdue);
  const toggle = (id: number) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  return (
    <>
      {overdue ? (
        <span className="status" style={BAD_STATUS}>
          Overdue
        </span>
      ) : (
        <span className="status amber">Due</span>
      )}
      <h2>Outstanding fees</h2>
      <p>
        {invoices.length ? `Invoice ${invoices.join(", ")} · ` : ""}
        {`${payable.length} fee ${payable.length === 1 ? "line" : "lines"} · choose what to pay now`}
      </p>
      <dl>
        {regular.map((f) => (
          <FeeLine key={f.id} f={f} checked={picked.has(f.id)} onToggle={() => toggle(f.id)} />
        ))}
        {late.map((f) => (
          <FeeLine key={f.id} f={f} checked={picked.has(f.id)} onToggle={() => toggle(f.id)} lateFor={payable.find((x) => x.id === f.source_id) ?? null} />
        ))}
        {late.length ? (
          <>
            <div>
              <dt>Fees</dt>
              <dd>{money(sum(chosen.filter((f) => !f.is_late_fee)))}</dd>
            </div>
            <div>
              <dt>Late fee</dt>
              <dd>{money(sum(chosen.filter((f) => f.is_late_fee)))}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>Total payable</dt>
          <dd>{money(sum(chosen))}</dd>
        </div>
        <div>
          <dt>Due date</dt>
          <dd>{chosen.length ? date(chosen[0].due_date) : "—"}</dd>
        </div>
      </dl>
      <div className="panel soft">
        <p>The school controls fee amounts, concessions and payment options.</p>
      </div>
      <button className="action" disabled={!chosen.length} onClick={() => goTo(25, { fees: chosen.map((f) => f.id).join(",") })}>
        Continue to payment
      </button>
    </>
  );
}

function FeeLine({ f, checked, onToggle, lateFor }: { f: StudentFee; checked: boolean; onToggle: () => void; lateFor?: StudentFee | null }) {
  const name = f.is_late_fee ? `Late fee · ${lateFor ? feeName(lateFor) : feeName(f)}` : feeName(f);
  return (
    <div>
      <dt>
        <label className="row" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Pay ${name}`} />
          <span>
            {name}
            <small style={{ display: "block" }}>
              {f.is_late_fee
                ? (f.notes ?? `Added ${date(f.due_date)}`)
                : `Due ${date(f.due_date)}${f.is_overdue ? " · overdue" : ""}${Number(f.amount_paid) > 0 ? ` · ${money(f.amount_paid)} paid` : ""}`}
            </small>
          </span>
        </label>
      </dt>
      <dd>{money(f.amount_outstanding)}</dd>
    </div>
  );
}
