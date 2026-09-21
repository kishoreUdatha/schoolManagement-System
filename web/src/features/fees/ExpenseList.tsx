"use client";

import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Dialog, Field, isoToday, MODES, modeLabel, monthStart, sum } from "./common";
import { DateRange } from "./IncomeList";
import type { Expense, ExpenseCategory, Supplier } from "./types";

/**
 * SCR-167, live: GET /school/accounts/expenses?from=&to=&category_id=,
 * POST to record one, POST /{id}/void with a reason. Categories from
 * /accounts/expense-categories, suppliers from /inventory/suppliers.
 */
export function ExpenseList() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoToday());
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Expense | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cats = useApi<ExpenseCategory[]>("/api/v1/school/accounts/expense-categories");
  const suppliers = useApi<Supplier[]>("/api/v1/school/inventory/suppliers");
  const list = useApi<Expense[]>("/api/v1/school/accounts/expenses", { from, to, category_id: categoryId });

  const items = (list.data ?? []).filter((x) => {
    const term = q.trim().toLowerCase();
    if (term && !`${x.description} ${x.payee_name ?? ""} ${x.reference ?? ""} ${x.category_name}`.toLowerCase().includes(term)) return false;
    if (status === "valid" && x.is_void) return false;
    if (status === "void" && !x.is_void) return false;
    return true;
  });
  // Whole range from the server, so this is the range's total.
  const total = sum((list.data ?? []).filter((x) => !x.is_void).map((x) => Number(x.amount) + Number(x.tax_amount)));
  const rows: Row[] = items.map((x) => [date(x.spent_on), x.reference ?? `EXP-${x.id}`, x.category_name, x.payee_name ?? "—", money(Number(x.amount) + Number(x.tax_amount)), x.is_void ? "Void" : "Paid"]);

  async function voidIt(x: Expense) {
    const reason = window.prompt("Why is this expense being voided?");
    if (!reason) return;
    setError(null);
    try {
      await api.post(`/api/v1/school/accounts/expenses/${x.id}/void`, { reason: reason.trim() });
      notify("Expense voided.");
      setOpen(null);
      list.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <>
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search expenses…" aria-label="Search records" />
        </div>
        <select aria-label="Filter by category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {cats.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="valid">Paid</option>
          <option value="void">Void</option>
        </select>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <button type="button" className="btn primary" onClick={() => setAdding(true)}>
          <Icon name="plus" className="sm" />
          Add expense
        </button>
      </div>
      <ErrorNote>{error ?? list.error}</ErrorNote>
      <Panel title="All records" sub={`${date(from)} – ${date(to)} · ${money(total)} spent incl. tax, excluding void${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Date", "Voucher", "Expense head", "Payee", "Amount", "Status"]}
          rows={rows}
          onView={(i) => setOpen(items[i])}
          empty={list.loading ? "Loading expenses…" : "No expenses recorded in this range."}
        />
      </Panel>
      {open ? (
        <Dialog title={open.description} onClose={() => setOpen(null)}>
          <dl className="kv">
            <div>
              <dt>Category</dt>
              <dd>{open.category_name}</dd>
            </div>
            <div>
              <dt>Payee</dt>
              <dd>{open.payee_name ?? "—"}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{`${money(open.amount)} + ${money(open.tax_amount)} tax`}</dd>
            </div>
            <div>
              <dt>Paid on</dt>
              <dd>{`${date(open.spent_on)} · ${modeLabel(open.mode)}${open.reference ? ` · ${open.reference}` : ""}`}</dd>
            </div>
            <div>
              <dt>Recorded by</dt>
              <dd>{open.recorded_by_name ?? "—"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{open.is_void ? `Void · ${open.void_reason ?? ""}` : "Paid"}</dd>
            </div>
          </dl>
          <div className="row actions">
            <button type="button" className="btn" onClick={() => setOpen(null)}>
              Close
            </button>
            {!open.is_void ? (
              <button type="button" className="btn danger" onClick={() => voidIt(open)}>
                Void expense
              </button>
            ) : null}
          </div>
        </Dialog>
      ) : null}
      {adding ? (
        <NewExpense
          cats={(cats.data ?? []).filter((c) => c.is_active)}
          suppliers={(suppliers.data ?? []).filter((s) => s.is_active)}
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

function NewExpense({ cats, suppliers, onClose, onSaved }: { cats: ExpenseCategory[]; suppliers: Supplier[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ spent_on: isoToday(), category_id: "", supplier_id: "", payee: "", amount: "", tax_amount: "", mode: "bank_transfer", reference: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const t = (v: string) => v.trim() || null;
    try {
      await api.post("/api/v1/school/accounts/expenses", {
        spent_on: f.spent_on,
        category_id: Number(f.category_id),
        supplier_id: f.supplier_id ? Number(f.supplier_id) : null,
        payee: t(f.payee),
        amount: f.amount,
        tax_amount: f.tax_amount || "0",
        mode: f.mode,
        reference: t(f.reference),
        description: f.description.trim(),
      });
      notify("Expense recorded.");
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title="Add expense" onClose={onClose}>
      <form onSubmit={save}>
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <Field label="Date" required>
            <input type="date" value={f.spent_on} max={isoToday()} onChange={set("spent_on")} required />
          </Field>
          <Field label="Category" required>
            <select value={f.category_id} onChange={set("category_id")} required>
              <option value="">Select category</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Supplier">
            <select value={f.supplier_id} onChange={set("supplier_id")}>
              <option value="">None</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Payee">
            <input value={f.payee} onChange={set("payee")} maxLength={160} placeholder={f.supplier_id ? "The supplier" : "Who was paid"} />
          </Field>
          <Field label="Amount (₹)" required>
            <input type="number" min={0.01} step="0.01" value={f.amount} onChange={set("amount")} required />
          </Field>
          <Field label="Tax (₹)">
            <input type="number" min={0} step="0.01" value={f.tax_amount} onChange={set("tax_amount")} placeholder="0" />
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
          <Field label="Description" required full>
            <input value={f.description} onChange={set("description")} minLength={2} maxLength={300} required />
          </Field>
        </div>
        <div className="row actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Record expense"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
