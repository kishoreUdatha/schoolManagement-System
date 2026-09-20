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
  WarnBox,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { api, apiError } from "@/lib/api";

type Parent = {
  user_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  relation: string | null;
  is_active: boolean;
};
type Sibling = {
  student_id: number;
  admission_no: string;
  full_name: string;
  roll_no: number | null;
  class_name: string | null;
  section_name: string | null;
  is_active: boolean;
  shared_parents: string[];
};
type Family = {
  student_id: number;
  admission_no: string;
  full_name: string;
  class_name: string | null;
  section_name: string | null;
  parents: Parent[];
  siblings: Sibling[];
};

export default function StudentFamilyPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Family | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Family>(`/api/v1/school/student-detail/${id}/family`)
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, [id]);

  const parents = data?.parents ?? [];
  const siblings = data?.siblings ?? [];

  return (
    <div className="space-y-6">
      <Link
        href={`/school/students/${id}`}
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to the child
      </Link>

      <PageHeader
        title={data ? `${data.full_name} — family` : "Family"}
        subtitle="Who to contact, and the other children those parents have here."
      />
      <ErrorBox>{error}</ErrorBox>

      {data && parents.length === 0 && (
        <WarnBox>
          No parent is linked to this child. Nobody can be contacted about them, and
          nobody can see their homework or results — link a parent from the child&apos;s
          record.
        </WarnBox>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Parents</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          {parents.length === 0 && (
            <p className="text-[13px] text-ink-subtle">Nobody linked yet.</p>
          )}
          {parents.map((p) => (
            <div
              key={p.user_id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-[10px] border border-surface-border px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/school/parents/${p.user_id}`}
                  className="text-[15px] font-extrabold text-ink hover:text-brand-600 hover:underline"
                >
                  {p.full_name}
                </Link>
                <p className="mt-0.5 text-[12px] text-ink-muted">
                  {humanize(p.relation)}
                  {p.phone ? ` · ${p.phone}` : ""}
                  {p.email ? ` · ${p.email}` : ""}
                </p>
              </div>
              {p.is_active ? (
                <Badge tone="emerald">Active</Badge>
              ) : (
                <Badge tone="amber">Switched off</Badge>
              )}
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Siblings here</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Admission no", "Student", "Class", "Shared parent"]}
            empty={
              siblings.length === 0 &&
              "No other child at this school shares a parent with them."
            }
          >
            {siblings.map((s) => (
              <tr key={s.student_id}>
                <td className={td}>{s.admission_no}</td>
                <td className={tdStrong}>
                  <Link
                    href={`/school/students/${s.student_id}/family`}
                    className="hover:text-brand-600 hover:underline"
                  >
                    {s.full_name}
                  </Link>
                  {!s.is_active && (
                    <Badge tone="neutral" className="ml-2">
                      Left
                    </Badge>
                  )}
                </td>
                <td className={td}>
                  {s.class_name} {s.section_name}
                </td>
                <td className={td}>{s.shared_parents.join(", ") || "—"}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
