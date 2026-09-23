"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import type { LeaveBalance, LeaveType } from "./types";
import { Field, KV } from "./ui";

const BASE = "/api/v1/school/hr";

/** "12.00" -> "12", "-1.50" -> "-1.5". */
const days = (v: string | number) => {
  const n = Number(v);
  return Number.isNaN(n) ? String(v) : String(Math.round(n * 100) / 100);
};

/**
 * NEW-061, live: GET /hr/leave-balances?year= (and /hr/leave-types for the
 * filter); PATCH /hr/leave-balances/{id} sets a balance's adjustment, which
 * replaces the previous one: available = allotted + carried forward +
 * adjustment − used.
 */
export function LeaveBalances() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [typeId, setTypeId] = useState("");
  const [typed, setTyped] = useState("");
  const [low, setLow] = useState(false);
  const list = useApi<LeaveBalance[]>(`${BASE}/leave-balances`, { year });
  const types = useApi<LeaveType[]>(`${BASE}/leave-types`);
  const [editing, setEditing] = useState<LeaveBalance | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const all = list.data ?? [];
  const items = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return all.filter((b) => (!typeId || String(b.leave_type_id) === typeId) && (!q || b.user_name.toLowerCase().includes(q)) && (!low || Number(b.available) <= 0));
  }, [all, typeId, typed, low]);

  const ready = list.data !== null;
  const sum = (k: "available" | "used") => all.reduce((s, b) => s + Number(b[k]), 0);
  const people = new Set(all.map((b) => b.user_id)).size;
  const exhausted = all.filter((b) => Number(b.available) <= 0).length;
  const stats = [
    { label: "Staff with balances", value: ready ? String(people) : "…", note: `For ${year}` },
    { label: "Days available", value: ready ? days(sum("available")) : "…", note: "Across every leave type" },
    { label: "Days used", value: ready ? days(sum("used")) : "…", note: "Approved leave this year" },
    { label: "Used up", value: ready ? String(exhausted) : "…", note: "Balances at or below zero" },
  ];

  const rows: Row[] = items.map((b) => [
    b.user_name || `User ${b.user_id}`,
    `${b.leave_type_name}${b.is_paid ? "" : " (unpaid)"}`,
    days(b.allotted),
    days(b.carried_forward),
    Number(b.adjustment) ? `${Number(b.adjustment) > 0 ? "+" : ""}${days(b.adjustment)}${b.note ? ` · ${b.note}` : ""}` : "—",
    days(b.used),
    days(b.available),
  ]);

  const open = (b: LeaveBalance) => {
    setError(null);
    setValue(days(b.adjustment));
    setEditing(b);
  };

  async function save(ev: FormEvent<HTMLFormElement>) {
    if (!editing) return;
    const note = String(new FormData(ev.currentTarget).get("note") ?? "").trim() || null;
    setBusy(true);
    setError(null);
    try {
      await api.patch(`${BASE}/leave-balances/${editing.id}`, { adjustment: value.trim() || "0", note });
      notify(`${editing.leave_type_name} balance for ${editing.user_name} adjusted.`);
      setEditing(null);
      list.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const preview = editing ? Number(editing.allotted) + Number(editing.carried_forward) + (Number(value) || 0) - Number(editing.used) : 0;

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search staff…" aria-label="Search staff" />
        </div>
        <select aria-label="Filter by leave type" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          <option value="">All leave types</option>
          {types.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select aria-label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <label className="row small">
          <input type="checkbox" checked={low} onChange={(e) => setLow(e.target.checked)} /> Only used up
        </label>
      </div>
      <ErrorNote>{editing ? null : list.error}</ErrorNote>
      <Panel
        title={`Leave balances · ${year}`}
        sub={`Per person and leave type${list.loading ? " · Loading…" : ""}`}
        flush
      >
        <DataTable
          columns={["Staff member", "Leave type", "Allotted", "Carried forward", "Adjustment", "Used", "Available"]}
          rows={rows}
          selectable={false}
          actions={(i) => (
            <button type="button" className="btn" onClick={() => open(items[i])}>
              Adjust
            </button>
          )}
          empty={list.loading ? "Loading balances…" : all.length ? "No balance matches these filters." : undefined}
          emptyState={{
            title: "No balances yet",
            note: `Leave for ${year} has not been allotted to staff yet.`,
            action: (
              <Link href={routeOf(180)} className="btn primary">
                <Icon name="calendar" className="sm" />
                Allot leave for a year
              </Link>
            ),
          }}
        />
      </Panel>

      <Dialog
        open={editing !== null}
        title={editing ? `Adjust ${editing.leave_type_name} · ${editing.user_name}` : "Adjust balance"}
        onClose={() => setEditing(null)}
        onSubmit={save}
        actions={
          <>
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              <Icon name="check" className="sm" />
              {busy ? "Saving…" : "Save adjustment"}
            </button>
          </>
        }
      >
        <ErrorNote>{error}</ErrorNote>
        {editing ? (
          <>
            <KV
              rows={[
                ["Allotted", `${days(editing.allotted)} days`],
                ["Carried forward", `${days(editing.carried_forward)} days`],
                ["Used", `${days(editing.used)} days`],
                ["Available after saving", `${days(preview)} days`],
              ]}
            />
            <div className="form-grid">
              <Field label="Adjustment (days)" required>
                <input type="number" required min={-365} max={365} step="0.5" value={value} onChange={(e) => setValue(e.target.value)} />
              </Field>
              <Field label="Reason">
                <input name="note" maxLength={300} defaultValue={editing.note ?? ""} placeholder="e.g. Compensatory off for exam duty" />
              </Field>
            </div>
            <p className="small muted">This replaces the current adjustment; it does not add to it. Use a negative number to take days away.</p>
          </>
        ) : null}
      </Dialog>
    </>
  );
}
