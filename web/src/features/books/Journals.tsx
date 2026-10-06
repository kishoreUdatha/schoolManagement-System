"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, type FormEvent } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { askText } from "@/lib/dialog";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Dialog, Field, isoToday } from "@/features/fees/common";
import { AccountSelect, amt, BOOKS, fyStart, KIND_LABEL, KINDS, Period, useOpenOnYear } from "./common";
import type { Account, Journal } from "./types";

type Line = { account_id: number | ""; debit: string; credit: string; note: string };
const blank = (): Line => ({ account_id: "", debit: "", credit: "", note: "" });
const n = (v: string) => Math.round((Number(v) || 0) * 100);

/** NEW-1052: journal vouchers — opening balances, bank transfers, depreciation, corrections. */
export function JournalVouchers() {
  const params = useSearchParams();
  const router = useRouter();
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(isoToday());
  const [adding, setAdding] = useState(false);
  useOpenOnYear(useCallback((f: string, t: string) => (setFrom(f), setTo(t)), []));
  const openId = Number(params.get("id")) || null;
  const list = useApi<Journal[]>(`${BOOKS}/journals`, { from, to });
  const accounts = useApi<Account[]>(`${BOOKS}/accounts`);
  const one = useApi<Journal>(openId && !list.data?.some((j) => j.id === openId) ? `${BOOKS}/journals/${openId}` : null);
  const open = list.data?.find((j) => j.id === openId) ?? one.data ?? null;
  const rows = list.data ?? [];

  const show = (id: number | null) => router.replace(`${routeOf(1052)}${id ? `?id=${id}` : ""}`);

  async function voidIt(j: Journal) {
    const reason = await askText(`Void ${j.entry_no}? It stays on record, marked void, and leaves the books.`, { required: true, placeholder: "Why is it being voided?" });
    if (!reason) return;
    try {
      await api.post(`${BOOKS}/journals/${j.id}/void`, { reason });
      notify(`${j.entry_no} voided.`);
      list.reload();
      one.reload();
    } catch (e) {
      notify(errorText(e));
    }
  }

  return (
    <>
      <div className="filterbar spread">
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <Period from={from} to={to} onChange={(f, t) => (setFrom(f), setTo(t))} />
        </div>
        <button type="button" className="btn primary" onClick={() => setAdding(true)}>
          <Icon name="plus" className="sm" />
          New journal voucher
        </button>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel title="Journal vouchers" sub="Fees, receipts, expenses, bills and payroll post themselves. Use a voucher for anything else: opening balances, cash deposited in the bank, depreciation, corrections." flush>
        <DataTable
          columns={["Voucher", "Date", "Narration", "Accounts", "Amount", "Status"]}
          rows={rows.map((j) => [
            j.entry_no,
            date(j.entry_date),
            { text: j.narration, note: j.reference ?? undefined },
            j.lines.map((l) => `${Number(l.debit) ? "Dr" : "Cr"} ${l.account_name}`).join(", "),
            money(j.total),
            j.is_void ? { text: "Void", tone: "bad" } : "Posted",
          ])}
          onView={(i) => show(rows[i].id)}
          empty={list.loading ? "Loading…" : "No journal vouchers in this period."}
        />
      </Panel>
      {open ? (
        <Dialog title={`${open.entry_no} · ${date(open.entry_date)}`} onClose={() => show(null)}>
          <p>{open.narration}</p>
          {open.reference ? <p className="muted small">{`Reference: ${open.reference}`}</p> : null}
          <div className="table-wrap" style={{ margin: "12px 0" }}>
            <table className="data-table books-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="right">Debit</th>
                  <th className="right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {open.lines.map((l, i) => (
                  <tr key={i}>
                    <td className={Number(l.credit) ? "books-cr" : ""}>
                      {`${l.account_code} · ${l.account_name}`}
                      {l.note ? <small className="muted" style={{ display: "block" }}>{l.note}</small> : null}
                    </td>
                    <td className="right mono">{amt(l.debit)}</td>
                    <td className="right mono">{amt(l.credit)}</td>
                  </tr>
                ))}
                <tr className="books-total">
                  <td>Total</td>
                  <td className="right mono">{money(open.total)}</td>
                  <td className="right mono">{money(open.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted small">
            {`Entered${open.created_by_name ? ` by ${open.created_by_name}` : ""}.`}
            {open.is_void ? ` Void: ${open.void_reason ?? ""}` : ""}
          </p>
          <div className="row actions">
            <button type="button" className="btn" onClick={() => show(null)}>
              Close
            </button>
            {!open.is_void ? (
              <button type="button" className="btn danger" onClick={() => voidIt(open)}>
                Void voucher
              </button>
            ) : null}
          </div>
        </Dialog>
      ) : null}
      {adding ? (
        <NewJournal
          accounts={accounts.data ?? []}
          onClose={() => setAdding(false)}
          onSaved={(j) => {
            setAdding(false);
            list.reload();
            notify(`${j.entry_no} posted.`);
          }}
        />
      ) : null}
    </>
  );
}

