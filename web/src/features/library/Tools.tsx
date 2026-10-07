"use client";

/*
 * The librarian's bulk work:
 *   ImportBooksButton   POST /library/import (dry_run first, then save the good rows)
 *   LabelsButton        GET  /library/labels.pdf (a book, a range of accession numbers, or copies added since)
 *   RemindOverdueButton POST /library/overdue-reminders
 *   StockCheck (NEW-103) GET/POST /library/stock-checks…: scan the shelves, see what is missing
 */

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote, Loading } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { ask } from "@/lib/dialog";
import { date, dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { LIB } from "./Catalogue";

// ---------- import ----------

const FIELDS = ["title", "authors", "isbn", "publisher", "edition", "publish_year", "category", "language", "shelf", "copies", "accession_nos", "price"] as const;
type Field = (typeof FIELDS)[number];
const LABEL: Record<Field, string> = {
  title: "Title", authors: "Author", isbn: "ISBN", publisher: "Publisher", edition: "Edition", publish_year: "Year",
  category: "Category", language: "Language", shelf: "Shelf", copies: "Copies", accession_nos: "Accession nos.", price: "Price",
};
const GUESS: Record<Field, RegExp> = {
  title: /^(book\s*)?(title|name)/i, authors: /author|writer/i, isbn: /isbn/i, publisher: /publisher/i, edition: /edition/i,
  publish_year: /year/i, category: /category|subject|genre/i, language: /language|lang/i, shelf: /shelf|rack|location/i,
  copies: /cop(y|ies)|qty|quantity|count/i, accession_nos: /accession|acc\.?\s*no|barcode/i, price: /price|cost|amount/i,
};
type ImportResult = {
  summary: { rows: number; good: number; with_errors: number; new_titles: number; copies: number; saved?: boolean };
  rows: { row: number; title: string; authors: string | null; copies: number; accession_nos: string[]; existing_book_id: number | null; same_as_row: number | null; errors: string[] }[];
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

const TEMPLATE = "Title,Author,ISBN,Publisher,Year,Category,Shelf,Copies,Accession nos.,Price\nWings of Fire,A P J Abdul Kalam,9788173711466,Universities Press,1999,Biography,B2,3,,250\n";

export function ImportBooksButton({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Icon name="file" className="sm" />
        Import books
      </button>
      {open ? (
        <ImportDialog
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            // the button sits in the page head, apart from the list it fills: reload it
            if (onDone) onDone();
            else window.location.reload();
          }}
        />
      ) : null}
    </>
  );
}

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [map, setMap] = useState<Partial<Record<Field, number>>>({});
  const [check, setCheck] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return null;
    const header = splitRow(lines[0]);
    const body = lines.slice(1).map(splitRow).filter((r) => r.some((c) => c));
    const guess: Partial<Record<Field, number>> = {};
    FIELDS.forEach((f) => {
      const i = header.findIndex((h, n) => GUESS[f].test(h) && !Object.values(guess).includes(n));
      if (i >= 0) guess[f] = i;
    });
    return { header, body, guess };
  }, [text]);
  const cols = { ...(parsed?.guess ?? {}), ...map };
  const rows = (parsed?.body ?? []).map((r) => Object.fromEntries(FIELDS.map((f) => [f, cols[f] === undefined ? "" : r[cols[f]!] ?? ""])));

  async function readFile(f: File | undefined) {
    if (!f) return;
    setText(await f.text());
    setMap({});
    setCheck(null);
  }

  async function run(dry: boolean) {
    if (cols.title === undefined) return setError("Choose which column holds the title.");
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<ImportResult>(`${LIB}/import`, { rows, dry_run: dry });
      if (dry) setCheck(r);
      else {
        notify(`${r.summary.good} rows imported: ${r.summary.new_titles} new titles, ${r.summary.copies} copies.`);
        onDone();
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function template() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
    a.download = "library-books-template.csv";
    a.click();
  }

  const bad = check?.rows.filter((r) => r.errors.length) ?? [];
  return (
    <Dialog
      open
      wide
      title="Import books"
      onClose={onClose}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void run(!check);
      }}
      actions={
        <>
          <button type="button" className="btn text" style={{ marginRight: "auto" }} onClick={template}>
            Download a template
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy || !rows.length || (check !== null && !check.summary.good)}>
            {busy ? "Working…" : check ? `Import ${check.summary.good} row${check.summary.good === 1 ? "" : "s"}` : `Check ${rows.length} row${rows.length === 1 ? "" : "s"}`}
          </button>
        </>
      }
    >
      <ErrorNote>{error}</ErrorNote>
      {!check ? (
        <>
          <p className="muted small" style={{ marginBottom: 8 }}>
            One row per title, with a heading row. A title already in the catalogue (same ISBN, or title and author) gets the new copies. Copies are numbered on from your series unless the sheet gives accession numbers.
          </p>
          <label className="field">
            <span>Spreadsheet saved as CSV</span>
            <input type="file" accept=".csv,.txt" onChange={(e) => readFile(e.target.files?.[0])} />
          </label>
          <label className="field" style={{ marginTop: 8 }}>
            <span>…or paste the rows from Excel, with the heading row</span>
            <textarea className="prev-paste" rows={5} value={text} onChange={(e) => { setText(e.target.value); setMap({}); }} />
          </label>
          {parsed ? (
            <div className="bank-map">
              {FIELDS.map((f) => (
                <label key={f} className="field">
                  <span>{LABEL[f]}</span>
                  <select value={cols[f] ?? ""} onChange={(e) => setMap({ ...map, [f]: e.target.value === "" ? undefined : Number(e.target.value) })}>
                    <option value="">—</option>
                    {parsed.header.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p style={{ marginBottom: 8 }}>
            <b>{`${check.summary.good} of ${check.summary.rows} rows are ready`}</b>
            {` · ${check.summary.new_titles} new titles · ${check.summary.copies} copies`}
            {bad.length ? <span className="muted">{` · ${bad.length} rows will be left out`}</span> : null}
          </p>
          <div className="table-wrap" style={{ maxHeight: 340, overflow: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th className="num">Row</th>
                  <th>Title</th>
                  <th className="num">Copies</th>
                  <th>What happens</th>
                </tr>
              </thead>
              <tbody>
                {check.rows.map((r) => (
                  <tr key={r.row}>
                    <td className="num">{r.row}</td>
                    <td className="wrap">
                      {r.title || "—"}
                      {r.authors ? <small className="muted" style={{ display: "block" }}>{r.authors}</small> : null}
                    </td>
                    <td className="num">{r.copies}</td>
                    <td className="wrap">
                      {r.errors.length ? (
                        <span className="bank-off">{r.errors.join("; ")}</span>
                      ) : r.existing_book_id ? (
                        "Adds copies to the book already in the catalogue"
                      ) : r.same_as_row ? (
                        `Adds copies to row ${r.same_as_row}`
                      ) : (
                        "New title"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn text" onClick={() => setCheck(null)}>
            ← Change the sheet
          </button>
        </>
      )}
    </Dialog>
  );
}

// ---------- labels ----------

export function LabelsButton({ bookId }: { bookId?: number }) {
  const [open, setOpen] = useState(false);
  const [how, setHow] = useState<"range" | "since" | "book">(bookId ? "book" : "since");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [since, setSince] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function print(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const params = how === "book" ? { book_id: bookId } : how === "range" ? { from_no: from.trim() || undefined, to_no: to.trim() || undefined } : { since };
      await api.open(`${LIB}/labels.pdf`, params);
      setOpen(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <Icon name="download" className="sm" />
        Print labels
      </button>
      {open ? (
        <Dialog
          open
          title="Print spine and barcode labels"
          onClose={() => setOpen(false)}
          onSubmit={print}
          actions={
            <>
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn primary" disabled={busy}>
                {busy ? "Preparing…" : "Open the labels"}
              </button>
            </>
          }
        >
          <ErrorNote>{error}</ErrorNote>
          <p className="muted small" style={{ marginBottom: 8 }}>24 labels to an A4 sticker sheet (3 × 8, 63.5 × 33.9 mm): title, barcode, accession number and shelf.</p>
          <div className="form-grid">
            <label className="field">
              <span>Which copies</span>
              <select value={how} onChange={(e) => setHow(e.target.value as typeof how)}>
                {bookId ? <option value="book">Every copy of this book</option> : null}
                <option value="since">Copies added since a date</option>
                <option value="range">A range of accession numbers</option>
              </select>
            </label>
            {how === "since" ? (
              <label className="field">
                <span>Added on or after</span>
                <input type="date" value={since} onChange={(e) => setSince(e.target.value)} required />
              </label>
            ) : null}
            {how === "range" ? (
              <>
                <label className="field">
                  <span>From</span>
                  <input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="A000001" maxLength={40} />
                </label>
                <label className="field">
                  <span>To</span>
                  <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="A000100" maxLength={40} />
                </label>
              </>
            ) : null}
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

// ---------- overdue reminders ----------

export function RemindOverdueButton() {
  const [busy, setBusy] = useState(false);
  async function remind() {
    if (!(await ask("Send every family with an overdue library book a notice in the parent app (book, days late, fine so far)? Staff with overdue books get an in-app notice."))) return;
    setBusy(true);
    try {
      const r = await api.post<{ books: number; families_told: number; staff_told: number }>(`${LIB}/overdue-reminders`);
      notify(r.books ? `Reminders sent: ${r.families_told} families and ${r.staff_told} staff, for ${r.books} overdue books.` : "No books are overdue.");
    } catch (e) {
      notify(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="btn" onClick={remind} disabled={busy}>
      <Icon name="bell" className="sm" />
      {busy ? "Sending…" : "Remind overdue"}
    </button>
  );
}

// ---------- stock check ----------

type Item = { copy_id: number; accession_no: string; title: string; authors: string | null; shelf: string | null; status: string };
type Check = {
  id: number; started_at: string; closed_at: string | null; note: string | null;
  counts: { copies: number; scanned: number; missing: number; on_loan: number; found_lost: number; found_on_loan: number; unknown: number };
  missing: Item[]; on_loan: Item[]; found_lost: Item[]; found_on_loan: Item[]; unknown: string[];
  recent: { accession_no: string; known: boolean; shelf: string | null }[];
};
type CheckRow = { id: number; started_at: string; closed_at: string | null; note: string | null; scanned: number };

/** NEW-103, live: the yearly stock check. Start one, scan the shelves, see what is missing. */
export function StockCheck() {
  const list = useApi<CheckRow[]>(`${LIB}/stock-checks`);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = list.data?.find((c) => !c.closed_at);
  const shown = openId ?? current?.id ?? null;

  async function start() {
    const note = `Stock check ${new Date().getFullYear()}`;
    setError(null);
    try {
      const c = await api.post<Check>(`${LIB}/stock-checks`, { note });
      list.reload();
      setOpenId(c.id);
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (!list.data) return list.error ? <ErrorNote>{list.error}</ErrorNote> : <Loading what="Loading stock checks…" />;
  return (
    <>
      <ErrorNote>{error}</ErrorNote>
      <div className="filterbar">
        <select aria-label="Stock check" style={{ minWidth: 280 }} value={shown ?? ""} onChange={(e) => setOpenId(e.target.value ? Number(e.target.value) : null)}>
          {!list.data.length ? <option value="">No stock check yet</option> : null}
          {list.data.map((c) => (
            <option key={c.id} value={c.id}>
              {`${c.note ?? "Stock check"} · ${date(c.started_at)}${c.closed_at ? " · closed" : " · open"}`}
            </option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        {!current ? (
          <button type="button" className="btn primary" onClick={start}>
            <Icon name="plus" className="sm" />
            Start a stock check
          </button>
        ) : null}
      </div>
      {shown ? (
        <CheckView key={shown} id={shown} onChange={list.reload} />
      ) : (
        <Panel>
          <p className="muted">Start a stock check, then scan or type the accession number of every book on the shelves. The check shows which copies are missing, which are out on loan, and which turned up after being written off.</p>
        </Panel>
      )}
    </>
  );
}

function CheckView({ id, onChange }: { id: number; onChange: () => void }) {
  const r = useApi<Check>(`${LIB}/stock-checks/${id}`);
  const [code, setCode] = useState("");
  const [shelf, setShelf] = useState("");
  const [many, setMany] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"missing" | "on_loan" | "found_lost" | "found_on_loan" | "unknown">("missing");
  const [picked, setPicked] = useState<number[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const d = r.data;
  if (!d) return r.error ? <ErrorNote>{r.error}</ErrorNote> : <Loading what="Loading the check…" />;
  const closed = !!d.closed_at;

  async function send(nos: string[]) {
    if (!nos.length) return;
    setError(null);
    try {
      const res = await api.post<{ added: number; already_scanned: number; unknown: string[] }>(`${LIB}/stock-checks/${id}/scans`, { accession_nos: nos, shelf: shelf.trim() || undefined });
      setMsg([res.added ? `${res.added} scanned` : null, res.already_scanned ? `${res.already_scanned} already scanned` : null, res.unknown.length ? `not in the catalogue: ${res.unknown.join(", ")}` : null].filter(Boolean).join(" · "));
      r.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function act(path: string, ok: string) {
    setError(null);
    try {
      await api.post(`${LIB}/stock-checks/${id}/${path}`, path === "close" ? {} : { copy_ids: picked });
      notify(ok);
      setPicked([]);
      r.reload();
      onChange();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const lists: Record<typeof tab, Item[]> = { missing: d.missing, on_loan: d.on_loan, found_lost: d.found_lost, found_on_loan: d.found_on_loan, unknown: [] };
  const rows = lists[tab];
  const TABS: [typeof tab, string, number][] = [
    ["missing", "Missing", d.counts.missing], ["on_loan", "Out on loan", d.counts.on_loan], ["found_lost", "Found, was lost", d.counts.found_lost],
    ["found_on_loan", "On the shelf, shown on loan", d.counts.found_on_loan], ["unknown", "Not in the catalogue", d.counts.unknown],
  ];
  return (
    <>
      <StatStrip
        compact
        items={[
          { label: "Scanned", value: String(d.counts.scanned), note: `of ${d.counts.copies} copies in the catalogue` },
          { label: "Missing", value: String(d.counts.missing), note: "Not scanned and not on loan" },
          { label: "Out on loan", value: String(d.counts.on_loan), note: "Away with members, as expected" },
          { label: "Status", value: closed ? "Closed" : "Open", note: closed ? `Closed ${dateTime(d.closed_at!)}` : `Started ${dateTime(d.started_at)}` },
        ]}
      />
      <ErrorNote>{error}</ErrorNote>
      {!closed ? (
        <Panel title="Scan the shelves" sub="A barcode scanner types the number and presses Enter; or type it yourself">
          <form
            className="filterbar"
            onSubmit={(e) => {
              e.preventDefault();
              const v = code.trim();
              setCode("");
              void send(v ? [v] : []);
              input.current?.focus();
            }}
          >
            <input ref={input} autoFocus aria-label="Accession number" placeholder="Accession number" value={code} onChange={(e) => setCode(e.target.value)} maxLength={40} />
            <input aria-label="Shelf" placeholder="Shelf (optional)" value={shelf} onChange={(e) => setShelf(e.target.value)} maxLength={40} style={{ maxWidth: 140 }} />
            <button type="submit" className="btn primary">
              Add
            </button>
            <span className="muted small" style={{ flex: 1 }}>{msg}</span>
            <button type="button" className="btn text" onClick={() => act("close", "Stock check closed.")}>
              Finish the check
            </button>
          </form>
          <details>
            <summary className="muted small">Paste many numbers at once</summary>
            <textarea className="prev-paste" rows={3} value={many} onChange={(e) => setMany(e.target.value)} placeholder="A000001 A000002 …" />
            <button
              type="button"
              className="btn"
              onClick={() => {
                void send(many.split(/[\s,;]+/).filter(Boolean));
                setMany("");
              }}
            >
              Add these
            </button>
          </details>
        </Panel>
      ) : null}
      <Panel
        flush
        title="Copies"
        action={
          <div className="bank-acts">
            {tab === "missing" && picked.length ? (
              <button type="button" className="btn" onClick={() => act("mark-lost", `${picked.length} copies written off as lost.`)}>
                {`Write off ${picked.length} as lost`}
              </button>
            ) : tab === "found_lost" && picked.length ? (
              <button type="button" className="btn" onClick={() => act("mark-found", `${picked.length} copies back in stock.`)}>
                {`Put ${picked.length} back in stock`}
              </button>
            ) : null}
            <select aria-label="Show" value={tab} onChange={(e) => { setTab(e.target.value as typeof tab); setPicked([]); }}>
              {TABS.map(([k, l, n]) => (
                <option key={k} value={k}>{`${l} (${n})`}</option>
              ))}
            </select>
          </div>
        }
      >
        <div className="table-wrap">
          <table className="data-table">
            <tbody>
              {tab === "unknown"
                ? d.unknown.map((a) => (
                    <tr key={a}>
                      <td>{a}</td>
                      <td className="muted">Scanned but not in the catalogue: add the book, or check the label</td>
                    </tr>
                  ))
                : rows.map((i) => (
                    <tr key={i.copy_id}>
                      {(tab === "missing" || tab === "found_lost") && !closed ? (
                        <td className="checkcell">
                          <input type="checkbox" aria-label={i.accession_no} checked={picked.includes(i.copy_id)} onChange={(e) => setPicked(e.target.checked ? [...picked, i.copy_id] : picked.filter((x) => x !== i.copy_id))} />
                        </td>
                      ) : null}
                      <td>{i.accession_no}</td>
                      <td className="wrap">
                        {i.title}
                        {i.authors ? <small className="muted" style={{ display: "block" }}>{i.authors}</small> : null}
                      </td>
                      <td>{i.shelf ? `Shelf ${i.shelf}` : ""}</td>
                    </tr>
                  ))}
              {(tab === "unknown" ? !d.unknown.length : !rows.length) ? (
                <tr>
                  <td className="table-empty">Nothing here.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
