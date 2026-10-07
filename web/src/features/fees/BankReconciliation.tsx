"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { ask, askText } from "@/lib/dialog";
import { date, money } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";

const BASE = "/api/v1/school/books/bank-rec";
type Item = { key: string; date: string | null; source_label: string; voucher: string | null; narration: string; amount: string | null; direction?: "in" | "out" };
type Line = { id: number; line_no: number; date: string; description: string; reference: string | null; debit: string; credit: string; balance: string | null; status: "unmatched" | "matched" | "ignored"; note: string | null; matches: Item[] };
type Rec = { books_balance: string; receipts_not_in_bank: string; payments_not_in_bank: string; bank_credits_not_in_books: string; bank_debits_not_in_books: string; set_aside: string; expected_bank_balance: string; statement_balance: string | null; difference: string | null };
type Statement = { id: number; account_name: string; period_from: string; period_to: string; file_name: string | null; closing_balance: string | null; lines: Line[]; open_book_items: Item[]; counts: { lines: number; matched: number; unmatched: number; ignored: number }; reconciliation: Rec };
type Summary = { id: number; account_name: string; period_from: string; period_to: string; file_name: string | null; closing_balance: string | null; lines: number; matched: number; unmatched: number; ignored: number };

/**
 * NEW-101, live: bank reconciliation. Upload the bank's statement (a CSV, or
 * rows pasted from its Excel), match each line to the bank entries in the
 * books (auto by amount and date, or by hand), record bank charges and
 * interest from here, and read the reconciliation: books against bank.
 * GET/POST /books/bank-rec/statements, GET /{id}, POST /{id}/auto-match,
 * POST /lines/{id}/{match, unmatch, ignore, record}, DELETE /statements/{id}.
 */
export function BankReconciliation() {
  const id = useSearchParams().get("id");
  return id ? <StatementView id={id} /> : <StatementList />;
}

