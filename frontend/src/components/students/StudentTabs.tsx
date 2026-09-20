"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, Table, humanize, inr, td, tdStrong } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";

/** The rest of a child's file: attendance, fees, documents, library, conduct.
 *
 *  These all existed as school-wide registers you had to filter by hand. The
 *  question staff actually get asked is about one child, so the answer lives
 *  on the child. Every tab here is the same endpoint the register uses, asked
 *  for one student_id. */
const TABS = ["attendance", "fees", "documents", "library", "conduct"] as const;
type Tab = (typeof TABS)[number];

const base = "/api/v1/school";

type Attendance = {
  marked_days: number;
  present: number;
  absent: number;
  late: number;
  half_day: number;
  percent: number;
  months: { month: string; present: number; absent: number; late: number; half_day: number; percent: number }[];
  days: { date: string; status: string; remark: string | null }[];
};
type Fee = {
  id: number;
  fee_head_name: string;
  period: string;
  amount_due: string;
  amount_paid: string;
  due_date: string;
  status: string;
};
type Doc = {
  id: number;
  title: string;
  category: string;
  verification: string;
  expires_on: string | null;
  uploaded_at: string;
  file_name: string | null;
};
type Loan = {
  id: number;
  title: string;
  accession_no: string;
  issued_on: string;
  due_on: string;
  returned_on: string | null;
  overdue_days: number;
  fine_amount: string;
  fine_status: string;
};
type Incident = {
  id: number;
  occurred_on: string;
  category: string;
  severity: string;
  summary?: string;
  description?: string;
  status: string;
};

const TONE: Record<string, "emerald" | "amber" | "rose" | "neutral" | "brand"> = {
  present: "emerald", paid: "emerald", verified: "emerald", closed: "emerald", returned: "emerald",
  late: "amber", partial: "amber", pending: "amber", open: "amber", submitted: "amber",
  absent: "rose", overdue: "rose", rejected: "rose", high: "rose",
  half_day: "brand", waived: "neutral",
};

