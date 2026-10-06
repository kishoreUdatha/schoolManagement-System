"use client";

import { useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { askText } from "@/lib/dialog";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { Field, isoToday, monthStart } from "./common";
import { DateRange } from "./IncomeList";
import type { ExpenseCategory } from "./types";

type Entry = {
  id: number;
  entry_no: string;
  entry_date: string;
  kind: "topup" | "spend";
  amount: string;
  mode: string | null;
  category: string | null;
  paid_to: string | null;
  description: string;
  bill_no: string | null;
  is_void: boolean;
  void_reason: string | null;
  created_by_name: string | null;
};
type Summary = {
  float: string;
  balance: string;
  spent_since_topup: string;
  top_up_to_float: string;
  low: boolean;
  spent: string;
  topped_up: string;
  by_category: { category: string; amount: string }[];
  entries: Entry[];
};

const BASE = "/api/v1/school/accounts/petty-cash";
const MODES: [string, string][] = [
  ["cash", "Main cash"],
  ["bank_transfer", "Bank (withdrawal / transfer)"],
  ["cheque", "Cheque (self)"],
  ["upi", "UPI"],
];

/**
 * NEW-098, live: petty cash on the imprest system. A float kept by the
 * custodian, small bills paid from it against a voucher, and top-ups back to
 * the float. GET /accounts/petty-cash, POST …/spend, …/topup, …/{id}/void,
 * PUT …/float. Each entry posts to the books: a spend under its expense
 * category, a top-up out of cash or bank.
 */
export function PettyCash() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(isoToday());
  const [dialog, setDialog] = useState<"spend" | "topup" | "float" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const r = useApi<Summary>(BASE, { from, to });
  const cats = useApi<ExpenseCategory[]>("/api/v1/school/accounts/expense-categories");
  const d = r.data;

  async function cancel(e: Entry) {
    const reason = await askText(`Cancel ${e.entry_no} (${money(e.amount)})? It stays on the list, struck through.`, { placeholder: "Reason, e.g. entered twice", required: true });
    if (!reason) return;
    try {
      await api.post(`${BASE}/${e.id}/void`, { reason });
      notify(`${e.entry_no} cancelled.`);
      r.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (!d) return r.error ? <ErrorNote>{r.error}</ErrorNote> : <Loading what="Loading petty cash…" />;
  const stats = [
    { label: "In the petty cash box", value: money(d.balance), note: d.low ? "Running low: top it up" : `Float ${money(d.float)}` },
    { label: "Spent since last top-up", value: money(d.spent_since_topup), note: "What the next top-up replaces" },
    { label: "Spent in these dates", value: money(d.spent), note: d.by_category[0] ? `Most on ${d.by_category[0].category}` : "Nothing spent" },
    { label: "Topped up in these dates", value: money(d.topped_up), note: "From cash or the bank" },
  ];

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <span className="filter-count">{`${d.entries.length} entr${d.entries.length === 1 ? "y" : "ies"}`}</span>
        <button type="button" className="btn" onClick={() => setDialog("float")}>
          <Icon name="settings" className="sm" />
          {`Float ${money(d.float)}`}
        </button>
        <button type="button" className="btn" onClick={() => setDialog("topup")}>
          <Icon name="plus" className="sm" />
          Top up
        </button>
        <button type="button" className="btn primary" onClick={() => setDialog("spend")}>
          <Icon name="money" className="sm" />
          Pay from petty cash
        </button>
      </div>
      {d.low ? (
        <div className="tip warn" role="status">
          <Icon name="bell" className="sm" />
          <span>{`Petty cash is down to ${money(d.balance)}. Top it up by ${money(d.top_up_to_float)} to bring it back to the ${money(d.float)} float.`}</span>
        </div>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
      <Panel flush>
        <div className="table-wrap">
          <table className="data-table petty-table">
            <thead>
              <tr>
                <th>Voucher</th>
                <th>Date</th>
                <th>Details</th>
                <th>Category</th>
                <th className="num">Paid out</th>
                <th className="num">Topped up</th>
                <th>By</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.entries.map((e) => (
                <tr key={e.id} className={e.is_void ? "void" : ""}>
                  <td>
                    {e.entry_no}
                    {e.bill_no ? <small className="muted" style={{ display: "block", fontWeight: 500 }}>{`Bill ${e.bill_no}`}</small> : null}
                  </td>
                  <td>{date(e.entry_date)}</td>
                  <td className="wrap">
                    {e.description}
                    {e.paid_to ? <small className="muted" style={{ display: "block" }}>{e.paid_to}</small> : null}
                    {e.is_void ? <small className="muted" style={{ display: "block" }}>{`Cancelled: ${e.void_reason}`}</small> : null}
                  </td>
                  <td>{e.kind === "spend" ? e.category : MODES.find(([k]) => k === e.mode)?.[1] ?? "Top-up"}</td>
                  <td className="num">{e.kind === "spend" ? money(e.amount) : ""}</td>
                  <td className="num">{e.kind === "topup" ? money(e.amount) : ""}</td>
                  <td>{e.created_by_name ?? "—"}</td>
                  <td className="num">
                    {e.is_void ? null : (
                      <button type="button" className="btn text" onClick={() => cancel(e)}>
                        Cancel
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!d.entries.length ? (
                <tr>
                  <td colSpan={8} className="table-empty">
                    Nothing in these dates. Top up the float first, then pay small bills from it.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
      {dialog ? (
        <PettyDialog
          kind={dialog}
          summary={d}
          cats={(cats.data ?? []).filter((c) => c.is_active)}
          onClose={() => setDialog(null)}
          onSaved={(msg) => {
            notify(msg);
            setDialog(null);
            r.reload();
          }}
        />
      ) : null}
    </>
  );
}

function PettyDialog({ kind, summary, cats, onClose, onSaved }: { kind: "spend" | "topup" | "float"; summary: Summary; cats: ExpenseCategory[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState(kind === "topup" ? String(Number(summary.top_up_to_float) || "") : kind === "float" ? String(Number(summary.float)) : "");

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const t = (k: string) => String(f.get(k) ?? "").trim() || null;
    setBusy(true);
    setError(null);
    try {
      if (kind === "spend") {
        const r = await api.post<{ entry_no: string; balance: string }>(`${BASE}/spend`, {
          entry_date: t("entry_date"), amount, category_id: Number(t("category_id")), description: t("description"), paid_to: t("paid_to"), bill_no: t("bill_no"),
        });
        onSaved(`${r.entry_no}: ${money(amount)} paid. ${money(r.balance)} left in petty cash.`);
      } else if (kind === "topup") {
        const r = await api.post<{ entry_no: string; balance: string }>(`${BASE}/topup`, { entry_date: t("entry_date"), amount, mode: t("mode"), description: t("description") });
        onSaved(`${r.entry_no}: petty cash topped up to ${money(r.balance)}.`);
      } else {
        await api.put(`${BASE}/float`, { amount });
        onSaved(`The petty cash float is now ${money(amount)}.`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const title = kind === "spend" ? "Pay from petty cash" : kind === "topup" ? "Top up petty cash" : "Petty cash float";
  return (
    <Dialog
      open
      title={title}
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Saving…" : kind === "spend" ? "Record payment" : kind === "topup" ? "Record top-up" : "Save float"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      {kind === "float" ? (
        <>
          <p className="muted small" style={{ marginBottom: 10 }}>The amount the custodian is kept topped up to. Top-ups suggest bringing it back to this.</p>
          <Field label="Float (₹)" required>
            <input type="number" min={0} step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
        </>
      ) : (
        <div className="form-grid">
          <Field label="Date" required>
            <input type="date" name="entry_date" defaultValue={isoToday()} max={isoToday()} required />
          </Field>
          <Field label="Amount (₹)" required>
            <input type="number" min={1} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          {kind === "spend" ? (
            <>
              <Field label="Spent on" required>
                <select name="category_id" required defaultValue="">
                  <option value="" disabled>
                    {cats.length ? "Choose a category" : "Add expense categories first"}
                  </option>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Paid to">
                <input name="paid_to" maxLength={120} placeholder="Shop or person" />
              </Field>
              <Field label="What for" required full>
                <input name="description" maxLength={300} required placeholder="e.g. Chalk and dusters" />
              </Field>
              <Field label="Bill no.">
                <input name="bill_no" maxLength={60} placeholder="From the shop's bill" />
              </Field>
              <p className="muted small" style={{ alignSelf: "end" }}>{`${money(summary.balance)} in the box`}</p>
            </>
          ) : (
            <>
              <Field label="Taken from" required>
                <select name="mode" defaultValue="cash" required>
                  {MODES.map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Note">
                <input name="description" maxLength={300} placeholder="e.g. Weekly top-up" />
              </Field>
              <p className="muted small full">{`${money(summary.spent_since_topup)} spent since the last top-up; ${money(summary.top_up_to_float)} brings it back to the ${money(summary.float)} float.`}</p>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}