function StatementList() {
  const router = useRouter();
  const r = useApi<Summary[]>(`${BASE}/statements`);
  const [uploading, setUploading] = useState(false);
  const rows = r.data ?? [];
  return (
    <>
      <div className="filterbar">
        <span className="muted small" style={{ flex: 1 }}>
          Upload each bank statement as it comes. Fee receipts by UPI, transfer, card and cheque, cash deposits, supplier payments and salaries are matched to it.
        </span>
        <button type="button" className="btn primary" onClick={() => setUploading(true)}>
          <Icon name="plus" className="sm" />
          Upload statement
        </button>
      </div>
      <ErrorNote>{r.error}</ErrorNote>
      <Panel flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Bank</th>
                <th>Period</th>
                <th className="num">Lines</th>
                <th className="num">Matched</th>
                <th className="num">To match</th>
                <th className="num">Closing balance</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>
                    {s.account_name}
                    {s.file_name ? <small className="muted" style={{ display: "block", fontWeight: 500 }}>{s.file_name}</small> : null}
                  </td>
                  <td>{`${date(s.period_from)} – ${date(s.period_to)}`}</td>
                  <td className="num">{s.lines}</td>
                  <td className="num">{s.matched}</td>
                  <td className="num">{s.unmatched ? <span className="badge warn">{s.unmatched}</span> : <span className="badge">Done</span>}</td>
                  <td className="num">{s.closing_balance === null ? "—" : money(s.closing_balance)}</td>
                  <td className="num">
                    <button type="button" className="btn" onClick={() => router.push(`${routeOf(1101)}?id=${s.id}`)}>
                      Open
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={7} className="table-empty">
                    {r.loading ? "Loading…" : "No statement uploaded yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
      {uploading ? (
        <UploadDialog
          onClose={() => setUploading(false)}
          onDone={(sid) => {
            setUploading(false);
            router.push(`${routeOf(1101)}?id=${sid}`);
          }}
        />
      ) : null}
    </>
  );
}

// ---------- reading the bank's file ----------

const FIELDS = ["date", "description", "reference", "debit", "credit", "balance"] as const;
type Field = (typeof FIELDS)[number];
const LABEL: Record<Field, string> = { date: "Date", description: "Description", reference: "Reference / cheque no.", debit: "Withdrawal (money out)", credit: "Deposit (money in)", balance: "Balance" };
const GUESS: Record<Field, RegExp> = {
  date: /^(txn|transaction|value|tran|posting)?\s*date|^date/i,
  description: /narration|description|particulars|details|remarks/i,
  reference: /ref|chq|cheque|check|instrument/i,
  debit: /withdrawal|debit|^dr\b|paid out|amount out/i,
  credit: /deposit|credit|^cr\b|paid in|amount in/i,
  balance: /balance/i,
};

function splitRow(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function UploadDialog({ onClose, onDone }: { onClose: () => void; onDone: (id: number) => void }) {
  const [bank, setBank] = useState("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [map, setMap] = useState<Partial<Record<Field, number>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) return null;
    // the header is the first line naming a date and an amount column
    const hi = lines.findIndex((l) => /date/i.test(l) && /(debit|credit|withdrawal|deposit|amount)/i.test(l));
    const header = hi >= 0 ? splitRow(lines[hi]) : [];
    const body = (hi >= 0 ? lines.slice(hi + 1) : lines).map(splitRow).filter((r) => r.some((c) => c));
    const guess: Partial<Record<Field, number>> = {};
    FIELDS.forEach((f) => {
      const i = header.findIndex((h, n) => GUESS[f].test(h) && !Object.values(guess).includes(n));
      if (i >= 0) guess[f] = i;
    });
    return { header, body, guess };
  }, [text]);
  const cols = { ...(parsed?.guess ?? {}), ...map };
  const cell = (r: string[], f: Field) => (cols[f] === undefined ? "" : r[cols[f]!] ?? "");
  const rows = (parsed?.body ?? []).map((r) => Object.fromEntries(FIELDS.map((f) => [f, cell(r, f)])) as Record<Field, string>);

  async function readFile(f: File | undefined) {
    if (!f) return;
    setFileName(f.name);
    setText(await f.text());
    setMap({});
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (cols.date === undefined || (cols.debit === undefined && cols.credit === undefined)) return setError("Choose at least the Date column and the money-in or money-out column.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Statement & { skipped: string[] }>(`${BASE}/statements`, { account_name: bank.trim() || "Bank account", file_name: fileName, rows });
      notify(`${r.counts.lines} lines read; ${r.counts.matched} matched to the books by themselves.${r.skipped.length ? ` ${r.skipped.length} rows skipped.` : ""}`);
      onDone(r.id);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title="Upload a bank statement"
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !rows.length}>
            {busy ? "Reading…" : `Upload ${rows.length} line${rows.length === 1 ? "" : "s"}`}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <div className="form-grid">
        <label className="field">
          <span>Bank account</span>
          <input value={bank} maxLength={120} onChange={(e) => setBank(e.target.value)} placeholder="e.g. SBI Kukatpally current account" />
        </label>
        <label className="field">
          <span>Statement file (CSV)</span>
          <input type="file" accept=".csv,.txt" onChange={(e) => readFile(e.target.files?.[0])} />
        </label>
      </div>
      <label className="field" style={{ marginTop: 10 }}>
        <span>…or paste the rows from the bank's Excel, with the heading row</span>
        <textarea className="prev-paste" rows={6} value={text} onChange={(e) => { setText(e.target.value); setFileName(null); setMap({}); }} placeholder={"Txn Date\tDescription\tRef No\tDebit\tCredit\tBalance\n07/10/2026\tUPI/CR/628011/PARI AGARWAL\t628011\t\t107000.00\t107000.00"} />
      </label>
      {parsed ? (
        <>
          <div className="bank-map">
            {FIELDS.map((f) => (
              <label key={f} className="field">
                <span>{LABEL[f]}</span>
                <select value={cols[f] ?? ""} onChange={(e) => setMap({ ...map, [f]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                  <option value="">—</option>
                  {(parsed.header.length ? parsed.header : (parsed.body[0] ?? []).map((_, i) => `Column ${i + 1}`)).map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <table className="data-table bank-preview">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th className="num">Out</th>
                <th className="num">In</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((r, i) => (
                <tr key={i}>
                  <td>{r.date}</td>
                  <td className="wrap">{r.description}</td>
                  <td className="num">{r.debit}</td>
                  <td className="num">{r.credit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">{`${rows.length} rows · showing the first ${Math.min(5, rows.length)}. Rows without an amount (opening balance, totals) are skipped.`}</p>
        </>
      ) : null}
    </Dialog>
  );
}

// ---------- one statement ----------

function StatementView({ id }: { id: string }) {
  const router = useRouter();
  const r = useApi<Statement>(`${BASE}/statements/${id}`);
  const [show, setShow] = useState<"unmatched" | "all" | "matched" | "ignored">("unmatched");
  const [matching, setMatching] = useState<Line | null>(null);
  const [error, setError] = useState<string | null>(null);
  const d = r.data;
  if (!d) return r.error ? <ErrorNote>{r.error}</ErrorNote> : <Loading what="Loading the statement…" />;
  const rec = d.reconciliation;
  const lines = d.lines.filter((l) => show === "all" || l.status === show);

  async function act(path: string, body: object, done: string) {
    setError(null);
    try {
      await api.post(path, body);
      notify(done);
      r.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function setAside(l: Line) {
    const reason = await askText(`Set aside ${money(Number(l.debit) || Number(l.credit))} (${l.description})? Use this for a bank movement these books will never carry, such as a transfer to the school's own fixed deposit.`, { placeholder: "Why", required: true });
    if (reason) act(`${BASE}/lines/${l.id}/ignore`, { reason }, "Line set aside.");
  }

  async function remove() {
    if (!(await ask(`Remove this statement (${d!.account_name}, ${date(d!.period_from)} – ${date(d!.period_to)})? Vouchers recorded from it stay in the books.`))) return;
    try {
      await api.delete(`${BASE}/statements/${id}`);
      notify("Statement removed.");
      router.push(routeOf(1101));
    } catch (e) {
      setError(errorText(e));
    }
  }

  const diff = rec.difference === null ? null : Number(rec.difference);
  return (
    <>
      <div className="filterbar">
        <button type="button" className="btn text" onClick={() => router.push(routeOf(1101))}>
          ← All statements
        </button>
        <strong style={{ flex: 1 }}>{`${d.account_name} · ${date(d.period_from)} – ${date(d.period_to)}`}</strong>
        <button type="button" className="btn" onClick={() => act(`${BASE}/statements/${id}/auto-match`, {}, "Matched what could be matched.")}>
          <Icon name="check" className="sm" />
          Auto-match
        </button>
        <button type="button" className="btn text rc-cancel" onClick={remove}>
          Remove statement
        </button>
      </div>
      <StatStrip
        compact
        items={[
          { label: "Lines", value: String(d.counts.lines), note: `${d.counts.matched} matched · ${d.counts.ignored} set aside` },
          { label: "Still to match", value: String(d.counts.unmatched), note: d.counts.unmatched ? "Match, record or set aside" : "Every line accounted for" },
          { label: "In the books, not the bank", value: String(d.open_book_items.length), note: "Timing: the bank shows them later" },
          { label: "Difference", value: diff === null ? "—" : money(diff), note: diff === null ? "No closing balance on the statement" : diff === 0 ? "Reconciled" : "Unexplained: look for a missing or wrong entry" },
        ]}
      />
      <ErrorNote>{error}</ErrorNote>
      <div className="bank-grid">
        <Panel title="Bank statement" flush action={
          <select aria-label="Show" value={show} onChange={(e) => setShow(e.target.value as typeof show)}>
            <option value="unmatched">To match</option>
            <option value="all">All lines</option>
            <option value="matched">Matched</option>
            <option value="ignored">Set aside</option>
          </select>
        }>
          <div className="table-wrap">
            <table className="data-table bank-lines">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th className="num">Out</th>
                  <th className="num">In</th>
                  <th>Matched to</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const out = Number(l.debit) > 0;
                  return (
                    <tr key={l.id} className={`st-${l.status}`}>
                      <td>{date(l.date)}</td>
                      <td className="wrap">
                        {l.description}
                        {l.reference ? <small className="muted" style={{ display: "block" }}>{`Ref ${l.reference}`}</small> : null}
                      </td>
                      <td className="num">{out ? money(l.debit) : ""}</td>
                      <td className="num">{!out ? money(l.credit) : ""}</td>
                      <td className="wrap">
                        {l.status === "matched" ? (
                          <>
                            {l.matches.map((m) => (
                              <small key={m.key} style={{ display: "block" }}>{`${m.source_label}${m.voucher ? ` ${m.voucher}` : ""}${m.date ? ` · ${date(m.date)}` : ""}`}</small>
                            ))}
                            <button type="button" className="btn text" onClick={() => act(`${BASE}/lines/${l.id}/unmatch`, {}, "Match undone.")}>
                              Undo
                            </button>
                          </>
                        ) : l.status === "ignored" ? (
                          <>
                            <small className="muted">{`Set aside: ${l.note}`}</small>
                            <button type="button" className="btn text" onClick={() => act(`${BASE}/lines/${l.id}/unmatch`, {}, "Back in the list to match.")}>
                              Undo
                            </button>
                          </>
                        ) : (
                          <div className="bank-acts">
                            <button type="button" className="btn" onClick={() => setMatching(l)}>
                              Match…
                            </button>
                            <button
                              type="button"
                              className="btn text"
                              onClick={() => act(`${BASE}/lines/${l.id}/record`, { kind: out ? "charges" : "interest" }, out ? "Recorded as bank charges and matched." : "Recorded as interest received and matched.")}
                            >
                              {out ? "Bank charges" : "Interest"}
                            </button>
                            <button type="button" className="btn text" onClick={() => setAside(l)}>
                              Set aside
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!lines.length ? (
                  <tr>
                    <td colSpan={5} className="table-empty">
                      {show === "unmatched" ? "Nothing left to match." : "No lines here."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="stack">
          <Panel title="Reconciliation" sub={`At ${date(d.period_to)}`}>
            <dl className="bank-rec">
              <dt>Balance as per books</dt>
              <dd>{money(rec.books_balance)}</dd>
              <dt>Less: receipts in the books, not yet in the bank</dt>
              <dd>{`− ${money(rec.receipts_not_in_bank)}`}</dd>
              <dt>Add: payments in the books, not yet out of the bank</dt>
              <dd>{`+ ${money(rec.payments_not_in_bank)}`}</dd>
              <dt>Add: bank credits not in the books</dt>
              <dd>{`+ ${money(rec.bank_credits_not_in_books)}`}</dd>
              <dt>Less: bank debits not in the books</dt>
              <dd>{`− ${money(rec.bank_debits_not_in_books)}`}</dd>
              {Number(rec.set_aside) ? (
                <>
                  <dt>Lines set aside</dt>
                  <dd>{money(rec.set_aside)}</dd>
                </>
              ) : null}
              <dt className="total">Balance as per bank (worked out)</dt>
              <dd className="total">{money(rec.expected_bank_balance)}</dd>
              <dt>Balance on the statement</dt>
              <dd>{rec.statement_balance === null ? "—" : money(rec.statement_balance)}</dd>
              <dt className={diff ? "bad" : "good"}>Difference</dt>
              <dd className={diff ? "bad" : "good"}>{diff === null ? "—" : diff === 0 ? "₹0 · reconciled" : money(diff)}</dd>
            </dl>
          </Panel>
          <Panel title="In the books, not in the bank yet" sub="Cheques not yet presented, deposits in transit, or an entry to check" flush>
            <div className="table-wrap">
              <table className="data-table">
                <tbody>
                  {d.open_book_items.map((i) => (
                    <tr key={i.key}>
                      <td>{i.date ? date(i.date) : ""}</td>
                      <td className="wrap">
                        {i.narration}
                        <small className="muted" style={{ display: "block" }}>{`${i.source_label}${i.voucher ? ` · ${i.voucher}` : ""}`}</small>
                      </td>
                      <td className="num">{`${i.direction === "in" ? "+" : "−"} ${money(i.amount)}`}</td>
                    </tr>
                  ))}
                  {!d.open_book_items.length ? (
                    <tr>
                      <td className="table-empty">Every bank entry in the books is on the statement.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
      {matching ? (
        <MatchDialog
          line={matching}
          items={d.open_book_items}
          onClose={() => setMatching(null)}
          onSaved={() => {
            setMatching(null);
            notify("Matched.");
            r.reload();
          }}
        />
      ) : null}
    </>
  );
}

function MatchDialog({ line, items, onClose, onSaved }: { line: Line; items: Item[]; onClose: () => void; onSaved: () => void }) {
  const out = Number(line.debit) > 0;
  const amount = out ? Number(line.debit) : Number(line.credit);
  const options = items.filter((i) => i.direction === (out ? "out" : "in"));
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sum = options.filter((i) => picked.includes(i.key)).reduce((t, i) => t + Number(i.amount), 0);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`${BASE}/lines/${line.id}/match`, { keys: picked });
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      wide
      title={`Match ${money(amount)} ${out ? "out" : "in"} on ${date(line.date)}`}
      onClose={onClose}
      onSubmit={save}
      actions={
        <>
          <span className={`muted small ${Math.abs(sum - amount) < 0.005 ? "" : "bank-off"}`} style={{ marginRight: "auto" }}>{`Chosen ${money(sum)} of ${money(amount)}`}</span>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !picked.length || Math.abs(sum - amount) >= 0.005}>
            {busy ? "Matching…" : "Match"}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      <p className="muted small" style={{ marginBottom: 8 }}>{line.description}</p>
      {options.length ? (
        <table className="data-table">
          <tbody>
            {options.map((i) => (
              <tr key={i.key}>
                <td className="checkcell">
                  <input type="checkbox" aria-label={i.narration} checked={picked.includes(i.key)} onChange={(e) => setPicked(e.target.checked ? [...picked, i.key] : picked.filter((k) => k !== i.key))} />
                </td>
                <td>{i.date ? date(i.date) : ""}</td>
                <td className="wrap">
                  {i.narration}
                  <small className="muted" style={{ display: "block" }}>{`${i.source_label}${i.voucher ? ` · ${i.voucher}` : ""}`}</small>
                </td>
                <td className="num">{money(i.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">{`Nothing ${out ? "paid out" : "received"} in the books around these dates is waiting to be matched. If the books don't have it, close this and use ${out ? "Bank charges" : "Interest"} or Set aside.`}</p>
      )}
    </Dialog>
  );
}
