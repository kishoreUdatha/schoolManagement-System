"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { ask, askText } from "@/lib/dialog";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Dialog, downloadAuthed, Field, isoToday } from "@/features/fees/common";
import { AccountSelect, BOOKS, DimFields, DimFilters, dimId, fyStart, useOpenOnYear } from "./common";
import { CHECK_CIRCLE, CLOCK, DOC, DOTS, EYE, n2, PDF, PRINT, RESET, RUPEE, XLS } from "./parts";
import type { Account, Journal, JournalList } from "./types";

const PAGE = 8;
const TYPES = ["Receipt", "Payment", "Contra", "Journal"] as const;
const STATUS_LABEL: Record<Journal["status"], string> = { posted: "Posted", draft: "Draft", void: "Void" };
const dmy = (iso: string) => iso.split("-").reverse().join("-");

type Line = { account_id: number | ""; debit: string; credit: string; note: string };
const blank = (): Line => ({ account_id: "", debit: "", credit: "", note: "" });
const paise = (v: string) => Math.round((Number(v) || 0) * 100);

/**
 * NEW-1052: journal vouchers — opening balances, cash banked, depreciation,
 * corrections. GET /school/books/journals (+ .xlsx, .pdf) with from, to,
 * status, voucher_type, branch_id and department_id; POST to enter one (as a
 * draft or posted), PUT to change a draft, POST /{id}/post, DELETE a draft,
 * POST /{id}/void. A draft stays out of the books until it is posted.
 * ?id= opens a voucher's details. Filters take effect as soon as they change.
 */
