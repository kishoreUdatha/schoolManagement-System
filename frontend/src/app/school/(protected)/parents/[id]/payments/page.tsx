"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronLeft, CircleCheck } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Table,
  humanize,
  inr,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";
import { shortDate } from "@/lib/dates";

type ChildLink = {
  student_id: number;
  full_name: string;
  admission_no: string;
  section_label: string | null;
};
type Parent = { user_id: number; full_name: string; children: ChildLink[] };

type Fee = {
  id: number;
  student_id: number;
  fee_head_name: string;
  period: string;
  amount_due: string;
  amount_paid: string;
  amount_outstanding: string;
  due_date: string;
  status: string;
  is_overdue: boolean;
};

type Receipt = {
  id: number;
  receipt_no: string;
  collected_on: string;
  student_id: number;
  student_name: string;
  fee_head_name: string;
  period: string;
  amount: string;
  mode: string;
  reference: string | null;
  collected_by_name: string | null;
};

function ParentTabs({ id }: { id: string }) {
  const pathname = usePathname();
  const base = `/school/parents/${id}`;
  const tabs = [
    { href: base, label: "Profile" },
    { href: `${base}/payments`, label: "Payments" },
    { href: `${base}/activity`, label: "Activity" },
  ];
  return (
    <nav className="flex flex-wrap gap-1 border-b border-surface-border">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={
            pathname === t.href
              ? "border-b-2 border-brand-600 px-3 py-2 text-[13px] font-extrabold text-brand-600"
              : "border-b-2 border-transparent px-3 py-2 text-[13px] font-bold text-ink-muted hover:text-ink"
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

const tone = (status: string, overdue: boolean) =>
  status === "paid"
    ? "emerald"
    : status === "waived"
      ? "neutral"
      : overdue
        ? "rose"
        : "amber";

/** What this family owes, across all their children.
 *
 *  A parent with three children does not ask what child two owes — they ask
 *  what the bill is. The school's fee screens are organised per child because
 *  that is how fees are raised; this is the same records added up the way the
 *  person paying them thinks about them.
 */
export default function ParentPaymentsPage() {
  const { id } = useParams<{ id: string }>();
  const [parent, setParent] = useState<Parent | null>(null);
  const [fees, setFees] = useState<Fee[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The collections endpoint defaults to the current month. A payment history
  // that silently starts on the first of this month would read as a family
  // who has never paid anything, so the window is always explicit.
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear() - 5}-04-01`;
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await api.get<Parent>(`/api/v1/school/parents/${id}`);
      setParent(p.data);

      const perChild = await Promise.all(
        p.data.children.map(async (c) => {
          const [f, r] = await Promise.all([
            api.get<{ items: Fee[] }>("/api/v1/school/fees/student-fees", {
              params: { student_id: c.student_id, page_size: 200 },
            }),
            api.get<Receipt[]>("/api/v1/school/accounts/collections", {
              params: { student_id: c.student_id, from, to },
            }),
          ]);
          return { fees: f.data.items, receipts: r.data };
        }),
      );
      setFees(perChild.flatMap((x) => x.fees));
      setReceipts(
        perChild
          .flatMap((x) => x.receipts)
          .sort((a, b) => b.collected_on.localeCompare(a.collected_on)),
      );
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, [id, from, to]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const num = (v: string) => Number(v || 0);
  const outstanding = fees.reduce((n, f) => n + num(f.amount_outstanding), 0);
  const overdue = fees
    .filter((f) => f.is_overdue)
    .reduce((n, f) => n + num(f.amount_outstanding), 0);
  const paidInWindow = receipts.reduce((n, r) => n + num(r.amount), 0);

  const children = parent?.children ?? [];

  return (
    <div className="space-y-6">
      <Link
        href="/school/parents"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        All parents
      </Link>

      <PageHeader
        title={parent ? `${parent.full_name} — payments` : "Payments"}
        subtitle="Everything owed and everything paid, across this family's children."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <Input
              type="date"
              label="From"
              name="from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              type="date"
              label="To"
              name="to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
            <Button variant="secondary" onClick={load} loading={loading}>
              Apply
            </Button>
          </div>
        }
      />

      <ParentTabs id={id} />
      <ErrorBox>{error}</ErrorBox>

      {/* The figures already added up above, read as one summary of the
          family rather than four separate cards. */}
      <StatStrip
        stats={[
          {
            label: "Outstanding",
            value: inr(outstanding),
            note: "Across every child",
            icon: outstanding ? AlertTriangle : CircleCheck,
          },
          {
            label: "Of that, overdue",
            value: inr(overdue),
            note: overdue ? "Past its due date" : "Nothing past due",
            icon: overdue ? AlertTriangle : CircleCheck,
          },
          {
            label: "Paid in this window",
            value: inr(paidInWindow),
            note: `${from} to ${to}`,
          },
          {
            label: "Children",
            value: children.length,
            note: "Linked to this parent",
          },
        ]}
      />

      {children.length === 0 && !loading && (
        <Card>
          <CardBody>
            <p className="text-[13px] text-ink-subtle">
              No children are linked to this parent, so there are no fees to show.
            </p>
          </CardBody>
        </Card>
      )}

      {children.map((c) => {
        const mine = fees.filter((f) => f.student_id === c.student_id);
        const owed = mine.reduce((n, f) => n + num(f.amount_outstanding), 0);
        return (
          <Card key={c.student_id}>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>
                  <Link
                    href={`/school/students/${c.student_id}`}
                    className="hover:text-brand-600 hover:underline"
                  >
                    {c.full_name}
                  </Link>
                </CardTitle>
                <p className="mt-[5px] text-[11px] text-ink-muted">
                  {c.admission_no}
                  {c.section_label ? ` · ${c.section_label}` : ""}
                </p>
              </div>
              <Badge tone={owed ? "amber" : "emerald"}>
                {owed ? `${inr(owed)} owed` : "Nothing owed"}
              </Badge>
            </CardHeader>
            <CardBody className="p-0">
              <Table
                head={["Fee", "Period", "Due", "Charged", "Paid", "Outstanding", "State"]}
                empty={
                  mine.length === 0 &&
                  (loading ? "Loading…" : "No fees have been raised for this child yet.")
                }
              >
                {mine.map((f) => (
                  <tr key={f.id}>
                    <td className={tdStrong}>{f.fee_head_name}</td>
                    <td className={td}>{f.period}</td>
                    <td className={td}>{shortDate(f.due_date)}</td>
                    <td className={td}>{inr(f.amount_due)}</td>
                    <td className={td}>{inr(f.amount_paid)}</td>
                    <td className={tdStrong}>{inr(f.amount_outstanding)}</td>
                    <td className={td}>
                      <Badge tone={tone(f.status, f.is_overdue)}>
                        {f.is_overdue && f.status !== "paid"
                          ? "Overdue"
                          : humanize(f.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </Table>
            </CardBody>
            <PanelFooter
              left={`${mine.length} fee line${mine.length === 1 ? "" : "s"}`}
              right={owed ? `${inr(owed)} still outstanding` : "Nothing outstanding"}
            />
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Receipts</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Every payment this family has made between {from} and {to}.
            </p>
          </div>
          <span className="text-[12px] font-bold text-ink-muted">
            {receipts.length} in this window
          </span>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Receipt", "Date", "Child", "Fee", "Amount", "How", "Reference"]}
            empty={
              receipts.length === 0 &&
              (loading ? "Loading…" : "Nothing has been paid in this window.")
            }
          >
            {receipts.map((r) => (
              <tr key={r.id}>
                <td className={tdStrong}>{r.receipt_no}</td>
                <td className={td}>{shortDate(r.collected_on)}</td>
                <td className={td}>{r.student_name}</td>
                <td className={td}>
                  {r.fee_head_name}
                  <span className="block text-[11px] text-ink-subtle">{r.period}</span>
                </td>
                <td className={tdStrong}>{inr(r.amount)}</td>
                <td className={td}>{humanize(r.mode)}</td>
                <td className={td}>
                  {r.reference || "—"}
                  {r.collected_by_name && (
                    <span className="block text-[11px] text-ink-subtle">
                      taken by {r.collected_by_name}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${receipts.length} receipt${receipts.length === 1 ? "" : "s"} in this window`}
          right={`${inr(paidInWindow)} taken`}
        />
      </Card>
    </div>
  );
}
