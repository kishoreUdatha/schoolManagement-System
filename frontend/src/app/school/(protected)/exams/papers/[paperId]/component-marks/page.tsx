"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Head = { id: number; name: string; max_marks: number; pass_marks: number };
type Row = {
  student_id: number;
  admission_no: string;
  student_name: string;
  roll_no: number | null;
  section_name: string | null;
  status: string;
  total: number | null;
  values: Record<string, number | null>;
};
type Grid = {
  paper_id: number;
  subject_name: string;
  class_name: string | null;
  max_marks: number;
  pass_marks: number;
  components: Head[];
  rows: Row[];
};

const STATUSES = ["scored", "absent", "exempt"];

/** Part-by-part marks entry.
 *
 *  The total column is never typed. It is the sum of the parts, shown as it
 *  is entered so the person marking can see what the child will actually get
 *  before saving — which is the only way a practical register and a report
 *  card can be guaranteed to agree.
 */
export default function ComponentMarksPage() {
  const { paperId } = useParams<{ paperId: string }>();
  const [grid, setGrid] = useState<Grid | null>(null);
  const [edits, setEdits] = useState<Record<number, Row>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<Grid>(`/api/v1/school/exam-ops/papers/${paperId}/component-marks`)
      .then((r) => {
        setGrid(r.data);
        setEdits(Object.fromEntries(r.data.rows.map((x) => [x.student_id, x])));
      })
      .catch((e) => setError(apiError(e)));
  }, [paperId]);

  const heads = grid?.components ?? [];

  const setValue = (studentId: number, componentId: number, raw: string) =>
    setEdits((e) => ({
      ...e,
      [studentId]: {
        ...e[studentId],
        values: {
          ...e[studentId].values,
          [String(componentId)]: raw === "" ? null : Number(raw),
        },
      },
    }));

  const setStatus = (studentId: number, status: string) =>
    setEdits((e) => ({ ...e, [studentId]: { ...e[studentId], status } }));

  /** What the child will get, worked out the same way the server will. */
  const totalOf = (row: Row): number | null => {
    if (row.status !== "scored") return null;
    let sum = 0;
    for (const h of heads) {
      const v = row.values[String(h.id)];
      if (v === null || v === undefined) return null;
      sum += v;
    }
    return sum;
  };

  const rows = useMemo(
    () => (grid?.rows ?? []).map((r) => edits[r.student_id] ?? r),
    [grid, edits]
  );

  const overMax = rows.some((r) =>
    heads.some((h) => {
      const v = r.values[String(h.id)];
      return v !== null && v !== undefined && (v < 0 || v > h.max_marks);
    })
  );
  const entered = rows.filter((r) => totalOf(r) !== null || r.status !== "scored").length;

  const save = async () => {
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const r = await api.put<Grid>(
        `/api/v1/school/exam-ops/papers/${paperId}/component-marks`,
        {
          rows: rows.map((x) => ({
            student_id: x.student_id,
            status: x.status,
            values: x.values,
          })),
        }
      );
      setGrid(r.data);
      setEdits(Object.fromEntries(r.data.rows.map((x) => [x.student_id, x])));
      setSaved("Saved. Each paper total is the sum of its parts.");
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href={`/school/exams/papers/${paperId}/components`}
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Parts of this paper
      </Link>

      <PageHeader
        title={grid ? `${grid.subject_name} — part marks` : "Part marks"}
        subtitle="Enter each part. The paper total is the sum of them and is never typed, so the parts and the whole cannot disagree."
        actions={
          <Button onClick={save} loading={busy} disabled={!grid || overMax}>
            Save
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {saved && <NoticeBox>{saved}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Children" value={rows.length} />
        <StatCard label="Entered" value={entered} />
        <StatCard label="Paper is out of" value={grid?.max_marks ?? "—"} />
        <StatCard label="Pass mark" value={grid?.pass_marks ?? "—"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{grid?.class_name ?? "Class"}</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={[
              "Roll",
              "Student",
              ...heads.map((h) => `${h.name} (${h.max_marks})`),
              "Total",
              "Status",
            ]}
            empty={rows.length === 0 && "No children sit this paper yet."}
          >
            {rows.map((r) => {
              const total = totalOf(r);
              const failing =
                total !== null && grid !== null && total < grid.pass_marks;
              return (
                <tr key={r.student_id}>
                  <td className={td}>{r.roll_no ?? "—"}</td>
                  <td className={tdStrong}>
                    {r.student_name}
                    <span className="block text-[11px] font-normal text-ink-subtle">
                      {r.admission_no}
                      {r.section_name ? ` · ${r.section_name}` : ""}
                    </span>
                  </td>
                  {heads.map((h) => {
                    const v = r.values[String(h.id)];
                    const bad = v !== null && v !== undefined && (v < 0 || v > h.max_marks);
                    return (
                      <td key={h.id} className="px-4 py-2">
                        <Input
                          type="number"
                          min={0}
                          max={h.max_marks}
                          className={bad ? "border-danger" : undefined}
                          disabled={r.status !== "scored"}
                          value={v ?? ""}
                          onChange={(e) => setValue(r.student_id, h.id, e.target.value)}
                          aria-label={`${h.name} for ${r.student_name}`}
                        />
                      </td>
                    );
                  })}
                  <td className={tdStrong}>
                    {total === null ? (
                      <span className="text-ink-subtle">—</span>
                    ) : (
                      <Badge tone={failing ? "rose" : "emerald"}>{total}</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Select
                      value={r.status}
                      onChange={(e) => setStatus(r.student_id, e.target.value)}
                      aria-label={`Status for ${r.student_name}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </td>
                </tr>
              );
            })}
          </Table>
        </CardBody>
      </Card>

      <p className="text-[12px] text-ink-subtle">
        A blank part leaves the total blank rather than counting as nought — a part nobody
        has marked yet and a part the child scored nothing in are different things.
      </p>
    </div>
  );
}
