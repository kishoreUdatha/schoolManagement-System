"use client";

import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Dialog, Field, isoToday, MODES, modeLabel, monthStart, sum } from "./common";
import type { Income } from "./types";

import { ask } from "@/lib/dialog";
const SOURCES = ["donation", "rent", "grant", "interest", "sponsorship", "other"];

/** From/to date inputs shared by the income, expense and cash-book screens. */
export function DateRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <>
      <input type="date" aria-label="From date" value={from} max={to} onChange={(e) => e.target.value && onFrom(e.target.value)} />
      <input type="date" aria-label="To date" value={to} min={from} onChange={(e) => e.target.value && onTo(e.target.value)} />
    </>
  );
}

/**
 * SCR-166, live: GET /school/accounts/income?from=&to= (income other than
 * fees: donations, rent, grants…), POST to record one (a receipt number is
 * issued), POST /{id}/void to cancel it. Fee receipts are on SCR-170.
 */
export function IncomeList() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoToday());
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Income | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = useApi<Income[]>("/api/v1/school/accounts/income", { from, to });

  const items = (list.data ?? []).filter((x) => {
    const term = q.trim().toLowerCase();
    if (term && !`${x.payer} ${x.receipt_no} ${x.reference ?? ""}`.toLowerCase().includes(term)) return false;
    if (source && x.source !== source) return false;
    if (status === "valid" && x.is_void) return false;
    if (status === "void" && !x.is_void) return false;
    return true;
  });
  // The API returns the whole range, so this total is the range's, not a page's.
  const total = sum((list.data ?? []).filter((x) => !x.is_void).map((x) => x.amount));
  const valid = (list.data ?? []).filter((x) => !x.is_void);
  const n = (v: number) => (list.data ? v.toLocaleString("en-IN") : "…");
  const stats = [
    { label: "Received", value: list.data ? money(total) : "…", note: `${date(from)} – ${date(to)}` },
    { label: "Receipts", value: n(valid.length), note: "Income other than fees" },
    { label: "Donations", value: list.data ? money(sum(valid.filter((x) => x.source === "donation").map((x) => x.amount))) : "…", note: "In this range" },
    { label: "Void", value: n((list.data ?? []).length - valid.length), note: "Cancelled, not counted" },
  ];
  const rows: Row[] = items.map((x) => [date(x.received_on), x.receipt_no, label(x.source), x.payer, money(x.amount), modeLabel(x.mode), x.is_void ? "Void" : "Received"]);

  async function voidIt(x: Income) {
    if (!(await ask(`Void receipt ${x.receipt_no} for ${money(x.amount)}? It stays on record, marked void.`))) return;
    setError(null);
    try {
      await api.post(`/api/v1/school/accounts/income/${x.id}/void`);
      notify("Income voided.");
      setOpen(null);
      list.reload();
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search income…" aria-label="Search records" />
        </div>
        <select aria-label="Filter by source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {label(s)}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="valid">Received</option>
          <option value="void">Void</option>
        </select>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <button type="button" className="btn primary" onClick={() => setAdding(true)}>
          <Icon name="plus" className="sm" />
          Record income
        </button>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <Panel title="All records" sub={`${date(from)} – ${date(to)} · ${money(total)} received, excluding void${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Date", "Reference", "Income head", "Received from", "Amount", "Payment method", "Status"]}
          rows={rows}
          onView={(i) => setOpen(items[i])}
          empty={list.loading ? "Loading income…" : "No income recorded in this range."}
        />
      </Panel>
      {open ? (
        <Dialog title={`Receipt ${open.receipt_no}`} onClose={() => setOpen(null)}>
          <dl className="kv">
            <div>
              <dt>Received from</dt>
              <dd>{open.payer}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{label(open.source)}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{money(open.amount)}</dd>
            </div>
            <div>
              <dt>Received on</dt>
              <dd>{`${date(open.received_on)} · ${modeLabel(open.mode)}${open.reference ? ` · ${open.reference}` : ""}`}</dd>
            </div>
            <div>
              <dt>Notes</dt>
              <dd>{open.notes ?? "—"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{open.is_void ? "Void" : "Received"}</dd>
            </div>
          </dl>
          <div className="row actions">
            <button type="button" className="btn" onClick={() => setOpen(null)}>
              Close
            </button>
            {!open.is_void ? (
              <button type="button" className="btn danger" onClick={() => voidIt(open)}>
                Void receipt
              </button>
            ) : null}
          </div>
        </Dialog>
      ) : null}
      {adding ? (
        <NewIncome
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}

function NewIncome({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ received_on: isoToday(), source: "donation", payer: "", amount: "", mode: "bank_transfer", reference: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<Income>("/api/v1/school/accounts/income", { ...f, payer: f.payer.trim(), reference: f.reference.trim() || null, notes: f.notes.trim() || null });
      notify(`Receipt ${r.receipt_no} issued.`);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title="Record income" onClose={onClose}>
      <form onSubmit={save}>
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <Field label="Date" required>
            <input type="date" value={f.received_on} max={isoToday()} onChange={set("received_on")} required />
          </Field>
          <Field label="Source" required>
            <select value={f.source} onChange={set("source")}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Received from" required>
            <input value={f.payer} onChange={set("payer")} minLength={2} maxLength={160} required />
          </Field>
          <Field label="Amount (₹)" required>
            <input type="number" min={0.01} step="0.01" value={f.amount} onChange={set("amount")} required />
          </Field>
          <Field label="Payment method" required>
            <select value={f.mode} onChange={set("mode")}>
              {MODES.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reference">
            <input value={f.reference} onChange={set("reference")} maxLength={120} />
          </Field>
          <Field label="Notes" full>
            <textarea value={f.notes} onChange={set("notes")} maxLength={300} />
          </Field>
        </div>
        <div className="row actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Issue receipt"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
