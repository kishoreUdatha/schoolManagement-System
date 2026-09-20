"use client";

import { useEffect, useState } from "react";

import type { Balance } from "@/components/hr/LeaveSetup";
import { api } from "@/lib/api";

/** The signed-in employee's leave entitlement for the current year. */
export function MyLeaveBalances() {
  const [rows, setRows] = useState<Balance[]>([]);

  useEffect(() => {
    api
      .get<Balance[]>("/api/v1/staff/leaves/balances")
      .then((r) => setRows(r.data))
      .catch(() => setRows([]));
  }, []);

  if (rows.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {rows.map((b) => (
        <div key={b.id} className="rounded-md border border-surface-border px-3 py-2 text-sm">
          <div className="text-ink">{b.leave_type_name}</div>
          <div className="text-xs text-ink-subtle">
            <b className="text-ink">{Number(b.available)}</b> left of{" "}
            {Number(b.allotted) + Number(b.carried_forward) + Number(b.adjustment)}
            {Number(b.used) > 0 && ` · ${Number(b.used)} used`}
          </div>
        </div>
      ))}
    </div>
  );
}
