"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, humanize, inr, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

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
    <div className="space-y-6">
      <PageHeader
        title="Library members"
        subtitle="Who is holding what, and who has reached their limit."
        actions={
          <form
            className="flex items-end gap-2"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              load();
            }}
          >
            <Input
              placeholder="Name, admission number or section"
              aria-label="Search members"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Books out" value={out} />
        <StatCard label="Overdue" value={overdue} accent={overdue ? "rose" : "emerald"} />
        <StatCard label="Fines owed" value={inr(owed)} accent={owed ? "amber" : "emerald"} />
        <StatCard label="Cannot borrow" value={blocked} accent={blocked ? "amber" : "emerald"} />
      </div>

      <label className="flex items-center gap-2 text-[13px] text-ink-muted">
        <input
          type="checkbox"
          checked={withBooksOnly}
          onChange={(e) => setWithBooksOnly(e.target.checked)}
        />
        Only people holding a book right now
      </label>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Member", "Who", "Out", "Overdue", "Fine owed", "Borrowed ever", "Can borrow"]}
            empty={members.length === 0 && "Nobody has borrowed a book yet."}
          >
            {members.map((m) => (
              <tr key={`${m.borrower_type}-${m.student_id ?? m.user_id}`}>
                <td className={tdStrong}>
                  {m.name}
                  {m.detail && <span className="block text-[11px] text-ink-subtle">{m.detail}</span>}
                </td>
                <td className={td}>{humanize(m.borrower_type)}</td>
                <td className={td}>
                  {m.out} <span className="text-ink-subtle">/ {m.limit}</span>
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
      </Card>
    </div>
  );
}
