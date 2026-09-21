"use client";

import { FormEvent, useEffect, useState } from "react";

import { PickedStudent, StudentPicker } from "@/components/StudentPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, humanize, inr, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

const API = "/api/v1/school/accounts";
const MODES = ["cash", "bank_transfer", "upi", "card", "cheque", "other"];
const todayIso = () => new Date().toISOString().slice(0, 10);
const monthStart = () => todayIso().slice(0, 8) + "01";

type Handlers = { onChange: (m: string) => void; onError: (m: string) => void };
type Category = { id: number; name: string; is_active: boolean };
type Expense = { id: number; spent_on: string; category_name: string; payee_name: string | null; amount: string; tax_amount: string; mode: string; reference: string | null; description: string; recorded_by_name: string | null; is_void: boolean; void_reason: string | null };
type Income = { id: number; received_on: string; source: string; payer: string; amount: string; mode: string; reference: string | null; notes: string | null; receipt_no: string; is_void: boolean };
type Cheque = { id: number; student_name: string; section_label: string | null; fees_label: string; amount: string; cheque_no: string; bank_name: string; cheque_date: string; received_on: string; status: string; deposited_on: string | null; cleared_on: string | null; bounce_reason: string | null; due_for_deposit: boolean };
type Concession = { id: number; student_name: string; section_label: string | null; fee_head_name: string | null; kind: string; value: string; reason: string; valid_from: string; valid_to: string | null; approved_by_name: string | null; is_active: boolean };
type Collection = { id: number; receipt_no: string; collected_on: string; student_name: string; section_label: string | null; fee_head_name: string; period: string; amount: string; mode: string; reference: string | null; collected_by_name: string | null };
type CashBook = {
  total_in: string;
  total_out: string;
  net: string;
  income: { fees: Record<string, string>; fees_by_head: Record<string, string>; other: Record<string, string>; store: Record<string, string> };
  expenses: { by_category: Record<string, string>; payroll: string };
  by_mode: Record<string, { in: string; out: string }>;
  daily: { date: string; in: string; out: string }[];
};

function Range({ frm, to, onChange }: { frm: string; to: string; onChange: (f: string, t: string) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input label="From" type="date" value={frm} onChange={(e) => onChange(e.target.value, to)} />
      <Input label="To" type="date" value={to} onChange={(e) => onChange(frm, e.target.value)} />
    </div>
  );
}

export function AccountsApp() {
  const [tab, setTab] = useState<"book" | "collections" | "expenses" | "income" | "cheques" | "concessions">("book");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const flash = (m: string) => {
    setNotice(m);
    setError(null);
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Accounts" subtitle="Cash book, fee receipts, expenses, other income, cheques and concessions." />
      <nav className="flex flex-wrap gap-1 border-b border-surface-border">
        {(["book", "collections", "expenses", "income", "cheques", "concessions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-brand-500 text-ink" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            {{ book: "Cash book", collections: "Fee receipts", expenses: "Expenses", income: "Other income", cheques: "Cheques", concessions: "Concessions" }[t]}
          </button>
        ))}
      </nav>
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      {tab === "book" && <Book onError={setError} />}
      {tab === "collections" && <Collections onError={setError} />}
      {tab === "expenses" && <Expenses onChange={flash} onError={setError} />}
      {tab === "income" && <OtherIncome onChange={flash} onError={setError} />}
      {tab === "cheques" && <Cheques onChange={flash} onError={setError} />}
      {tab === "concessions" && <Concessions onChange={flash} onError={setError} />}
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: Record<string, string> }) {
  const entries = Object.entries(rows).filter(([, v]) => Number(v) !== 0);
  if (!entries.length) return null;
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase text-ink-subtle">{title}</div>
      {entries.map(([k, v]) => (
        <div key={k} className="flex justify-between text-sm">
          <span className="text-ink-muted">{humanize(k)}</span>
          <span className="text-ink">{inr(v)}</span>
        </div>
      ))}
    </div>
  );
}

