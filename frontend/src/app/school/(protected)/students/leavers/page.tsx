"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FileWarning, Users } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Select,
  Table,
  WarnBox,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";

type AcademicYear = { id: number; name: string; is_current: boolean };
type Leaver = {
  student_id: number;
  admission_no: string;
  full_name: string;
  class_name: string | null;
  section_name: string | null;
  last_year_name: string | null;
  last_class_name: string | null;
  last_section_name: string | null;
  outcome: string | null;
  certificate_id: number | null;
  certificate_no: string | null;
  certificate_status: string | null;
};
type Leavers = {
  leavers: Leaver[];
  total: number;
  without_certificate: number;
};

/** Children who are no longer on the roll.
 *
 *  The list is derived rather than stored, so it cannot disagree with who is
 *  actually active. The column that matters is the last one: a child who left
 *  without their leaving certificate will come back for it, usually years
 *  later and usually in a hurry.
 */
export default function LeaversPage() {
  const [data, setData] = useState<Leavers | null>(null);
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [yearId, setYearId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AcademicYear[]>("/api/v1/school/academic-years")
      .then((r) => setYears(r.data))
      .catch(() => setYears([]));
  }, []);

  const load = useCallback(() => {
    api
      .get<Leavers>("/api/v1/school/student-detail/leavers", {
        params: { year_id: yearId || undefined },
      })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [yearId]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = data?.leavers ?? [];
  const missing = data?.without_certificate ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leavers"
        subtitle="Children who are no longer studying here, and whether they were given their certificate."
        actions={
          <Select
            aria-label="Academic year"
            value={yearId}
            onChange={(e) => setYearId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Every year</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Leavers" value={data?.total ?? "—"} icon={Users} />
        <StatCard
          label="Without a certificate"
          value={missing}
          accent={missing ? "amber" : "emerald"}
          icon={missing ? FileWarning : undefined}
        />
      </div>

      {missing > 0 && (
        <WarnBox>
          {missing} {missing === 1 ? "child has" : "children have"} left without a leaving
          certificate on file. They will need one to enrol anywhere else, and issuing it
          years later means reconstructing a record nobody remembers.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Who has left</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Admission no", "Student", "Last year", "Last class", "Outcome", "Certificate"]}
            empty={rows.length === 0 && "Nobody has left in this period."}
          >
            {rows.map((r) => (
              <tr key={r.student_id}>
                <td className={td}>{r.admission_no}</td>
                <td className={tdStrong}>
                  <Link
                    href={`/school/students/${r.student_id}`}
                    className="hover:text-brand-600 hover:underline"
                  >
                    {r.full_name}
                  </Link>
                </td>
                <td className={td}>{r.last_year_name ?? "—"}</td>
                <td className={td}>
                  {r.last_class_name ? `${r.last_class_name} ${r.last_section_name ?? ""}`.trim() : "—"}
                </td>
                <td className={td}>
                  {r.outcome ? (
                    <Badge tone={r.outcome === "left" ? "neutral" : "amber"}>
                      {humanize(r.outcome)}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={td}>
                  {r.certificate_id ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        openAuthed(
                          `/api/v1/school/certificates/${r.certificate_id}/pdf`,
                          `certificate-${r.admission_no}.pdf`
                        )
                      }
                    >
                      {r.certificate_no ?? "Open"}
                    </Button>
                  ) : (
                    <Badge tone="amber">Not issued</Badge>
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
