"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BookCopy, Bookmark, Library, Tags } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Table, td, tdStrong } from "@/components/ui/Field";
import { FilterBar, PanelFooter, SearchBox, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

import { BookModal } from "../BookModal";
import { BookRow, LibraryTabs } from "../LibraryTabs";

/** A select sized for the filter bar: the same height as the search box and
 *  no stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300";

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

      {/* Summed from the rows the catalogue search already returned — the
          shelf as this filter sees it, not a second set of queries. */}
      <StatStrip
        stats={[
          {
            label: "Titles listed",
            value: books.length || "—",
            note: category ? `In ${category}` : "Across every category",
            icon: Library,
          },
          {
            label: "Copies on shelf",
            value: books.reduce((n, b) => n + b.available_copies, 0) || "—",
            note: `of ${books.reduce((n, b) => n + b.total_copies, 0)} copies held`,
            icon: BookCopy,
          },
          {
            label: "Readers waiting",
            value: books.reduce((n, b) => n + b.waiting_reservations, 0) || "—",
            note: "Reservations against these titles",
            icon: Bookmark,
          },
          {
            label: "Categories",
            value: categories.length || "—",
            note: "In the catalogue",
            icon: Tags,
          },
        ]}
      />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          load();
        }}
      >
        <FilterBar>
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Title, author, ISBN or accession no.…"
            label="Search the catalogue"
          />
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={filterSelect}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex h-[41px] items-center gap-2 text-[12px] text-ink-muted">
            <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
            On shelf now
          </label>
          <label className="flex h-[41px] items-center gap-2 text-[12px] text-ink-muted">
            <input type="checkbox" checked={digitalOnly} onChange={(e) => setDigitalOnly(e.target.checked)} />
            Digital
          </label>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </FilterBar>
      </form>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Catalogue</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {[
                category || "All categories",
                availableOnly ? "On shelf now" : "Every copy",
                digitalOnly ? "Digital only" : "Print and digital",
              ].join(" · ")}
            </p>
          </div>
        </CardHeader>
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
                    <span className={b.available_copies ? "text-success" : "text-warning"}>{b.available_copies}</span> / {b.total_copies}{" "}
                    available
                  </>
                ) : (
                  "—"
                )}
                {b.waiting_reservations > 0 && <div className="text-xs text-ink-subtle">{b.waiting_reservations} waiting</div>}
              </td>
              <td className="px-4 py-3 text-right">
                <Link href={`/school/library/catalogue/${b.id}`}>
                  <Button size="sm" variant="secondary">
                    Open
                  </Button>
                </Link>
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`Showing ${books.length} title(s)`}
          right={books.length ? `${books.reduce((n, b) => n + b.total_copies, 0)} copies catalogued` : undefined}
        />
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