export function StudentTabs({ studentId }: { studentId: string }) {
  const [tab, setTab] = useState<Tab>("attendance");
  const [error, setError] = useState<string | null>(null);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [fees, setFees] = useState<Fee[] | null>(null);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [loans, setLoans] = useState<Loan[] | null>(null);
  const [incidents, setIncidents] = useState<Incident[] | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (tab === "attendance" && !attendance) {
          const { data } = await api.get<Attendance>(`${base}/reports/attendance/students/${studentId}`);
          setAttendance(data);
        } else if (tab === "fees" && !fees) {
          const { data } = await api.get<{ items: Fee[] }>(`${base}/fees/student-fees`, {
            params: { student_id: studentId, page_size: 100 },
          });
          setFees(data.items);
        } else if (tab === "documents" && !docs) {
          const { data } = await api.get<Doc[]>(`${base}/documents`, {
            params: { owner_type: "student", owner_id: studentId },
          });
          setDocs(data);
        } else if (tab === "library" && !loans) {
          const { data } = await api.get<Loan[]>(`${base}/library/loans`, {
            params: { student_id: studentId, open_only: false },
          });
          setLoans(data);
        } else if (tab === "conduct" && !incidents) {
          const { data } = await api.get<Incident[]>(`${base}/discipline/incidents`, {
            params: { student_id: studentId },
          });
          setIncidents(data);
        }
        setError(null);
      } catch (e) {
        setError(apiError(e));
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, studentId]);

  return (
    <Card>
      <CardHeader className="pb-0">
        <nav className="flex flex-wrap gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-[13px] font-bold transition-colors ${
                tab === t
                  ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
                  : "text-ink-muted hover:bg-surface-hover hover:text-ink"
              }`}
            >
              {humanize(t)}
            </button>
          ))}
        </nav>
      </CardHeader>
      <CardBody>
        <ErrorBox>{error}</ErrorBox>

        {tab === "attendance" && attendance && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Attendance" value={`${attendance.percent}%`} accent={attendance.percent < 75 ? "rose" : "emerald"} hint={`${attendance.marked_days} days marked`} />
              <StatCard label="Present" value={attendance.present} accent="emerald" />
              <StatCard label="Absent" value={attendance.absent} accent="rose" />
              <StatCard label="Late" value={attendance.late} accent="amber" />
            </div>
            <Table head={["Month", "Present", "Absent", "Late", "Half-day", "Percent"]} empty={attendance.months.length === 0 && "Nothing marked yet."}>
              {attendance.months.map((m) => (
                <tr key={m.month}>
                  <td className={tdStrong}>{m.month}</td>
                  <td className={td}>{m.present}</td>
                  <td className={td}>{m.absent}</td>
                  <td className={td}>{m.late}</td>
                  <td className={td}>{m.half_day}</td>
                  <td className={td}>
                    <Badge tone={m.percent < 75 ? "rose" : "emerald"}>{m.percent}%</Badge>
                  </td>
                </tr>
              ))}
            </Table>
            {attendance.days.filter((d) => d.status !== "present").length > 0 && (
              <>
                <h4 className="text-[13px] font-bold text-ink">Days away</h4>
                <Table head={["Date", "Status", "Reason given"]}>
                  {attendance.days
                    .filter((d) => d.status !== "present")
                    .slice(0, 60)
                    .map((d) => (
                      <tr key={d.date}>
                        <td className={tdStrong}>{d.date}</td>
                        <td className={td}>
                          <Badge tone={TONE[d.status] ?? "neutral"}>{humanize(d.status)}</Badge>
                        </td>
                        <td className={td}>{d.remark ?? "—"}</td>
                      </tr>
                    ))}
                </Table>
              </>
            )}
          </div>
        )}

        {tab === "fees" && fees && (
          <Table
            head={["Fee", "Period", "Due", "Paid", "Balance", "Due date", "Status"]}
            empty={fees.length === 0 && "Nothing charged to this child yet."}
          >
            {fees.map((f) => (
              <tr key={f.id}>
                <td className={tdStrong}>{f.fee_head_name}</td>
                <td className={td}>{f.period}</td>
                <td className={td}>{inr(f.amount_due)}</td>
                <td className={td}>{inr(f.amount_paid)}</td>
                <td className={tdStrong}>{inr(Number(f.amount_due) - Number(f.amount_paid))}</td>
                <td className={td}>{f.due_date}</td>
                <td className={td}>
                  <Badge tone={TONE[f.status] ?? "neutral"}>{humanize(f.status)}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "documents" && docs && (
          <Table
            head={["Document", "Category", "Expires", "State", ""]}
            empty={docs.length === 0 && "No documents on file."}
          >
            {docs.map((d) => (
              <tr key={d.id}>
                <td className={tdStrong}>{d.title}</td>
                <td className={td}>{humanize(d.category)}</td>
                <td className={td}>{d.expires_on ?? "—"}</td>
                <td className={td}>
                  <Badge tone={TONE[d.verification] ?? "neutral"}>{humanize(d.verification)}</Badge>
                </td>
                <td className={td}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => openAuthed(`${base}/documents/${d.id}/file`, d.file_name ?? undefined)}
                  >
                    Open
                  </Button>
                </td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "library" && loans && (
          <Table
            head={["Book", "Copy", "Issued", "Due", "Returned", "Fine"]}
            empty={loans.length === 0 && "This child has never borrowed a book."}
          >
            {loans.map((l) => (
              <tr key={l.id}>
                <td className={tdStrong}>{l.title}</td>
                <td className={`${td} font-mono`}>{l.accession_no}</td>
                <td className={td}>{l.issued_on}</td>
                <td className={td}>
                  {l.due_on}
                  {!l.returned_on && l.overdue_days > 0 && (
                    <Badge tone="rose">{l.overdue_days} days over</Badge>
                  )}
                </td>
                <td className={td}>{l.returned_on ?? "Still out"}</td>
                <td className={td}>
                  {Number(l.fine_amount) > 0 ? (
                    <Badge tone={TONE[l.fine_status] ?? "neutral"}>
                      {inr(l.fine_amount)} {humanize(l.fine_status)}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}

        {tab === "conduct" && incidents && (
          <Table
            head={["When", "What", "Severity", "State"]}
            empty={incidents.length === 0 && "Nothing on record — which is the good outcome."}
          >
            {incidents.map((i) => (
              <tr key={i.id}>
                <td className={tdStrong}>{i.occurred_on}</td>
                <td className={td}>
                  {humanize(i.category)}
                  {(i.summary || i.description) && (
                    <span className="block text-[11px] text-ink-subtle">{i.summary ?? i.description}</span>
                  )}
                </td>
                <td className={td}>
                  <Badge tone={TONE[i.severity] ?? "neutral"}>{humanize(i.severity)}</Badge>
                </td>
                <td className={td}>
                  <Badge tone={TONE[i.status] ?? "neutral"}>{humanize(i.status)}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </CardBody>
    </Card>
  );
}