function Book({ onError }: { onError: (m: string) => void }) {
  const [frm, setFrm] = useState(monthStart());
  const [to, setTo] = useState(todayIso());
  const [b, setB] = useState<CashBook | null>(null);
  useEffect(() => {
    api.get<CashBook>(`${API}/cash-book`, { params: { from: frm, to } }).then((r) => setB(r.data)).catch((e) => onError(apiError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frm, to]);
  return (
    <div className="space-y-4">
      <Range frm={frm} to={to} onChange={(f, t) => { setFrm(f); setTo(t); }} />
      {b && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Money in" value={inr(b.total_in)} accent="emerald" />
            <StatCard label="Money out" value={inr(b.total_out)} accent="rose" />
            <StatCard label="Net" value={inr(b.net)} accent={Number(b.net) >= 0 ? "emerald" : "rose"} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>In</CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                <Breakdown title="Fees by head" rows={b.income.fees_by_head} />
                <Breakdown title="Other income" rows={b.income.other} />
                <Breakdown title="Store (direct)" rows={b.income.store} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Out</CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                <Breakdown title="Expenses" rows={b.expenses.by_category} />
                <Breakdown title="Salaries" rows={{ payroll: b.expenses.payroll }} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>By mode</CardTitle>
              </CardHeader>
              <Table head={["Mode", "In", "Out"]}>
                {Object.entries(b.by_mode).map(([m, v]) => (
                  <tr key={m}>
                    <td className={td}>{humanize(m)}</td>
                    <td className="px-4 py-3 text-success">{inr(v.in)}</td>
                    <td className="px-4 py-3 text-danger">{inr(v.out)}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Day by day</CardTitle>
            </CardHeader>
            <Table head={["Date", "In", "Out", "Net"]} empty={b.daily.length === 0 && "No money movement in this range."}>
              {b.daily.map((d) => (
                <tr key={d.date}>
                  <td className={td}>{d.date}</td>
                  <td className="px-4 py-3 text-success">{inr(d.in)}</td>
                  <td className="px-4 py-3 text-danger">{inr(d.out)}</td>
                  <td className={tdStrong}>{inr(Number(d.in) - Number(d.out))}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

function Collections({ onError }: { onError: (m: string) => void }) {
  const [frm, setFrm] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [mode, setMode] = useState("");
  const [rows, setRows] = useState<Collection[]>([]);
  useEffect(() => {
    api
      .get<Collection[]>(`${API}/collections`, { params: { from: frm, to, mode: mode || undefined } })
      .then((r) => setRows(r.data))
      .catch((e) => onError(apiError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frm, to, mode]);
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Range frm={frm} to={to} onChange={(f, t) => { setFrm(f); setTo(t); }} />
          <Select label="Mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="">All</option>
            {[...MODES, "online"].map((m) => (
              <option key={m} value={m}>
                {humanize(m)}
              </option>
            ))}
          </Select>
        </div>
        <div className="text-sm text-ink-muted">
          {rows.length} receipts · <span className="font-semibold text-ink">{inr(total)}</span>
        </div>
      </div>
      <Card>
        <Table head={["Receipt", "Date", "Student", "Fee", "Mode", "Amount", "By"]} empty={rows.length === 0 && "No fee receipts in this range."}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-3 text-[12px] font-mono text-ink">{r.receipt_no}</td>
              <td className={td}>{r.collected_on}</td>
              <td className={tdStrong}>
                {r.student_name}
                <div className="text-xs font-normal text-ink-subtle">{r.section_label}</div>
              </td>
              <td className={td}>
                {r.fee_head_name} {r.period}
              </td>
              <td className={td}>
                {humanize(r.mode)}
                {r.reference && <div className="text-xs text-ink-subtle">{r.reference}</div>}
              </td>
              <td className={tdStrong}>{inr(r.amount)}</td>
              <td className={td}>{r.collected_by_name ?? "—"}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function Expenses({ onChange, onError }: Handlers) {
  const [frm, setFrm] = useState(monthStart());
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<Expense[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: number; name: string }[]>([]);
  const [f, setF] = useState({ spent_on: todayIso(), category_id: "", supplier_id: "", payee: "", amount: "", tax_amount: "", mode: "cash", reference: "", description: "" });

  const load = () =>
    api
      .get<Expense[]>(`${API}/expenses`, { params: { from: frm, to } })
      .then((r) => setRows(r.data))
      .catch((e) => onError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frm, to]);

  useEffect(() => {
    api.get<Category[]>(`${API}/expense-categories`).then((r) => setCats(r.data.filter((c) => c.is_active))).catch(() => undefined);
    api.get<{ id: number; name: string }[]>("/api/v1/school/inventory/suppliers").then((r) => setSuppliers(r.data)).catch(() => undefined);
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    const n = (v: string) => (v.trim() ? v.trim() : null);
    try {
      await api.post(`${API}/expenses`, {
        spent_on: f.spent_on,
        category_id: Number(f.category_id),
        supplier_id: f.supplier_id ? Number(f.supplier_id) : null,
        payee: n(f.payee),
        amount: f.amount,
        tax_amount: f.tax_amount || "0",
        mode: f.mode,
        reference: n(f.reference),
        description: f.description,
      });
      setF({ ...f, amount: "", tax_amount: "", reference: "", description: "", payee: "" });
      onChange("Expense recorded.");
      load();
    } catch (err) {
      onError(apiError(err));
    }
  }

  async function voidRow(x: Expense) {
    const reason = window.prompt("Why is this expense being voided?");
    if (!reason) return;
    try {
      await api.post(`${API}/expenses/${x.id}/void`, { reason });
      onChange("Expense voided.");
      load();
    } catch (e) {
      onError(apiError(e));
    }
  }

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const total = rows.filter((r) => !r.is_void).reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Record an expense</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-4">
            <Input label="Date *" type="date" value={f.spent_on} onChange={set("spent_on")} required />
            <Select label="Category *" value={f.category_id} onChange={set("category_id")} required>
              <option value="">Select</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select label="Supplier" value={f.supplier_id} onChange={set("supplier_id")}>
              <option value="">— or type the payee →</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Input label="Paid to" value={f.payee} onChange={set("payee")} disabled={!!f.supplier_id} />
            <Input label="Amount ₹ *" type="number" min="0.01" step="0.01" value={f.amount} onChange={set("amount")} required />
            <Input label="of which tax ₹" type="number" min="0" step="0.01" value={f.tax_amount} onChange={set("tax_amount")} />
            <Select label="Paid by" value={f.mode} onChange={set("mode")}>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {humanize(m)}
                </option>
              ))}
            </Select>
            <Input label="Bill / txn no." value={f.reference} onChange={set("reference")} />
            <div className="sm:col-span-3">
              <Input label="What for *" value={f.description} onChange={set("description")} required />
            </div>
            <div className="flex items-end">
              <Button type="submit">Save</Button>
            </div>
          </form>
        </CardBody>
      </Card>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Range frm={frm} to={to} onChange={(a, b) => { setFrm(a); setTo(b); }} />
        <div className="text-sm text-ink-muted">
          Total <span className="font-semibold text-ink">{inr(total)}</span>
        </div>
      </div>
      <Card>
        <Table head={["Date", "Category", "Paid to", "What for", "Mode", "Amount", ""]} empty={rows.length === 0 && "No expenses in this range."}>
          {rows.map((x) => (
            <tr key={x.id} className={x.is_void ? "opacity-50" : ""}>
              <td className={td}>{x.spent_on}</td>
              <td className={td}>{x.category_name}</td>
              <td className={td}>{x.payee_name ?? "—"}</td>
              <td className={td}>
                {x.description}
                {x.reference && <div className="text-xs text-ink-subtle">{x.reference}</div>}
                {x.is_void && <div className="text-xs text-danger">void: {x.void_reason}</div>}
              </td>
              <td className={td}>{humanize(x.mode)}</td>
              <td className={tdStrong}>{inr(x.amount)}</td>
              <td className="px-4 py-3 text-right">
                {!x.is_void && (
                  <Button size="sm" variant="ghost" onClick={() => voidRow(x)}>
                    Void
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function OtherIncome({ onChange, onError }: Handlers) {
  const [frm, setFrm] = useState(monthStart());
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<Income[]>([]);
  const [f, setF] = useState({ received_on: todayIso(), source: "donation", payer: "", amount: "", mode: "bank_transfer", reference: "", notes: "" });
  const load = () =>
    api
      .get<Income[]>(`${API}/income`, { params: { from: frm, to } })
      .then((r) => setRows(r.data))
      .catch((e) => onError(apiError(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frm, to]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Record income</CardTitle>
        </CardHeader>
        <CardBody>
          <form
            className="grid gap-3 sm:grid-cols-4"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const { data } = await api.post<Income>(`${API}/income`, { ...f, reference: f.reference || null, notes: f.notes || null });
                onChange(`Receipt ${data.receipt_no} issued.`);
                setF({ ...f, payer: "", amount: "", reference: "", notes: "" });
                load();
              } catch (err) {
                onError(apiError(err));
              }
            }}
          >
            <Input label="Date *" type="date" value={f.received_on} onChange={set("received_on")} required />
            <Select label="Source" value={f.source} onChange={set("source")}>
              {["donation", "rent", "grant", "interest", "sponsorship", "other"].map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
            <Input label="From *" value={f.payer} onChange={set("payer")} required />
            <Input label="Amount ₹ *" type="number" min="0.01" step="0.01" value={f.amount} onChange={set("amount")} required />
            <Select label="Mode" value={f.mode} onChange={set("mode")}>
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {humanize(m)}
                </option>
              ))}
            </Select>
            <Input label="Reference" value={f.reference} onChange={set("reference")} />
            <Input label="Notes" value={f.notes} onChange={set("notes")} />
            <div className="flex items-end">
              <Button type="submit">Save</Button>
            </div>
          </form>
        </CardBody>
      </Card>
      <Range frm={frm} to={to} onChange={(a, b) => { setFrm(a); setTo(b); }} />
      <Card>
        <Table head={["Receipt", "Date", "Source", "From", "Mode", "Amount", ""]} empty={rows.length === 0 && "Nothing in this range."}>
          {rows.map((r) => (
            <tr key={r.id} className={r.is_void ? "opacity-50" : ""}>
              <td className="px-4 py-3 text-[12px] font-mono text-ink">{r.receipt_no}</td>
              <td className={td}>{r.received_on}</td>
              <td className={td}>{humanize(r.source)}</td>
              <td className={td}>{r.payer}</td>
              <td className={td}>{humanize(r.mode)}</td>
              <td className={tdStrong}>{inr(r.amount)}</td>
              <td className="px-4 py-3 text-right">
                {r.is_void ? (
                  <Badge tone="rose">void</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      api
                        .post(`${API}/income/${r.id}/void`)
                        .then(load)
                        .catch((e) => onError(apiError(e)))
                    }
                  >
                    Void
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

function Cheques({ onChange, onError }: Handlers) {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Cheque[]>([]);
  const [adding, setAdding] = useState(false);
  const [bouncing, setBouncing] = useState<Cheque | null>(null);
  const load = () =>
    api
      .get<Cheque[]>(`${API}/cheques`, { params: { status: status || undefined } })
      .then((r) => setRows(r.data))
      .catch((e) => onError(apiError(e)));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function act(c: Cheque, action: string, msg: string) {
    try {
      await api.post(`${API}/cheques/${c.id}/action`, { action });
      onChange(msg);
      load();
    } catch (e) {
      onError(apiError(e));
    }
  }

  const tone = { received: "amber", deposited: "brand", cleared: "emerald", bounced: "rose", returned: "neutral" } as const;
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {["received", "deposited", "cleared", "bounced", "returned"].map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Button onClick={() => setAdding(true)}>+ Record cheque</Button>
      </div>
      <Card>
        <Table head={["Cheque", "Student", "For", "Amount", "Dated", "Status", ""]} empty={rows.length === 0 && "No cheques."}>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className={tdStrong}>
                #{c.cheque_no}
                <div className="text-xs font-normal text-ink-subtle">{c.bank_name}</div>
              </td>
              <td className={td}>
                {c.student_name}
                <div className="text-xs text-ink-subtle">{c.section_label}</div>
              </td>
              <td className={td}>{c.fees_label}</td>
              <td className={tdStrong}>{inr(c.amount)}</td>
              <td className={c.due_for_deposit ? "px-3 py-2 font-medium text-warning" : td}>
                {c.cheque_date}
                {c.due_for_deposit && <div className="text-xs">ready to deposit</div>}
              </td>
              <td className="px-4 py-3">
                <Badge tone={tone[c.status as keyof typeof tone]}>{c.status}</Badge>
                {c.bounce_reason && <div className="text-xs text-danger">{c.bounce_reason}</div>}
              </td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {c.status === "received" && (
                  <>
                    <Button size="sm" disabled={!c.due_for_deposit} onClick={() => act(c, "deposit", "Marked deposited.")}>
                      Deposit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => act(c, "return", "Cheque returned to the parent.")}>
                      Return
                    </Button>
                  </>
                )}
                {c.status === "deposited" && (
                  <>
                    <Button size="sm" onClick={() => act(c, "clear", "Cleared — fees credited.")}>
                      Cleared
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setBouncing(c)}>
                      Bounced
                    </Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
      {adding && (
        <ChequeModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            onChange("Cheque recorded. Fees are credited when it clears.");
            load();
          }}
        />
      )}
      {bouncing && (
        <BounceModal
          cheque={bouncing}
          onClose={() => setBouncing(null)}
          onDone={() => {
            setBouncing(null);
            onChange("Marked bounced.");
            load();
          }}
        />
      )}
    </div>
  );
}

type PendingFee = { id: number; fee_head_name: string; period: string; amount_outstanding: string; status: string };

function ChequeModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [fees, setFees] = useState<PendingFee[]>([]);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [f, setF] = useState({ cheque_no: "", bank_name: "", drawer_name: "", cheque_date: todayIso() });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPicked(new Set());
    if (!student) return setFees([]);
    api
      .get<{ items: PendingFee[] }>("/api/v1/school/fees/student-fees", { params: { student_id: student.id, status: "pending", page_size: 100 } })
      .then((r) => setFees(r.data.items.filter((x) => Number(x.amount_outstanding) > 0)))
      .catch(() => setFees([]));
  }, [student]);

  const amount = fees.filter((x) => picked.has(x.id)).reduce((s, x) => s + Number(x.amount_outstanding), 0);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <Modal open onClose={onClose} title="Record cheque" size="lg">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!student) return;
          try {
            await api.post(`${API}/cheques`, { student_id: student.id, fee_ids: Array.from(picked), amount: amount.toFixed(2), ...f, drawer_name: f.drawer_name || null });
            onSaved();
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <StudentPicker value={student} onChange={setStudent} />
        {student && (
          <div className="space-y-1 rounded-lg border border-surface-border p-3 text-sm">
            {fees.length === 0 && <div className="text-ink-muted">No pending fees.</div>}
            {fees.map((x) => (
              <label key={x.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-ink">
                  <input
                    type="checkbox"
                    checked={picked.has(x.id)}
                    onChange={() => {
                      const n = new Set(picked);
                      if (n.has(x.id)) n.delete(x.id);
                      else n.add(x.id);
                      setPicked(n);
                    }}
                  />
                  {x.fee_head_name} {x.period}
                </span>
                <span className="text-ink-muted">{inr(x.amount_outstanding)}</span>
              </label>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-4">
          <Input label="Cheque no. *" inputMode="numeric" maxLength={6} value={f.cheque_no} onChange={set("cheque_no")} required />
          <Input label="Bank *" value={f.bank_name} onChange={set("bank_name")} required />
          <Input label="Drawn by" value={f.drawer_name} onChange={set("drawer_name")} />
          <Input label="Cheque date *" type="date" value={f.cheque_date} onChange={set("cheque_date")} required />
        </div>
        <div className="text-sm text-ink">Amount: {inr(amount)}</div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!student || picked.size === 0}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function BounceModal({ cheque, onClose, onDone }: { cheque: Cheque; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("Insufficient funds");
  const [charge, setCharge] = useState("");
  const [headId, setHeadId] = useState("");
  const [heads, setHeads] = useState<{ id: number; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get<{ id: number; name: string }[]>("/api/v1/school/fees/heads").then((r) => setHeads(r.data)).catch(() => undefined);
  }, []);
  return (
    <Modal open onClose={onClose} title={`Cheque #${cheque.cheque_no} bounced`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api.post(`${API}/cheques/${cheque.id}/action`, {
              action: "bounce",
              bounce_reason: reason,
              bounce_charge: charge || null,
              bounce_fee_head_id: charge ? Number(headId) : null,
            });
            onDone();
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <Input label="Reason *" value={reason} onChange={(e) => setReason(e.target.value)} required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Bounce charge ₹" type="number" min="0" value={charge} onChange={(e) => setCharge(e.target.value)} />
          {charge && (
            <Select label="Charge under fee head" value={headId} onChange={(e) => setHeadId(e.target.value)} required>
              <option value="">Select</option>
              {heads.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          )}
        </div>
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger">
            Mark bounced
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Concessions({ onChange, onError }: Handlers) {
  const [rows, setRows] = useState<Concession[]>([]);
  const [heads, setHeads] = useState<{ id: number; name: string }[]>([]);
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [f, setF] = useState({ fee_head_id: "", kind: "percent", value: "", reason: "sibling", valid_from: todayIso(), valid_to: "", notes: "", apply_to_pending: true });
  const load = () =>
    api
      .get<Concession[]>(`${API}/concessions`)
      .then((r) => setRows(r.data))
      .catch((e) => onError(apiError(e)));
  useEffect(() => {
    load();
    api.get<{ id: number; name: string }[]>("/api/v1/school/fees/heads").then((r) => setHeads(r.data)).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Give a concession or scholarship</CardTitle>
        </CardHeader>
        <CardBody>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!student) return;
              try {
                const { data } = await api.post<{ applied_to_pending: number }>(`${API}/concessions`, {
                  student_id: student.id,
                  fee_head_id: f.fee_head_id ? Number(f.fee_head_id) : null,
                  kind: f.kind,
                  value: f.value,
                  reason: f.reason,
                  valid_from: f.valid_from,
                  valid_to: f.valid_to || null,
                  notes: f.notes || null,
                  apply_to_pending: f.apply_to_pending,
                });
                onChange(`Concession saved${data.applied_to_pending ? `; ${data.applied_to_pending} unpaid fee(s) reduced` : ""}.`);
                setStudent(null);
                setF({ ...f, value: "", notes: "" });
                load();
              } catch (err) {
                onError(apiError(err));
              }
            }}
          >
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <StudentPicker value={student} onChange={setStudent} />
              </div>
              <Select label="On fee" value={f.fee_head_id} onChange={set("fee_head_id")}>
                <option value="">All fees</option>
                {heads.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </Select>
              <Select label="Reason" value={f.reason} onChange={set("reason")}>
                {["sibling", "merit", "staff ward", "scholarship", "need-based", "sports quota", "other"].map((r) => (
                  <option key={r} value={r}>
                    {humanize(r)}
                  </option>
                ))}
              </Select>
              <Select label="Type" value={f.kind} onChange={set("kind")}>
                <option value="percent">% off</option>
                <option value="fixed">₹ off each fee</option>
              </Select>
              <Input label={f.kind === "percent" ? "Percent *" : "Amount ₹ *"} type="number" min="0.01" step="0.01" value={f.value} onChange={set("value")} required />
              <Input label="From *" type="date" value={f.valid_from} onChange={set("valid_from")} required />
              <Input label="Until" type="date" value={f.valid_to} onChange={set("valid_to")} />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={f.apply_to_pending} onChange={(e) => setF({ ...f, apply_to_pending: e.target.checked })} />
              Also reduce this student&apos;s unpaid fees already raised in this period
            </label>
            <Button type="submit" disabled={!student}>
              Save concession
            </Button>
          </form>
        </CardBody>
      </Card>
      <Card>
        <Table head={["Student", "Fee", "Concession", "Reason", "Valid", "Approved by", ""]} empty={rows.length === 0 && "No active concessions."}>
          {rows.map((c) => (
            <tr key={c.id}>
              <td className={tdStrong}>
                {c.student_name}
                <div className="text-xs font-normal text-ink-subtle">{c.section_label}</div>
              </td>
              <td className={td}>{c.fee_head_name}</td>
              <td className={td}>{c.kind === "percent" ? `${Number(c.value)}%` : inr(c.value)}</td>
              <td className={td}>{humanize(c.reason)}</td>
              <td className={td}>
                {c.valid_from} → {c.valid_to ?? "open"}
              </td>
              <td className={td}>{c.approved_by_name ?? "—"}</td>
              <td className="px-4 py-3 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    api
                      .post(`${API}/concessions/${c.id}/end`)
                      .then(() => {
                        onChange("Concession ended.");
                        load();
                      })
                      .catch((e) => onError(apiError(e)))
                  }
                >
                  End
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
