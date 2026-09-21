"use client";

import { FormEvent, useEffect, useState } from "react";
import { ExternalLink, Languages, Library, Tags } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader } from "@/components/ui/Field";
import { FilterBar, SearchBox, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

/** A select sized for the filter bar, matching the search box beside it. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Book = {
  id: number;
  title: string;
  authors: string | null;
  isbn: string | null;
  publisher: string | null;
  edition: string | null;
  publish_year: number | null;
  category: string | null;
  language: string | null;
  shelf: string | null;
  description: string | null;
  digital_url: string | null;
  is_reference: boolean;
  is_active: boolean;
  total_copies: number;
  available_copies: number;
  waiting_reservations: number;
};

/** Titles the library holds a link to.
 *
 *  The filtering is the server's — /books takes digital_only — so this page
 *  never sees the paper-only catalogue and cannot drift out of step with it.
 */
export default function DigitalLibraryPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (search = q, cat = category) => {
    setLoading(true);
    api
      .get<Book[]>("/api/v1/school/library/books", {
        params: {
          digital_only: true,
          q: search || undefined,
          category: cat || undefined,
        },
      })
      .then((r) => setBooks(r.data))
      .catch((e) => setError(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    api
      .get<string[]>("/api/v1/school/library/categories")
      .then((r) => setCategories(r.data))
      .catch(() => setCategories([]));
  }, []);

  // Fires on mount as well as on a category change, so there is one fetch
  // rather than a mount fetch racing a category fetch.
  useEffect(() => {
    load(q, category);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const languages = new Set(books.map((b) => b.language).filter(Boolean));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Digital library"
        subtitle="Titles the library holds a link to, rather than a copy of."
      />

      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          load();
        }}
      >
        <FilterBar>
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Title, author or ISBN"
            label="Search digital titles"
          />
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={filterSelect}
          >
            <option value="">Every category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </FilterBar>
      </form>

      <ErrorBox>{error}</ErrorBox>

      <NoticeBox>
        This is a catalogue of links. Opening a title takes you to wherever it is
        hosted — nothing here is borrowed, returned or reserved, and there is no
        separate access list, so anybody who can reach this page can open any of
        them.
      </NoticeBox>

      <StatStrip
        stats={[
          {
            label: "Digital titles",
            value: loading ? "—" : books.length,
            note: q || category ? "Matching this search" : "Every linked title",
            icon: Library,
          },
          {
            label: "Categories",
            value: categories.length || "—",
            note: category || "Across the whole catalogue",
            icon: Tags,
          },
          {
            label: "Languages",
            value: languages.size || "—",
            note: "Among the titles shown",
            icon: Languages,
          },
        ]}
      />

      {loading ? (
        <p className="text-[13px] text-ink-subtle">Loading…</p>
      ) : books.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-[13px] text-ink-subtle">
              {q || category
                ? "Nothing matches that search."
                : "No titles have a link on them yet. Add one by putting a web address on a book in the catalogue."}
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((b) => (
            <Card key={b.id} className="flex h-full flex-col">
              <CardBody className="flex flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[15px] font-extrabold leading-snug text-ink">
                    {b.title}
                  </h3>
                  {b.is_reference && <Badge tone="neutral">Reference</Badge>}
                </div>
                {b.authors && (
                  <p className="text-[13px] text-ink-muted">{b.authors}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {b.category && <Badge tone="brand">{b.category}</Badge>}
                  {b.language && <Badge tone="neutral">{b.language}</Badge>}
                  {b.publish_year && (
                    <Badge tone="neutral">{b.publish_year}</Badge>
                  )}
                </div>
                {b.description && (
                  <p className="line-clamp-3 text-[12px] text-ink-subtle">
                    {b.description}
                  </p>
                )}
                <div className="mt-auto pt-2">
                  <a
                    href={b.digital_url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="secondary" className="w-full">
                      <ExternalLink className="mr-1.5 h-4 w-4" />
                      Open
                    </Button>
                  </a>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