export function JournalVouchers() {
  const params = useSearchParams();
  const router = useRouter();
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(isoToday());
  const [branch, setBranch] = useState("");
  const [department, setDepartment] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState<Journal | "new" | null>(null);
  const [printing, setPrinting] = useState<Journal | null>(null);
  const [menu, setMenu] = useState<number | null>(null);
  useOpenOnYear(useCallback((f: string, t: string) => (setFrom(f), setTo(t)), []));

  const filters = {
    from,
    to,
    status: status || undefined,
    voucher_type: type || undefined,
    branch_id: branch || undefined,
    department_id: department || undefined,
  };
  const list = useApi<JournalList>(`${BOOKS}/journals`, filters);
  const accounts = useApi<Account[]>(`${BOOKS}/accounts`);
  const d = list.data;
  const rows = d?.items ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);

  const openId = Number(params.get("id")) || null;
  const outside = useApi<Journal>(openId && !rows.some((j) => j.id === openId) ? `${BOOKS}/journals/${openId}` : null);
  const open = rows.find((j) => j.id === openId) ?? outside.data ?? rows[0] ?? null;
  const show = (id: number) => router.replace(`${routeOf(1052)}?id=${id}`, { scroll: false });
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const reload = () => {
    list.reload();
    outside.reload();
  };

  async function act(j: Journal, what: "post" | "void" | "delete") {
    setMenu(null);
    try {
      if (what === "post") {
        if (!(await ask(`Post ${j.entry_no} to the books? A posted voucher can only be voided, not changed.`))) return;
        await api.post(`${BOOKS}/journals/${j.id}/post`);
        notify(`${j.entry_no} posted.`);
      } else if (what === "void") {
        const reason = await askText(`Void ${j.entry_no}? It stays on record, marked void, and leaves the books.`, { required: true, placeholder: "Why is it being voided?" });
        if (!reason) return;
        await api.post(`${BOOKS}/journals/${j.id}/void`, { reason });
        notify(`${j.entry_no} voided.`);
      } else {
        if (!(await ask(`Delete draft ${j.entry_no}? It was never in the books.`))) return;
        await api.delete(`${BOOKS}/journals/${j.id}`);
        notify(`${j.entry_no} deleted.`);
        // let go of the deleted voucher before reloading, so nothing asks for it again
        if (openId === j.id) router.replace(routeOf(1052), { scroll: false });
        list.reload();
        return;
      }
      reload();
    } catch (e) {
      notify(errorText(e));
    }
  }

  async function download(kind: "xlsx" | "pdf") {
    const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
    setBusy(kind);
    try {
      await downloadAuthed(`${BOOKS}/journals.${kind}?${q}`, `journal-vouchers_${from}_${to}.${kind}`);
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="ie-filters">
        <label>
          Date from
          <input type="date" value={from} max={to} required onChange={(e) => e.target.value && change(setFrom)(e.target.value)} />
        </label>
        <label>
          Date to
          <input type="date" value={to} min={from} required onChange={(e) => e.target.value && change(setTo)(e.target.value)} />
        </label>
        <DimFilters branch={branch} department={department} onBranch={change(setBranch)} onDepartment={change(setDepartment)} />
        <label>
          Voucher type
          <select value={type} onChange={(e) => change(setType)(e.target.value)}>
            <option value="">All</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => change(setStatus)(e.target.value)}>
            <option value="">All</option>
            <option value="posted">Posted</option>
            <option value="draft">Draft</option>
            <option value="void">Void</option>
          </select>
        </label>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setFrom(fyStart());
            setTo(isoToday());
            setBranch("");
            setDepartment("");
            setType("");
            setStatus("");
            setPage(1);
          }}
        >
          {RESET}
          Reset
        </button>
      </div>

      <div className="ie-cards bs-cards jv-cards">
        <div className="ie-card net">
          <span className="ie-card-ico">{DOC}</span>
          <div>
            <p>Total vouchers</p>
            <strong>{d ? d.total.toLocaleString("en-IN") : "…"}</strong>
          </div>
        </div>
        <div className="ie-card income">
          <span className="ie-card-ico">{RUPEE}</span>
          <div>
            <p>Total debit</p>
            <strong>{d ? `₹ ${n2(d.total_debit, "0.00")}` : "…"}</strong>
          </div>
        </div>
        <div className="ie-card expense">
          <span className="ie-card-ico">{RUPEE}</span>
          <div>
            <p>Total credit</p>
            <strong>{d ? `₹ ${n2(d.total_credit, "0.00")}` : "…"}</strong>
          </div>
        </div>
        <div className="ie-card ratio jv-split">
          <span className="ie-card-ico">{CHECK_CIRCLE}</span>
          <div>
            <p>Posted vouchers</p>
            <strong>{d ? d.posted : "…"}</strong>
          </div>
          <span className="ie-card-ico">{CLOCK}</span>
          <div>
            <p>Draft vouchers</p>
            <strong>{d ? d.drafts : "…"}</strong>
          </div>
        </div>
      </div>

      <ErrorNote>{list.error ?? accounts.error}</ErrorNote>
      <section className="panel ie-panel">
        <div className="ie-head jv-head">
          <div className="ie-actions">
            <button type="button" className="btn primary" onClick={() => setEditing("new")}>
              <Icon name="plus" className="sm" />
              New Journal Voucher
            </button>
            <button type="button" className="btn" disabled={!d || Boolean(busy)} onClick={() => download("xlsx")}>
              {XLS}
              {busy === "xlsx" ? "Preparing…" : "Export Excel"}
            </button>
            <button type="button" className="btn" disabled={!d || Boolean(busy)} onClick={() => download("pdf")}>
              {PDF}
              {busy === "pdf" ? "Preparing…" : "Export PDF"}
            </button>
            <button type="button" className="btn" onClick={() => window.print()}>
              {PRINT}
              Print
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table ie-table lg-table" data-caption={`Journal vouchers ${from} to ${to}`}>
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
                <th>Date</th>
                <th>Voucher No.</th>
                <th>Particulars</th>
                <th>Reference</th>
                <th className="num">Debit (₹)</th>
                <th className="num">Credit (₹)</th>
                <th className="center">Status</th>
                <th className="center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((j, i) => (
                <tr key={j.id} className={open?.id === j.id ? "jv-open" : ""}>
                  <td className="muted">{(page - 1) * PAGE + i + 1}</td>
                  <td>{dmy(j.entry_date)}</td>
                  <td>{j.entry_no}</td>
                  <td className="wrap">{j.narration}</td>
                  <td>{j.reference ?? "-"}</td>
                  <td className="num">{n2(j.total_debit, "0.00")}</td>
                  <td className="num">{n2(j.total_credit, "0.00")}</td>
                  <td className="center">
                    <span className={`jv-status ${j.status}`}>{STATUS_LABEL[j.status]}</span>
                  </td>
                  <td className="center jv-actions">
                    <button type="button" className="jv-icon" aria-label={`View ${j.entry_no}`} title="View" onClick={() => show(j.id)}>
                      {EYE}
                    </button>
                    <span className="jv-more">
                      <button type="button" className="jv-icon" aria-label={`More for ${j.entry_no}`} title="More" onClick={() => setMenu(menu === j.id ? null : j.id)}>
                        {DOTS}
                      </button>
                      {menu === j.id ? (
                        <Menu onClose={() => setMenu(null)}>
                          <button type="button" onClick={() => (setMenu(null), setPrinting(j))}>
                            View voucher
                          </button>
                          {j.status === "draft" ? (
                            <>
                              <button type="button" onClick={() => (setMenu(null), setEditing(j))}>
                                Edit draft
                              </button>
                              <button type="button" onClick={() => act(j, "post")}>
                                Post to books
                              </button>
                              <button type="button" className="danger" onClick={() => act(j, "delete")}>
                                Delete draft
                              </button>
                            </>
                          ) : null}
                          {j.status === "posted" ? (
                            <button type="button" className="danger" onClick={() => act(j, "void")}>
                              Void voucher
                            </button>
                          ) : null}
                        </Menu>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
              {d && !rows.length ? (
                <tr>
                  <td />
                  <td colSpan={8} className="muted wrap">
                    No journal vouchers here. Fees, receipts, expenses, bills and payroll post themselves; use a voucher for opening balances, cash banked, depreciation and corrections.
                  </td>
                </tr>
              ) : null}
              {!d ? (
                <tr>
                  <td colSpan={9} className="muted">
                    {list.loading ? "Loading…" : "No vouchers."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="lg-foot">
          <span className="muted small">{d ? `Showing ${rows.length ? (page - 1) * PAGE + 1 : 0} to ${Math.min(page * PAGE, rows.length)} of ${rows.length} entries` : ""}</span>
          <div className="lg-pager">
            <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            {Array.from({ length: pages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === pages || Math.abs(p - page) <= 1)
              .map((p) => (
                <button key={p} type="button" className={`btn ${p === page ? "primary" : ""}`} onClick={() => setPage(p)}>
                  {p}
                </button>
              ))}
            <button type="button" className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        </div>
      </section>

      {open ? <Details j={open} onView={() => setPrinting(open)} /> : null}

      {printing ? <VoucherPrint j={printing} onClose={() => setPrinting(null)} /> : null}
      {editing ? (
        <VoucherForm
          accounts={accounts.data ?? []}
          draft={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(j) => {
            setEditing(null);
            reload();
            show(j.id);
            notify(j.status === "draft" ? `${j.entry_no} saved as a draft.` : `${j.entry_no} posted.`);
          }}
        />
      ) : null}
    </>
  );
}

/** A small menu that closes on a click outside it. */
function Menu({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    setTimeout(() => document.addEventListener("click", away));
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", away);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);
  return (
    <div className="jv-menu" role="menu" ref={ref}>
      {children}
    </div>
  );
}

function Details({ j, onView }: { j: Journal; onView: () => void }) {
  return (
    <section className="panel jv-details">
      <div className="jv-details-head">
        <h2>
          {`Voucher Details - ${j.entry_no}`}
          <span className={`jv-status ${j.status}`}>{STATUS_LABEL[j.status]}</span>
        </h2>
        <button type="button" className="btn" onClick={onView}>
          {DOC}
          View Voucher
        </button>
      </div>
      <div className="jv-meta">
        <div>
          <p>Date</p>
          <strong>{dmy(j.entry_date)}</strong>
        </div>
        <div>
          <p>Reference</p>
          <strong>{j.reference ?? "-"}</strong>
        </div>
        <div className="jv-meta-wide">
          <p>Particulars</p>
          <span>
            {j.narration}
            {j.description ? <small>{j.description}</small> : null}
            {j.status === "void" && j.void_reason ? <small className="books-off">{`Void: ${j.void_reason}`}</small> : null}
          </span>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table ie-table lg-table">
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              <th>Account Code</th>
              <th>Account Head</th>
              <th>Particulars</th>
              <th className="num">Debit (₹)</th>
              <th className="num">Credit (₹)</th>
            </tr>
          </thead>
          <tbody>
            {j.lines.map((l, i) => (
              <tr key={i}>
                <td className="muted">{i + 1}</td>
                <td>{l.account_code}</td>
                <td>{l.account_name}</td>
                <td>{[l.note ?? j.narration, l.branch, l.department].filter(Boolean).join(" · ")}</td>
                <td className="num">{n2(l.debit)}</td>
                <td className="num">{n2(l.credit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** The voucher as a sheet to print and sign. */
function VoucherPrint({ j, onClose }: { j: Journal; onClose: () => void }) {
  const school = useApi<{ name: string; address: string | null }>("/api/v1/branding/me");
  return (
    <Dialog title={`${j.entry_no} · Journal voucher`} onClose={onClose}>
      <div className="jv-print">
        <div className="jv-print-head">
          <div>
            <h3>{school.data?.name ?? ""}</h3>
            {school.data?.address ? <p className="small muted">{school.data.address}</p> : null}
          </div>
          <div className="right">
            <strong>{`${j.voucher_type} voucher`}</strong>
            <p className="small">{`${j.entry_no} · ${date(j.entry_date)}`}</p>
            <span className={`jv-status ${j.status}`}>{STATUS_LABEL[j.status]}</span>
          </div>
        </div>
        <table className="data-table ie-table">
          <thead>
            <tr>
              <th>Account</th>
              <th className="num">Debit (₹)</th>
              <th className="num">Credit (₹)</th>
            </tr>
          </thead>
          <tbody>
            {j.lines.map((l, i) => (
              <tr key={i}>
                <td>
                  {`${l.account_code} · ${l.account_name}`}
                  {l.note ? <small className="muted" style={{ display: "block" }}>{l.note}</small> : null}
                </td>
                <td className="num">{n2(l.debit)}</td>
                <td className="num">{n2(l.credit)}</td>
              </tr>
            ))}
            <tr className="ie-grand">
              <td>Total</td>
              <td className="num">{n2(j.total_debit, "0.00")}</td>
              <td className="num">{n2(j.total_credit, "0.00")}</td>
            </tr>
          </tbody>
        </table>
        <p className="small">
          <strong>Narration: </strong>
          {j.narration}
          {j.description ? ` — ${j.description}` : ""}
          {j.reference ? ` (Ref. ${j.reference})` : ""}
        </p>
        <div className="jv-sign">
          <span>{`Prepared by ${j.created_by_name ?? ""}`}</span>
          <span>Checked by</span>
          <span>Approved by</span>
        </div>
      </div>
      <div className="row actions">
        <button type="button" className="btn" onClick={onClose}>
          Close
        </button>
        <button type="button" className="btn primary" onClick={() => window.print()}>
          {PRINT}
          Print voucher
        </button>
      </div>
    </Dialog>
  );
}

/** Enter a voucher, or change a draft; save it as a draft or post it. */
function VoucherForm({ accounts, draft, onClose, onSaved }: { accounts: Account[]; draft: Journal | null; onClose: () => void; onSaved: (j: Journal) => void }) {
  const [entryDate, setEntryDate] = useState(draft?.entry_date ?? isoToday());
  const [narration, setNarration] = useState(draft?.narration ?? "");
  const [description, setDescription] = useState(draft?.description ?? "");
  const [reference, setReference] = useState(draft?.reference ?? "");
  const [dims, setDims] = useState({
    branch: draft?.lines[0]?.branch_id ? String(draft.lines[0].branch_id) : "",
    department: draft?.lines[0]?.department_id ? String(draft.lines[0].department_id) : "",
  });
  const [lines, setLines] = useState<Line[]>(
    draft
      ? draft.lines.map((l) => ({ account_id: l.account_id, debit: Number(l.debit) ? String(Number(l.debit)) : "", credit: Number(l.credit) ? String(Number(l.credit)) : "", note: l.note ?? "" }))
      : [blank(), blank()],
  );
  const [saving, setSaving] = useState("");
  const [error, setError] = useState<string | null>(null);

  const dr = lines.reduce((s, l) => s + paise(l.debit), 0);
  const cr = lines.reduce((s, l) => s + paise(l.credit), 0);
  const diff = dr - cr;
  const set = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save(e: FormEvent, status: "draft" | "posted") {
    e.preventDefault();
    const used = lines.filter((l) => l.account_id !== "" || paise(l.debit) || paise(l.credit));
    if (used.some((l) => l.account_id === "")) return setError("Choose an account on every line with an amount.");
    if (used.some((l) => !paise(l.debit) === !paise(l.credit))) return setError("Each line takes either a debit or a credit.");
    if (diff) return setError(`Debits and credits differ by ${money(Math.abs(diff) / 100)}.`);
    setSaving(status);
    setError(null);
    const body = {
      entry_date: entryDate,
      narration: narration.trim(),
      description: description.trim() || null,
      reference: reference.trim() || null,
      status,
      lines: used.map((l) => ({
        account_id: l.account_id,
        debit: l.debit || "0",
        credit: l.credit || "0",
        note: l.note.trim() || null,
        branch_id: dimId(dims.branch),
        department_id: dimId(dims.department),
      })),
    };
    try {
      const j = draft ? await api.put<Journal>(`${BOOKS}/journals/${draft.id}`, body) : await api.post<Journal>(`${BOOKS}/journals`, body);
      onSaved(j);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving("");
    }
  }

  return (
    <Dialog title={draft ? `Edit draft ${draft.entry_no}` : "New journal voucher"} onClose={onClose}>
      <form onSubmit={(e) => save(e, "posted")}>
        <ErrorNote>{error}</ErrorNote>
        <div className="form-grid">
          <Field label="Date" required>
            <input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
          </Field>
          <Field label="Reference">
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="Bank slip, board resolution…" />
          </Field>
          <DimFields branch={dims.branch} department={dims.department} onChange={(branch, department) => setDims({ branch, department })} />
          <Field label="Particulars" required full>
            <input value={narration} onChange={(e) => setNarration(e.target.value)} minLength={3} maxLength={300} required placeholder="Opening balances as on 1 April" />
          </Field>
          <Field label="Description" full>
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Why the entry is made, for whoever reads it later" />
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
          <button type="button" className="btn" disabled={Boolean(saving) || !dr || Boolean(diff)} onClick={(e) => save(e as unknown as FormEvent, "draft")}>
            {saving === "draft" ? "Saving…" : "Save as draft"}
          </button>
          <button type="submit" className="btn primary" disabled={Boolean(saving) || !dr || Boolean(diff)}>
            <Icon name="check" className="sm" />
            {saving === "posted" ? "Posting…" : "Post voucher"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
