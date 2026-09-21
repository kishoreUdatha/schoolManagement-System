"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, humanize, inr, td } from "@/components/ui/Field";
import {
  FilterBar,
  MiniBar,
  PanelFooter,
  PersonCell,
  SearchBox,
  StatStrip,
} from "@/components/ui/Workspace";
import { AlertTriangle, BookOpen, IndianRupee, Lock } from "lucide-react";
import { api, apiError } from "@/lib/api";

/** A select sized for the filter bar: same height as the search box, and
 *  no stacked label, because the bar reads as one row of controls. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Member = {
  borrower_type: "student" | "staff";
  student_id: number | null;
  user_id: number | null;
  name: string;
  detail: string | null;
  out: number;
  overdue: number;
  fine_due: string;
  limit: number;
  can_borrow: boolean;
  borrowed_ever: number;
  last_issued_on: string | null;
};

/** The counter question: can this person take another book?
 *  Limit, what is out, what is overdue and what is owed, in one row. */
export default function LibraryMembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState("");
  const [withBooksOnly, setWithBooksOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (search = q) =>
    api
      .get<Member[]>("/api/v1/school/library/members", {
        params: { q: search || undefined, with_books_only: withBooksOnly },
      })
      .then((r) => setMembers(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withBooksOnly]);

  const out = members.reduce((n, m) => n + m.out, 0);
  const overdue = members.reduce((n, m) => n + m.overdue, 0);
  const owed = members.reduce((n, m) => n + Number(m.fine_due), 0);
  const blocked = members.filter((m) => !m.can_borrow).length;

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Library members"
        subtitle="Who is holding what, and who has reached their limit."
      />
      <ErrorBox>{error}</ErrorBox>

      {/* Totalled off the rows already on screen: the same list, added up. */}
      <StatStrip
        stats={[
          {
            label: "Books out",
            value: out,
            note: `Held by ${members.length} member(s)`,
            icon: BookOpen,
          },
          {
            label: "Overdue",
            value: overdue,
            note: overdue ? "Past their return date" : "Nothing late",
            icon: AlertTriangle,
          },
          {
            label: "Fines owed",
            value: inr(owed),
            note: owed ? "Outstanding at the counter" : "Nothing owed",
            icon: IndianRupee,
          },
          {
            label: "Cannot borrow",
            value: blocked,
            note: "At their limit, or owing a fine",
            icon: Lock,
          },
        ]}
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
            placeholder="Name, admission number or section…"
            label="Search members"
          />
          <select
            aria-label="Holding a book"
            value={withBooksOnly ? "holding" : ""}
            onChange={(e) => setWithBooksOnly(e.target.value === "holding")}
            className={filterSelect}
          >
            <option value="">Everyone</option>
            <option value="holding">Only people holding a book right now</option>
          </select>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </FilterBar>
      </form>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Members</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {withBooksOnly ? "Only people holding a book right now" : "Everyone with a borrowing history"}
              {q ? ` · matching “${q}”` : ""}
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Member", "Who", "Out", "Overdue", "Fine owed", "Borrowed ever", "Can borrow"]}
            empty={members.length === 0 && "Nobody has borrowed a book yet."}
          >
            {members.map((m) => (
              <tr key={`${m.borrower_type}-${m.student_id ?? m.user_id}`}>
                <td className={td}>
                  <PersonCell name={m.name} sub={m.detail} />
                </td>
                <td className={td}>{humanize(m.borrower_type)}</td>
                <td className={td}>
                  <div>
                    {m.out} <span className="text-ink-subtle">/ {m.limit}</span>
                  </div>
                  {m.limit > 0 && <MiniBar percent={(m.out / m.limit) * 100} />}
                </td>
                <td className={td}>
                  {m.overdue > 0 ? <Badge tone="rose">{m.overdue}</Badge> : "—"}
                </td>
                <td className={td}>{Number(m.fine_due) > 0 ? inr(m.fine_due) : "—"}</td>
                <td className={td}>
                  {m.borrowed_ever}
                  {m.last_issued_on && (
                    <span className="block text-[11px] text-ink-subtle">last {m.last_issued_on}</span>
                  )}
                </td>
                <td className={td}>
                  {m.can_borrow ? (
                    <Badge tone="emerald">Yes</Badge>
                  ) : (
                    <Badge tone="amber">{m.out >= m.limit ? "At limit" : "Fine owed"}</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`Showing ${members.length} member${members.length === 1 ? "" : "s"}`}
          right={`${out} book(s) out · ${overdue} overdue · ${inr(owed)} owed`}
        />
      </Card>
    </div>
  );
}