function NewJournal({ accounts, onClose, onSaved }: { accounts: Account[]; onClose: () => void; onSaved: (j: Journal) => void }) {
  const [entryDate, setEntryDate] = useState(isoToday());
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dr = lines.reduce((s, l) => s + n(l.debit), 0);
  const cr = lines.reduce((s, l) => s + n(l.credit), 0);
  const diff = dr - cr;
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save(e: FormEvent) {
    e.preventDefault();
    const used = lines.filter((l) => l.account_id !== "" || n(l.debit) || n(l.credit));
    if (used.some((l) => l.account_id === "")) return setError("Choose an account on every line with an amount.");
    if (used.some((l) => !n(l.debit) === !n(l.credit))) return setError("Each line takes either a debit or a credit.");
    if (diff) return setError(`Debits and credits differ by ${money(Math.abs(diff) / 100)}.`);
    setSaving(true);
    setError(null);
    try {
      const j = await api.post<Journal>(`${BOOKS}/journals`, {
        entry_date: entryDate,
        narration: narration.trim(),
        reference: reference.trim() || null,
        lines: used.map((l) => ({ account_id: l.account_id, debit: l.debit || "0", credit: l.credit || "0", note: l.note.trim() || null })),
      });
      onSaved(j);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title="New journal voucher" onClose={onClose}>
      <form onSubmit={save}>
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <Field label="Date" required>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
          </Field>
          <Field label="Reference">
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="Bank slip, board resolution…" />
          </Field>
          <Field label="Narration" required full>
            <input value={narration} onChange={(e) => setNarration(e.target.value)} minLength={3} maxLength={300} required placeholder="Opening balances as on 1 April" />
          </Field>
        </div>
        <div className="journal-lines">
          <div className="journal-line journal-line-head small muted">
            <span>Account</span>
            <span>Debit (₹)</span>
            <span>Credit (₹)</span>
            <span />
          </div>
          {lines.map((l, i) => (
            <div className="journal-line" key={i}>
              <AccountSelect accounts={accounts} value={l.account_id} onChange={(id) => set(i, { account_id: id })} label={`Line ${i + 1} account`} />
              <input type="number" min={0} step="0.01" aria-label={`Line ${i + 1} debit`} value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} />
              <input type="number" min={0} step="0.01" aria-label={`Line ${i + 1} credit`} value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} />
              <button type="button" className="btn icon" aria-label={`Remove line ${i + 1}`} disabled={lines.length <= 2} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
          ))}
          <div className="journal-line journal-line-foot">
            <button type="button" className="btn text" onClick={() => setLines([...lines, blank()])}>
              <Icon name="plus" className="sm" />
              Add a line
            </button>
            <strong className="mono">{money(dr / 100)}</strong>
            <strong className="mono">{money(cr / 100)}</strong>
            <span />
          </div>
          <p className={`small ${diff ? "books-off" : "muted"}`}>{diff ? `Out by ${money(Math.abs(diff) / 100)} — ${diff > 0 ? "credits" : "debits"} are short.` : dr ? "Balanced." : "Debits must equal credits."}</p>
        </div>
        <div className="row actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving || !dr || Boolean(diff)}>
            <Icon name="check" className="sm" />
            {saving ? "Posting…" : "Post voucher"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** NEW-1049: the chart of accounts, with balances today. */
export function ChartOfAccounts() {
  const list = useApi<Account[]>(`${BOOKS}/accounts`);
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const all = list.data ?? [];
  const rows = all.filter((a) => (!kind || a.kind === kind) && (!q || `${a.code} ${a.name}`.toLowerCase().includes(q.toLowerCase())));

  async function remove(a: Account) {
    try {
      await api.delete(`${BOOKS}/accounts/${a.id}`);
      notify(`${a.name} deleted.`);
      setEditing(null);
      list.reload();
    } catch (e) {
      notify(errorText(e));
    }
  }

  return (
    <>
      <div className="filterbar spread">
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <div className="searchbox">
            <Icon name="search" className="sm" />
            <input type="search" placeholder="Code or name" aria-label="Search accounts" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All kinds</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className="btn primary" onClick={() => setEditing("new")}>
          <Icon name="plus" className="sm" />
          Add account
        </button>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel
        title="Chart of accounts"
        sub="Accounts marked Automatic receive postings from fees, receipts, expenses, bills and payroll; one is added for each new fee type and expense category. Rename or renumber them freely."
        flush
      >
        <DataTable
          columns={["Code", "Account", "Kind", "Category", "Balance today", "Status"]}
          rows={rows.map((a) => [
            a.code,
            { text: a.name, note: a.description ?? undefined },
            KIND_LABEL[a.kind],
            a.category,
            money(a.balance),
            !a.is_active ? { text: "Off", tone: "warn" } : a.is_system ? "Automatic" : "Manual",
          ])}
          actions={(i) => (
            <>
              <a className="btn" href={`${routeOf(1054)}?account=${rows[i].id}`}>
                Ledger
              </a>
              <button type="button" className="btn" onClick={() => setEditing(rows[i])}>
                Edit
              </button>
            </>
          )}
          empty={list.loading ? "Loading…" : "No accounts match."}
        />
      </Panel>
      {editing ? (
        <AccountForm
          account={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          categories={[...new Set(all.map((a) => a.category))].sort()}
          onDelete={editing !== "new" && !editing.is_system && !editing.has_entries ? () => remove(editing) : undefined}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      ) : null}
    </>
  );
}

function AccountForm({ account, categories, onClose, onSaved, onDelete }: { account: Account | null; categories: string[]; onClose: () => void; onSaved: () => void; onDelete?: () => void }) {
  const [f, setF] = useState({
    code: account?.code ?? "",
    name: account?.name ?? "",
    kind: account?.kind ?? "asset",
    description: account?.description ?? "",
    category: account?.category ?? "",
    is_active: account?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = { code: f.code.trim(), name: f.name.trim(), kind: f.kind, category: f.category.trim() || null, description: f.description.trim() || null };
    try {
      if (account) await api.patch(`${BOOKS}/accounts/${account.id}`, { ...body, kind: account.is_system ? undefined : f.kind, is_active: f.is_active });
      else await api.post(`${BOOKS}/accounts`, body);
      notify(account ? "Account saved." : "Account added.");
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog title={account ? `Edit ${account.name}` : "Add account"} onClose={onClose}>
      <form onSubmit={save}>
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <Field label="Code" required>
            <input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} maxLength={20} pattern="[A-Za-z0-9.\-]+" required placeholder="1550" />
          </Field>
          <Field label="Kind" required>
            <select value={f.kind} disabled={Boolean(account?.is_system)} onChange={(e) => setF({ ...f, kind: e.target.value as Account["kind"] })}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Name" required full>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} minLength={2} maxLength={120} required placeholder="Smart classroom equipment" />
          </Field>
          <Field label="Category" full>
            <input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} maxLength={60} list="account-categories" placeholder="Fee income, Staff costs, Fixed assets…" />
            <datalist id="account-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Description" full>
            <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={300} />
          </Field>
          {account && !account.is_system ? (
            <Field label="In use" full>
              <label className="row small" style={{ gap: 8 }}>
                <input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />
                Offer this account on new journal vouchers
              </label>
            </Field>
          ) : null}
        </div>
        {account?.is_system ? <p className="muted small">This account receives automatic postings, so its kind is fixed and it cannot be switched off.</p> : null}
        <div className="row actions">
          {onDelete ? (
            <button type="button" className="btn danger" onClick={onDelete} style={{ marginRight: "auto" }}>
              Delete
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={saving}>
            <Icon name="check" className="sm" />
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
