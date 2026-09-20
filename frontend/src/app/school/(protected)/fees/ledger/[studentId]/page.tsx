"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
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
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { readableDate } from "@/lib/dates";

type Entry = {
  on: string;
  kind: "charge" | "receipt";
  detail: string;
  reference: string | null;
  charged: string;
  paid: string;
  balance: string;
  fee_id: number | null;
  status: string | null;
  note: string | null;
};
type Ledger = {
  student_id: number;
  student_name: string;
  admission_no: string;
  class_name: string | null;
  section_name: string | null;
  entries: Entry[];
  total_charged: string;
  total_paid: string;
  total_waived: string;
  balance: string;
};

/** One child's account: every charge, every receipt, and what is left.
 *
 *  Nothing here is stored. The balance is the arithmetic of the lines above
 *  it, so it cannot disagree with them.
 */
export default function StudentLedgerPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const [data, setData] = useState<Ledger | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Ledger>(`/api/v1/school/finance/ledger/${studentId}`)
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [studentId]);

  const owing = Number(data?.balance ?? 0) > 0;

  return (
    <div className="space-y-6">
      <Link
        href="/school/fees/dues"
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Dues
      </Link>

      <PageHeader
        title={data ? data.student_name : "Ledger"}
        subtitle={
          data
            ? `${data.admission_no}${
                data.class_name ? ` · ${data.class_name} ${data.section_name ?? ""}` : ""
              }`
            : "Every charge and every receipt, in order."
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Charged" value={data ? inr(data.total_charged) : "—"} />
        <StatCard
          label="Received"
          value={data ? inr(data.total_paid) : "—"}
          accent="emerald"
        />
        <StatCard
          label="Waived"
          value={data ? inr(data.total_waived) : "—"}
          accent="neutral"
        />
        <StatCard
          label="Balance"
          value={data ? inr(data.balance) : "—"}
          accent={owing ? "amber" : "emerald"}
          hint={owing ? "still owed" : "nothing outstanding"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Date", "Detail", "Charged", "Received", "Balance"]}
            empty={
              (data?.entries.length ?? 0) === 0 &&
              "Nothing has been charged to this child yet."
            }
          >
            {(data?.entries ?? []).map((e, i) => (
              <tr key={`${e.kind}-${e.fee_id}-${i}`}>
                <td className={td}>{readableDate(e.on)}</td>
                <td className={tdStrong}>
                  {e.detail}
                  {e.reference && (
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      {e.reference}
                    </span>
                  )}
                  {e.note && (
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      {e.note}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {Number(e.charged) > 0 ? (
                    <>
                      {inr(e.charged)}
                      {e.status && e.status !== "pending" && (
                        <Badge
                          tone={e.status === "paid" ? "emerald" : "neutral"}
                          className="ml-2"
                        >
                          {humanize(e.status)}
                        </Badge>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={td}>
                  {Number(e.paid) > 0 ? inr(e.paid) : "—"}
                </td>
                <td className={tdStrong}>{inr(e.balance)}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>

      <p className="text-[12px] text-ink-subtle">
        A charge raised on the same day as a receipt is listed first — you cannot
        pay a bill before it exists, and a balance that dips for one line reads
        as a mistake.
      </p>
    </div>
  );
}
