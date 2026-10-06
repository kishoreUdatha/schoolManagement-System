"use client";

import { useState, type FormEvent } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Dialog, Field } from "@/features/fees/common";
import { BOOKS, KIND_LABEL, KINDS } from "./common";
import type { Account } from "./types";

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
