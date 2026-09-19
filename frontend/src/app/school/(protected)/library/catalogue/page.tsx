"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

import { BookModal } from "../BookModal";
import { BookRow, LibraryTabs } from "../LibraryTabs";

export default function CataloguePage() {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [digitalOnly, setDigitalOnly] = useState(false);
  const [books, setBooks] = useState<BookRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const params: Record<string, string | boolean> = {};
      if (q.trim()) params.q = q.trim();
      if (category) params.category = category;
      if (availableOnly) params.available_only = true;
      if (digitalOnly) params.digital_only = true;
      const [b, c] = await Promise.all([
        api.get<BookRow[]>("/api/v1/school/library/books", { params }),
        api.get<string[]>("/api/v1/school/library/categories"),
      ]);
      setBooks(b.data);
      setCategories(c.data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, availableOnly, digitalOnly]);

  return (
    <div className="space-y-6">
      <PageHeader title="Library" subtitle="Books, copies and digital resources." actions={<Button onClick={() => setAdding(true)}>+ Add book</Button>} />
      <LibraryTabs />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <Input label="Search" placeholder="Title, author, ISBN or accession no." value={q} onChange={(e) => setQ(e.target.value)} />
        <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 pb-2 text-sm text-ink-muted">
          <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
          On shelf now
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-ink-muted">
          <input type="checkbox" checked={digitalOnly} onChange={(e) => setDigitalOnly(e.target.checked)} />
          Digital
        </label>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <Card>
        <Table head={["Title", "Author", "Category", "Shelf", "Copies", ""]} empty={books.length === 0 && "No books found."}>
          {books.map((b) => (
            <tr key={b.id} className="hover:bg-surface-hover">
              <td className={tdStrong}>
                <Link href={`/school/library/catalogue/${b.id}`} className="hover:underline">
                  {b.title}
                </Link>{" "}
                {b.is_reference && <Badge>reference</Badge>} {b.digital_url && <Badge tone="brand">digital</Badge>}
                {b.isbn && <div className="text-xs font-normal text-ink-subtle">ISBN {b.isbn}</div>}
              </td>
              <td className={td}>{b.authors ?? "—"}</td>
              <td className={td}>{b.category ?? "—"}</td>
              <td className={td}>{b.shelf ?? "—"}</td>
              <td className={td}>
                {b.total_copies ? (
                  <>
                    <span className={b.available_copies ? "text-emerald-400" : "text-amber-400"}>{b.available_copies}</span> / {b.total_copies}{" "}
                    available
                  </>
                ) : (
                  "—"
                )}
                {b.waiting_reservations > 0 && <div className="text-xs text-ink-subtle">{b.waiting_reservations} waiting</div>}
              </td>
              <td className="px-3 py-2 text-right">
                <Link href={`/school/library/catalogue/${b.id}`}>
                  <Button size="sm" variant="secondary">
                    Open
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {adding && (
        <BookModal
          categories={categories}
          onClose={() => setAdding(false)}
          onSaved={(title) => {
            setAdding(false);
            setNotice(`Added “${title}”.`);
            load();
          }}
        />
      )}
    </div>
  );
}
