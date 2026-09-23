"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState, type FormEvent } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote, Loading, PickFirst } from "@/components/ui/states";
import { api, errorText } from "@/lib/api";
import { date, label, money, pct } from "@/lib/format";
import { notify } from "@/lib/notify";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { Field, Kv, Modal, ModalActions, SearchBox, addDays, formNum, formText, n, today, useDebounced } from "@/features/transport/kit";
import type { Book, BookDetail, Copy, CopyStatus, Fines, Loan, LibraryUsage, Member } from "./types";

export const LIB = "/api/v1/school/library";

const availability = (b: Book) => (!b.is_active ? "Withdrawn" : b.available_copies > 0 ? "Available" : b.total_copies ? "Issued" : "No copies");

/** SCR-198, live: GET /library/books (q, category, available_only) and /library/dashboard. */
export function CatalogueBrowser() {
  const [typed, setTyped] = useState("");
  const q = useDebounced(typed.trim());
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const categories = useApi<string[]>(`${LIB}/categories`);
  const dash = useApi<{ titles: number; copies: number; on_loan: number; overdue: number }>(`${LIB}/dashboard`);
  const books = useApi<Book[]>(`${LIB}/books`, { q, category, available_only: status === "available" || undefined, include_inactive: status === "withdrawn" || undefined });
  const items = (books.data ?? []).filter((b) => status !== "withdrawn" || !b.is_active);
  const d = dash.data;
  const stats = [
    { label: "Book titles", value: n(d?.titles), note: "Across all categories" },
    { label: "Total copies", value: n(d?.copies), note: "Physical books" },
    { label: "Available", value: books.data && !q && !category && !status ? n(books.data.reduce((t, b) => t + b.available_copies, 0)) : "—", note: "Ready to borrow" },
    { label: "Issued", value: n(d?.on_loan), note: d ? `With members · ${d.overdue} overdue` : "With members" },
  ];
  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <SearchBox value={typed} onChange={setTyped} placeholder="Search by title, author or ISBN…" />
        <select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All books</option>
          <option value="available">Available now</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
      </div>
      <ErrorNote>{books.error ?? dash.error}</ErrorNote>
      <Panel title="Browse books" sub={books.data ? `${items.length} title(s)` : "Loading…"}>
        {items.length ? (
          <div className="book-grid">
            {items.map((b, i) => (
              <article className="book-card" key={b.id}>
                <div className={`book-cover c${i % 4}`}>
                  {b.title}
                  <small>{b.authors ?? ""}</small>
                </div>
                <div>
                  <h3>{b.title}</h3>
                  <p>{b.authors ?? "—"}</p>
                  <p>{[b.category, b.shelf ? `Shelf ${b.shelf}` : null].filter(Boolean).join(" · ") || "—"}</p>
                  <Badge>{`${availability(b)}${b.total_copies ? ` · ${b.available_copies}/${b.total_copies}` : ""}`}</Badge>
                  <br />
                  <Link href={`${routeOf(200)}?id=${b.id}`} className="btn">
                    View book
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">{books.loading ? "Loading books…" : "No books match. Try a different search."}</p>
        )}
      </Panel>
    </>
  );
}

/** SCR-199, live: POST /library/books (with first copies), or GET + PATCH /library/books/{id} (?id=). */
export function BookForm() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const existing = useApi<BookDetail>(id ? `${LIB}/books/${id}` : null);
  const categories = useApi<string[]>(`${LIB}/categories`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (id && existing.loading && !existing.data) return <Loading what="Loading the book…" />;
  const b = existing.data;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      title: formText(f, "title"),
      authors: formText(f, "authors"),
      isbn: formText(f, "isbn"),
      category: formText(f, "category"),
      publisher: formText(f, "publisher"),
      edition: formText(f, "edition"),
      publish_year: formNum(f, "publish_year"),
      language: formText(f, "language"),
      shelf: formText(f, "shelf"),
      digital_url: formText(f, "digital_url"),
      description: formText(f, "description"),
      is_reference: f.get("is_reference") === "on",
    };
    setSaving(true);
    setError(null);
    try {
      if (id) {
        await api.patch(`${LIB}/books/${id}`, { ...body, is_active: f.get("status") !== "withdrawn" });
        notify("Book saved.");
        router.push(`${routeOf(200)}?id=${id}`);
      } else {
        const created = await api.post<BookDetail>(`${LIB}/books`, { ...body, copies: formNum(f, "copies") ?? 0, price: formText(f, "price") });
        notify(`Added “${created.title}” with ${created.total_copies} cop(ies).`);
        router.push(`${routeOf(200)}?id=${created.id}`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="two-col">
      <form id="book-form" className="panel" onSubmit={submit}>
        <div className="panel-pad">
          <ErrorNote>{error ?? existing.error}</ErrorNote>
          <div className="form-sections">
            <section>
              <div className="form-section-title">
                <span className="number">01</span>
                <h3>Details</h3>
              </div>
              <div className="form-grid">
                <Field label="Book title" required>
                  <input name="title" required defaultValue={b?.title ?? ""} placeholder="Enter book title" />
                </Field>
                <Field label="Author">
                  <input name="authors" defaultValue={b?.authors ?? ""} placeholder="Enter author" />
                </Field>
                <Field label="ISBN">
                  <input name="isbn" defaultValue={b?.isbn ?? ""} placeholder="Enter ISBN" />
                </Field>
                <Field label="Category">
                  <input name="category" list="lib-categories" defaultValue={b?.category ?? ""} placeholder="Enter category" />
                  <datalist id="lib-categories">
                    {categories.data?.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </Field>
                <Field label="Publisher">
                  <input name="publisher" defaultValue={b?.publisher ?? ""} placeholder="Enter publisher" />
                </Field>
                <Field label="Edition">
                  <input name="edition" defaultValue={b?.edition ?? ""} placeholder="Enter edition" />
                </Field>
              </div>
            </section>
            <section>
              <div className="form-section-title">
                <span className="number">02</span>
                <h3>Copies & additional information</h3>
              </div>
              <div className="form-grid">
                <Field label="Publication year">
                  <input name="publish_year" type="number" min={1000} max={2100} defaultValue={b?.publish_year ?? ""} />
                </Field>
                {id ? (
                  <Field label="Status">
                    <select name="status" defaultValue={b?.is_active === false ? "withdrawn" : "active"}>
                      <option value="active">In catalogue</option>
                      <option value="withdrawn">Withdrawn</option>
                    </select>
                  </Field>
                ) : (
                  <Field label="Number of copies">
                    <input name="copies" type="number" min={0} max={200} defaultValue={1} />
                  </Field>
                )}
                <Field label="Shelf location">
                  <input name="shelf" defaultValue={b?.shelf ?? ""} placeholder="e.g. A-03" />
                </Field>
                {id ? (
                  <Field label="Language">
                    <input name="language" defaultValue={b?.language ?? ""} />
                  </Field>
                ) : (
                  <Field label="Price per copy (₹)">
                    <input name="price" type="number" min={0} step="0.01" placeholder="Enter price" />
                  </Field>
                )}
                {id ? null : (
                  <Field label="Language">
                    <input name="language" defaultValue="English" />
                  </Field>
                )}
                <Field label="Digital link">
                  <input name="digital_url" type="url" defaultValue={b?.digital_url ?? ""} placeholder="https://… (e-book or resource)" />
                </Field>
                <Field label="Description" full>
                  <textarea name="description" defaultValue={b?.description ?? ""} />
                </Field>
                <label className="field">
                  <span>Reference only</span>
                  <span className="row">
                    <input type="checkbox" name="is_reference" defaultChecked={b?.is_reference ?? false} />
                    Not for loan
                  </span>
                </label>
              </div>
            </section>
          </div>
        </div>
        <div className="form-footer">
          <span>Fields marked * are required</span>
          <div className="actions">
            <button type="button" className="btn" onClick={() => router.back()}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              <Icon name="check" className="sm" />
              {saving ? "Saving…" : "Save book"}
            </button>
          </div>
        </div>
      </form>
      <aside className="stack">
        <div className="aside-panel">
          <h3>Catalogue</h3>
          <Kv
            rows={[
              ["Copies", b ? String(b.total_copies) : "Added with the book"],
              ["Available", b ? String(b.available_copies) : "—"],
              ["Waiting reservations", b ? String(b.waiting_reservations) : "—"],
            ]}
          />
          <div className="gap" />
          <p>{b ? "Add or retire copies on the book's page." : "Copies get accession numbers automatically."}</p>
        </div>
      </aside>
    </div>
  );
}

const COPY_STATUSES: CopyStatus[] = ["available", "on_hold", "damaged", "lost", "withdrawn"];

/** SCR-200, live: GET /library/books/{id} (?id=), POST …/copies, PATCH /library/copies/{id}. */
export function BookDetails() {
  const id = useSearchParams().get("id");
  const book = useApi<BookDetail>(id ? `${LIB}/books/${id}` : null);
  const [adding, setAdding] = useState(false);
  const [copy, setCopy] = useState<Copy | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!id) return <PickFirst what="book" href={routeOf(198)} cta="Open the catalogue" />;
  if (book.loading && !book.data) return <Loading what="Loading the book…" />;
  const b = book.data;
  if (!b) return <ErrorNote>{book.error ?? "Book not found."}</ErrorNote>;

  async function addCopies(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api.post(`${LIB}/books/${b!.id}/copies`, { count: formNum(f, "count") ?? 1, price: formText(f, "price"), acquired_on: formText(f, "acquired_on") });
      notify("Copies added.");
      setAdding(false);
      book.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveCopy(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setSaving(true);
    setError(null);
    try {
      await api.patch(`${LIB}/copies/${copy!.id}`, { status: copy!.status === "issued" ? undefined : formText(f, "status"), price: formText(f, "price"), condition_note: formText(f, "condition_note") });
      notify("Copy updated.");
      setCopy(null);
      book.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const rows: Row[] = b.copies.map((c) => [c.accession_no, b.shelf ?? "—", label(c.status), c.borrower_name ?? "—", date(c.due_on)]);
  return (
    <div className="stack">
      <Panel title="Book information" action={<Link href={`${routeOf(199)}?id=${b.id}`} className="btn">Edit book</Link>}>
        <div className="book-row">
          <div className="book-cover large">
            {b.title}
            <small>{b.authors ?? ""}</small>
          </div>
          <div>
            <h2 style={{ fontSize: "27px", margin: "8px 0" }}>{b.title}</h2>
            <p className="muted small">{[b.authors, b.category].filter(Boolean).join(" · ") || "—"}</p>
            <div className="gap" />
            <Badge>{`${b.available_copies} of ${b.total_copies} copies available`}</Badge>
            {b.is_reference ? <Badge>Reference only</Badge> : null}
            {b.waiting_reservations ? <Badge>{`${b.waiting_reservations} waiting`}</Badge> : null}
            <div className="gap" />
            <Kv
              rows={[
                ["ISBN", b.isbn ?? "—"],
                ["Publisher", b.publisher ?? "—"],
                ["Edition", b.edition ?? "—"],
                ["Shelf location", b.shelf ?? "—"],
                ["Digital link", b.digital_url ? <a href={b.digital_url} target="_blank" rel="noreferrer">Open link</a> : "—"],
              ]}
            />
          </div>
        </div>
      </Panel>
      <ErrorNote>{!adding && !copy ? error : null}</ErrorNote>
      <Panel
        title="Copies & availability"
        sub={`${b.total_copies} cop(ies) in catalogue`}
        action={
          <div className="row">
            <button type="button" className="btn" onClick={() => setAdding(true)}>
              <Icon name="plus" className="sm" />
              Add copies
            </button>
            <Link href={routeOf(202)} className="btn primary">
              Issue copy
            </Link>
          </div>
        }
        flush
      >
        <DataTable
          columns={["Copy barcode", "Shelf", "Status", "Issued to", "Due date"]}
          rows={rows}
          selectable={false}
          onView={(i) => setCopy(b.copies[i])}
          emptyState={{
            title: "No copies yet",
            note: "A book needs at least one physical copy before it can be issued to a member.",
            action: (
              <button type="button" className="btn primary" onClick={() => setAdding(true)}>
                Add copies
              </button>
            ),
          }}
        />
      </Panel>
      {adding ? (
        <Modal title="Add copies" onClose={() => setAdding(false)}>
          <form onSubmit={addCopies}>
            <ErrorNote>{error}</ErrorNote>
            <div className="form-grid">
              <Field label="Number of copies" required>
                <input name="count" type="number" min={1} max={200} required defaultValue={1} />
              </Field>
              <Field label="Price per copy (₹)">
                <input name="price" type="number" min={0} step="0.01" />
              </Field>
              <Field label="Acquired on">
                <input name="acquired_on" type="date" defaultValue={today()} />
              </Field>
            </div>
            <ModalActions onClose={() => setAdding(false)} saving={saving} label="Add copies" />
          </form>
        </Modal>
      ) : null}
      {copy ? (
        <Modal title={`Copy ${copy.accession_no}`} onClose={() => setCopy(null)}>
          <form onSubmit={saveCopy}>
            <ErrorNote>{error}</ErrorNote>
            {copy.status === "issued" ? <p>{`On loan to ${copy.borrower_name ?? "a member"}, due ${date(copy.due_on)}. Return it on the Return Book screen to change its status.`}</p> : null}
            <div className="form-grid">
              {copy.status !== "issued" ? (
                <Field label="Status">
                  <select name="status" defaultValue={copy.status}>
                    {COPY_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field label="Price (₹)">
                <input name="price" type="number" min={0} step="0.01" defaultValue={copy.price ?? ""} />
              </Field>
              <Field label="Condition note" full>
                <input name="condition_note" defaultValue={copy.condition_note ?? ""} />
              </Field>
            </div>
            <ModalActions onClose={() => setCopy(null)} saving={saving} label="Save copy" />
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

/** SCR-201, live: GET /library/members (q, with_books_only) and a member's loans. */
export function MemberList() {
  const [typed, setTyped] = useState("");
  const q = useDebounced(typed.trim());
  const [withBooks, setWithBooks] = useState(false);
  const [type, setType] = useState("");
  const members = useApi<Member[]>(`${LIB}/members`, { q, with_books_only: withBooks || undefined });
  const [open, setOpen] = useState<Member | null>(null);
  const loans = useApi<Loan[]>(open ? `${LIB}/loans` : null, open ? { student_id: open.student_id, user_id: open.user_id } : undefined);
  const items = (members.data ?? []).filter((m) => !type || m.borrower_type === type);
  const status = (m: Member) => (m.overdue ? "Overdue" : !m.can_borrow ? "Limit reached" : "Can borrow");
  const split = (d: string | null) => (d ?? "").split(/\s+[·�]\s+/);
  const rows: Row[] = items.map((m) => {
    const [code, cls] = split(m.detail);
    return [m.name, m.borrower_type === "student" ? code || "—" : `Staff #${m.user_id}`, label(m.borrower_type), m.borrower_type === "student" ? cls || "—" : "—", `${m.out} / ${m.limit}`, status(m)];
  });
  return (
    <>
      <div className="filterbar">
        <SearchBox value={typed} onChange={setTyped} placeholder="Search members…" />
        <select aria-label="Filter by member type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All members</option>
          <option value="student">Students</option>
          <option value="staff">Staff</option>
        </select>
        <select aria-label="Filter by status" value={withBooks ? "out" : ""} onChange={(e) => setWithBooks(e.target.value === "out")}>
          <option value="">All borrowers</option>
          <option value="out">Holding books now</option>
        </select>
      </div>
      <ErrorNote>{members.error}</ErrorNote>
      <Panel title="Library members" sub="Every student and staff member can borrow · listed here once they have" flush>
        <DataTable
          columns={["Member", "Member ID", "Type", "Class", "Books issued", "Status"]}
          rows={rows}
          onView={(i) => setOpen(items[i])}
          empty={members.loading ? "Loading members…" : undefined}
          emptyState={{
            title: "No library members yet",
            note: "A student or staff member is listed here the first time a book is issued to them.",
            action: (
              <Link href={routeOf(202)} className="btn primary">
                Issue a book
              </Link>
            ),
          }}
        />
      </Panel>
      {open ? (
        <Modal title={open.name} onClose={() => setOpen(null)} wide>
          <Kv
            rows={[
              ["Details", open.detail ?? "—"],
              ["Books out", `${open.out} of ${open.limit}`],
              ["Overdue", String(open.overdue)],
              ["Fines due", money(open.fine_due)],
              ["Borrowed ever", String(open.borrowed_ever)],
              ["Last issued", date(open.last_issued_on)],
            ]}
          />
          <div className="gap" />
          <DataTable
            columns={["Title", "Copy", "Issued", "Due", "Returned"]}
            rows={(loans.data ?? []).map((l) => [l.title, l.accession_no, date(l.issued_on), date(l.due_on), l.returned_on ? date(l.returned_on) : l.lost_on ? "Lost" : "Out"])}
            selectable={false}
            rowAction={false}
            empty={loans.loading ? "Loading…" : undefined}
            emptyState={{ title: "No loans yet", note: "Books this member has borrowed, past and present, will be listed here." }}
          />
          <div className="actions row">
            <button type="button" className="btn primary" onClick={() => setOpen(null)}>
              Close
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

/** SCR-206, live: GET /library/books?digital_only=true — a catalogue of links, not a reader. */
export function DigitalLibrary() {
  const [typed, setTyped] = useState("");
  const q = useDebounced(typed.trim());
  const [category, setCategory] = useState("");
  const categories = useApi<string[]>(`${LIB}/categories`);
  const books = useApi<Book[]>(`${LIB}/books`, { q, category, digital_only: true });
  const items = books.data ?? [];
  const kind = (u: string) => {
    const x = u.toLowerCase();
    return x.endsWith(".pdf") ? ["pdf", "PDF"] : /youtube|vimeo|\.mp4/.test(x) ? ["xls", "Video"] : ["doc", "Link"];
  };
  return (
    <>
      <div className="filterbar">
        <SearchBox value={typed} onChange={setTyped} placeholder="Search digital library…" />
        <select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.data?.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <ErrorNote>{books.error}</ErrorNote>
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>These are catalogue entries with a link. Opening one leaves BrightCampus; the school does not host or read the files here.</span>
      </div>
      <div className="gap" />
      {items.length ? (
        <div className="resource-grid">
          {items.map((b) => {
            const [cls, t] = kind(b.digital_url ?? "");
            return (
              <article className="resource-tile" key={b.id}>
                <div className={`file-icon ${cls}`}>{t}</div>
                <h3>{b.title}</h3>
                <p>
                  {b.category ?? "Uncategorised"}
                  <br />
                  {b.authors ?? ""}
                </p>
                <div className="spread">
                  <Badge>{b.is_active ? "Published" : "Withdrawn"}</Badge>
                  <a className="btn" href={b.digital_url ?? "#"} target="_blank" rel="noreferrer">
                    Open link
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="panel">
          <div className="panel-pad muted">{books.loading ? "Loading…" : "No digital resources yet. Add a book with a digital link to list it here."}</div>
        </section>
      )}
    </>
  );
}

/** Two bars per month (issued, returned), scaled to the busiest month. */
function MonthChart({ months }: { months: { month: string; issued: number; returned: number }[] }) {
  const shown = months.slice(-6);
  const max = Math.max(1, ...shown.flatMap((m) => [m.issued, m.returned]));
  const name = (m: string) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m.slice(5, 7)) - 1] + " " + m.slice(2, 4);
  return (
    <svg className="chart-svg" viewBox="0 0 640 225" role="img" aria-label="Books issued and returned by month">
      {[0, 1, 2, 3].map((i) => (
        <Fragment key={i}>
          <path d={`M38 ${20 + i * 51}H620`} stroke="#e9eff8" strokeDasharray="3 4" />
          <text x="7" y={24 + i * 51} fill="#91a2ba" fontSize="10" fontFamily="Manrope">
            {Math.round(max - (i * max) / 3)}
          </text>
        </Fragment>
      ))}
      {shown.map((m, i) => {
        const x = 65 + i * 92;
        const hi = (m.issued / max) * 153;
        const hr = (m.returned / max) * 153;
        return (
          <Fragment key={m.month}>
            <rect x={x} y={173 - hi} width="31" height={hi} rx="5" fill="#2563eb" />
            <rect x={x + 36} y={173 - hr} width="20" height={hr} rx="4" fill="#9ec2f7" />
            <text x={x + 28} y="210" textAnchor="middle" fill="#8196b5" fontSize="10" fontFamily="Manrope">
              {name(m.month)}
            </text>
          </Fragment>
        );
      })}
    </svg>
  );
}

/** SCR-207, live: GET /analytics/library (from, to), /library/fines, /library/books and overdue loans. */
export function LibraryReports() {
  const [from, setFrom] = useState(addDays(today(), -180));
  const [to, setTo] = useState(today());
  const [category, setCategory] = useState("");
  const usage = useApi<LibraryUsage>("/api/v1/school/analytics/library", { from, to });
  const fines = useApi<Fines>(`${LIB}/fines`);
  const books = useApi<Book[]>(`${LIB}/books`);
  const overdue = useApi<Loan[]>(`${LIB}/loans`, { overdue_only: true });
  const u = usage.data;
  const stats = [
    { label: "Issued", value: n(u?.issued), note: `${date(from)} – ${date(to)}` },
    { label: "Returned", value: n(u?.returned), note: "In the same period" },
    { label: "Out now", value: n(u?.out_now), note: u ? `${u.copies} copies in stock` : "…" },
    { label: "Shelf in use", value: u ? pct(u.shelf_in_use) : "…", note: "Copies on loan right now" },
  ];

  const byCat = new Map<string, { total: number; available: number; overdue: number }>();
  (books.data ?? []).forEach((b) => {
    const k = b.category ?? "Uncategorised";
    const r = byCat.get(k) ?? { total: 0, available: 0, overdue: 0 };
    r.total += b.total_copies;
    r.available += b.available_copies;
    byCat.set(k, r);
  });
  const catOf = new Map((books.data ?? []).map((b) => [b.id, b.category ?? "Uncategorised"]));
  (overdue.data ?? []).forEach((l) => {
    const r = byCat.get(catOf.get(l.book_id) ?? "Uncategorised");
    if (r) r.overdue += 1;
  });
  const cats = [...byCat.entries()].filter(([k]) => !category || k === category).sort((a, b) => b[1].total - a[1].total);
  const rows: Row[] = cats.map(([k, r]) => [k, String(r.total), String(r.total - r.available), String(r.available), String(r.overdue), r.total ? pct(((r.total - r.available) / r.total) * 100) : "—"]);

  const f = fines.data;
  const amounts = f ? [["To collect", Number(f.pending_amount)], ["Collected", Number(f.collected_amount)], ["Added to fees", Number(f.billed_amount)], ["Waived", Number(f.waived_amount)]] as const : [];
  const fineTotal = amounts.reduce((s, [, v]) => s + v, 0);

  return (
    <>
      <div className="filterbar">
        <select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {[...byCat.keys()].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" aria-label="To" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
      </div>
      <ErrorNote>{usage.error ?? fines.error ?? books.error ?? overdue.error}</ErrorNote>
      <StatStrip items={stats} compact />
      <div className="two-col" style={{ marginBottom: "20px" }}>
        <div>
          <Panel
            title="Borrowing by month"
            sub={`${date(from)} – ${date(to)} · last six months shown`}
            action={
              <div className="chart-key">
                <span>Issued</span>
                <span>Returned</span>
              </div>
            }
          >
            {u?.by_month.length ? <MonthChart months={u.by_month} /> : <p className="muted">{usage.loading ? "Loading…" : "No borrowing in this period."}</p>}
          </Panel>
        </div>
        <aside className="stack">
          <Panel title="Report scope">
            <Kv
              rows={[
                ["Date range", `${date(from)} – ${date(to)}`],
                ["Category", category || "All categories"],
                ["Most borrowed", u?.top_titles[0] ? `${u.top_titles[0].title} (${u.top_titles[0].times})` : "—"],
                ["Overdue now", overdue.data ? String(overdue.data.length) : "…"],
              ]}
            />
          </Panel>
          <Panel title="Fines" sub={f ? `${f.pending} fine(s) waiting · all time` : undefined}>
            <div className="bar-list">
              {amounts.map(([k, v]) => (
                <div key={k}>
                  <span>{k}</span>
                  <div className="bar-track">
                    <i style={{ width: `${fineTotal ? (v / fineTotal) * 100 : 0}%` }} />
                  </div>
                  <strong>{money(v)}</strong>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
      <Panel title="Detailed breakdown" sub="Copies by category, as of now" action={<button type="button" className="btn" data-export="">
          <Icon name="download" className="sm" />
          CSV
        </button>} flush>
        <DataTable
          columns={["Category", "Total copies", "Not on shelf", "Available", "Overdue", "Utilization"]}
          rows={rows}
          selectable={false}
          rowAction={false}
          empty={books.loading ? "Loading…" : undefined}
          emptyState={{ title: "No books in the catalogue", note: "Reports need at least one book on the shelves to show borrowing by category." }}
        />
      </Panel>
    </>
  );
}
