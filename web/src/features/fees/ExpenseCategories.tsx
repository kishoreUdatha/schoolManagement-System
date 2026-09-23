"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, isoToday, monthStart } from "./common";
import { ToggleRow, useNewFlag } from "./extra";
import type { Expense, ExpenseCategory } from "./types";

/**
 * NEW-046, live: GET/POST /school/accounts/expense-categories and
 * PUT /expense-categories/{id} (rename, switch off). The API has no delete:
 * a category that is no longer used is switched off, and its past expenses
 * keep it. Expenses themselves are edited on SCR-167. "Used this month" reads
 * this month's /accounts/expenses.
 */
export function ExpenseCategories() {
  const cats = useApi<ExpenseCategory[]>("/api/v1/school/accounts/expense-categories");
  const month = useApi<Expense[]>("/api/v1/school/accounts/expenses", { from: monthStart(), to: isoToday() });
  const [open, setOpen] = useNewFlag();
  const [f, setF] = useState<{ id: number; name: string; is_active: boolean }>({ id: 0, name: "", is_active: true });
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const items = (cats.data ?? []).filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()));
  const active = (cats.data ?? []).filter((c) => c.is_active).length;
  const rows: Row[] = items.map((c) => [c.name, c.is_active ? "Active" : "Inactive"]);
  const n = (v: number, ready: unknown = cats.data) => (ready ? v.toLocaleString("en-IN") : "…");
  const stats = [
    { label: "Categories", value: n(cats.data?.length ?? 0), note: "Set up for expenses" },
    { label: "Active", value: n(active), note: "Offered when recording" },
    { label: "Switched off", value: n((cats.data?.length ?? 0) - active), note: "Kept on past expenses" },
    { label: "Used this month", value: n(new Set((month.data ?? []).filter((x) => !x.is_void).map((x) => x.category_id)).size, month.data), note: "Categories with spending" },
  ];

  const edit = (c: ExpenseCategory) => {
    setFormError(null);
    setF({ id: c.id, name: c.name, is_active: c.is_active });
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setF({ id: 0, name: "", is_active: true });
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const body = { name: f.name.trim(), is_active: f.is_active };
    try {
      if (f.id) await api.put(`/api/v1/school/accounts/expense-categories/${f.id}`, body);
      else await api.post("/api/v1/school/accounts/expense-categories", body);
      notify(f.id ? "Category updated." : "Category added.");
      close();
      cats.reload();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggle(c: ExpenseCategory) {
    setError(null);
    try {
      await api.put(`/api/v1/school/accounts/expense-categories/${c.id}`, { name: c.name, is_active: !c.is_active });
      notify(c.is_active ? `${c.name} switched off. Past expenses keep it.` : `${c.name} is active again.`);
      cats.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="two-col">
        <div className="stack">
          <div className="filterbar">
            <div className="searchbox">
              <Icon name="search" className="sm" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search categories…" aria-label="Search categories" />
            </div>
          </div>
          <ErrorNote>{error ?? cats.error}</ErrorNote>
          <Panel title="Expense categories" sub={`${cats.data ? `${cats.data.length} categories · ${active} active` : ""}${cats.loading ? " · Loading…" : ""}`} flush>
            <DataTable
              columns={["Category", "Status"]}
              rows={rows}
              actions={(i) => (
                <>
                  <button type="button" className="btn" onClick={() => edit(items[i])}>
                    Edit
                  </button>
                  <button type="button" className="btn" onClick={() => toggle(items[i])}>
                    {items[i].is_active ? "Switch off" : "Switch on"}
                  </button>
                </>
              )}
              empty={cats.loading ? "Loading categories…" : q ? "No categories match." : undefined}
              emptyState={{
                title: "No expense categories yet",
                note: "Every expense is booked under a category, so the cash book and finance reports can total spending by it.",
                action: (
                  <button type="button" className="btn primary" onClick={() => setOpen(true)}>
                    Add category
                  </button>
                ),
              }}
            />
          </Panel>
        </div>
        <aside className="stack">
          <div className="aside-panel">
            <h3>How categories are used</h3>
            <p>Every expense is booked under one category, and the cash book and finance reports total spending by it. Only active categories are offered when recording an expense.</p>
            <div className="gap" />
            <Link href={routeOf(167)} className="btn">
              <Icon name="arrow" className="sm" />
              Go to expenses
            </Link>
          </div>
        </aside>
        <Dialog
          open={open}
          title={f.id ? `Edit ${f.name || "category"}` : "Add expense category"}
          onClose={close}
          onSubmit={save}
          actions={
            <>
              <button type="button" className="btn" onClick={close}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                <Icon name="check" className="sm" />
                {saving ? "Saving…" : f.id ? "Save changes" : "Add category"}
              </button>
            </>
          }
        >
          <ErrorNote>{formError}</ErrorNote>
          <Field label="Name" required full>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} minLength={2} maxLength={80} required placeholder="Sports equipment" />
          </Field>
          <ToggleRow title="Active" note="Offered when recording an expense." checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} />
        </Dialog>
      </div>
    </>
  );
}
