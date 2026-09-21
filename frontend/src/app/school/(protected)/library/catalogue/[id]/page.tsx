"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { BorrowerPicker, BorrowerValue, borrowerPayload } from "@/components/BorrowerPicker";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  humanize,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PanelFooter, PersonCell } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

import { BookModal } from "../../BookModal";
import { BookRow, Copy, copyTone } from "../../LibraryTabs";

type BookDetail = BookRow & { copies: Copy[] };

export default function BookDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [book, setBook] = useState<BookDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [addingCopies, setAddingCopies] = useState(false);
  const [reserving, setReserving] = useState(false);

  async function load() {
    try {
      const { data } = await api.get<BookDetail>(`/api/v1/school/library/books/${id}`);
      setBook(data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function setCopyStatus(c: Copy, status: string) {
    try {
      await api.patch(`/api/v1/school/library/copies/${c.id}`, { status });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  if (!book) return <div className="text-sm text-ink-muted">{error ?? "Loading…"}</div>;

  return (
    <div className="space-y-6">
      <Link href="/school/library/catalogue" className="text-sm text-ink-muted hover:underline">
        ← Catalogue
      </Link>
      <PageHeader
        title={book.title}
        subtitle={[book.authors, book.publisher, book.edition, book.publish_year]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <span className="flex flex-wrap items-center gap-2">
              {book.category && <Badge>{book.category}</Badge>}
              {book.is_reference && <Badge tone="amber">reference only</Badge>}
              {!book.is_active && <Badge tone="rose">inactive</Badge>}
            </span>
            {book.digital_url && (
              <a href={book.digital_url} target="_blank" rel="noreferrer">
                <Button variant="secondary">Open digital copy</Button>
              </a>
            )}
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            {!book.is_reference && book.total_copies > 0 && (
              <Button variant="secondary" onClick={() => setReserving(true)}>
                Reserve for…
              </Button>
            )}
            <Button onClick={() => setAddingCopies(true)}>+ Copies</Button>
          </>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {book.description && (
        <Card>
          <CardBody className="whitespace-pre-wrap text-sm text-ink-muted">{book.description}</CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Copies</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {book.available_copies}/{book.total_copies} on shelf
              {book.waiting_reservations > 0 && ` · ${book.waiting_reservations} waiting`}
            </p>
          </div>
          {book.shelf && <span className="text-sm text-ink-muted">Shelf {book.shelf}</span>}
        </CardHeader>
        <Table head={["Accession no.", "Status", "With", "Price", "Acquired", "Note", ""]} empty={book.copies.length === 0 && "No physical copies."}>
          {book.copies.map((c) => (
            <tr key={c.id}>
              <td className="px-4 py-3 text-[12px] font-mono text-ink">{c.accession_no}</td>
              <td className="px-4 py-3">
                <Badge tone={copyTone[c.status]}>{humanize(c.status)}</Badge>
              </td>
              <td className="px-4 py-3">
                {c.borrower_name ? (
                  <PersonCell
                    name={c.borrower_name}
                    sub={c.due_on ? `due ${c.due_on}` : null}
                  />
                ) : (
                  <span className="text-[13px] text-ink-muted">—</span>
                )}
              </td>
              <td className={td}>{inr(c.price)}</td>
              <td className={td}>{c.acquired_on ?? "—"}</td>
              <td className={td}>{c.condition_note ?? "—"}</td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                {c.status === "available" && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => setCopyStatus(c, "damaged")}>
                      Damaged
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setCopyStatus(c, "withdrawn")}>
                      Withdraw
                    </Button>
                  </>
                )}
                {(c.status === "damaged" || c.status === "withdrawn") && (
                  <Button size="sm" variant="secondary" onClick={() => setCopyStatus(c, "available")}>
                    Back on shelf
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`${book.copies.length} cop${book.copies.length === 1 ? "y" : "ies"} on this record`}
          right={
            book.waiting_reservations > 0
              ? `${book.waiting_reservations} waiting`
              : "Nobody waiting"
          }
        />
      </Card>

      {editing && (
        <BookModal
          existing={book}
          categories={book.category ? [book.category] : []}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}
      {addingCopies && (
        <AddCopiesModal
          bookId={book.id}
          onClose={() => setAddingCopies(false)}
          onSaved={(n) => {
            setAddingCopies(false);
            setNotice(`Added ${n} cop${n === 1 ? "y" : "ies"}.`);
            load();
          }}
        />
      )}
      {reserving && (
        <ReserveModal
          book={book}
          onClose={() => setReserving(false)}
          onSaved={(msg) => {
            setReserving(false);
            setNotice(msg);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddCopiesModal({ bookId, onClose, onSaved }: { bookId: number; onClose: () => void; onSaved: (n: number) => void }) {
  const [count, setCount] = useState("1");
  const [numbers, setNumbers] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const list = numbers.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
    try {
      await api.post(`/api/v1/school/library/books/${bookId}/copies`, {
        count: list.length || Number(count),
        accession_nos: list.length ? list : null,
        price: price || null,
      });
      onSaved(list.length || Number(count));
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <Modal open onClose={onClose} title="Add copies">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="How many" type="number" min="1" value={count} onChange={(e) => setCount(e.target.value)} disabled={!!numbers.trim()} />
          <Input label="Price per copy ₹" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <Input
          label="Or your own accession numbers"
          placeholder="e.g. LIB-1001, LIB-1002"
          value={numbers}
          onChange={(e) => setNumbers(e.target.value)}
          hint="Leave blank to number automatically"
        />
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Add</Button>
        </div>
      </form>
    </Modal>
  );
}

function ReserveModal({ book, onClose, onSaved }: { book: BookRow; onClose: () => void; onSaved: (m: string) => void }) {
  const [borrower, setBorrower] = useState<BorrowerValue>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open onClose={onClose} title={`Reserve “${book.title}”`}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!borrower) return;
          try {
            const { data } = await api.post<{ status: string; queue_position: number | null; held_accession_no: string | null }>(
              "/api/v1/school/library/reservations",
              { ...borrowerPayload(borrower), book_id: book.id }
            );
            onSaved(
              data.status === "ready"
                ? `Copy ${data.held_accession_no} set aside for ${borrower.label}.`
                : `${borrower.label} is #${data.queue_position} in the queue.`
            );
          } catch (err) {
            setError(apiError(err));
          }
        }}
      >
        <BorrowerPicker value={borrower} onChange={setBorrower} />
        <ErrorBox>{error}</ErrorBox>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!borrower}>
            Reserve
          </Button>
        </div>
      </form>
    </Modal>
  );
}
