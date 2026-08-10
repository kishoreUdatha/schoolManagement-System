"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { api, apiError } from "@/lib/api";

type ExportDef = {
  key: string;
  label: string;
  path: string;
  hint?: string;
};

const exports: ExportDef[] = [
  {
    key: "students",
    label: "Students roster",
    path: "/api/v1/school/exports/students.csv",
    hint: "All active + inactive students",
  },
  {
    key: "staff",
    label: "Staff roster",
    path: "/api/v1/school/exports/staff.csv",
    hint: "Teachers, principal, accountant, non-teaching",
  },
  {
    key: "fees",
    label: "Fees",
    path: "/api/v1/school/exports/fees.csv",
    hint: "All fee records with paid / outstanding amounts",
  },
  {
    key: "homework",
    label: "Homework",
    path: "/api/v1/school/exports/homework.csv",
    hint: "Each homework + submission count",
  },
  {
    key: "behaviour",
    label: "Behaviour ratings",
    path: "/api/v1/school/exports/behaviour.csv",
  },
  {
    key: "marks",
    label: "Marks by exam",
    path: "/api/v1/school/exports/marks.csv?exam_id=",
    hint: "Append the exam id to the URL",
  },
];

export default function ExportsPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [examIdMarks, setExamIdMarks] = useState("");

  async function download(e: ExportDef) {
    setLoading(e.key);
    setError(null);
    try {
      const path = e.key === "marks" ? e.path + (examIdMarks || "1") : e.path;
      const { data, headers } = await api.get<string>(path, {
        responseType: "text",
      });
      const fname =
        /filename="([^"]+)"/.exec(headers["content-disposition"] || "")?.[1] ??
        `${e.key}.csv`;
      const blob = new Blob([data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">Exports</h1>
        <p className="mt-1 text-sm text-ink-muted">
          One-click CSV downloads of the most-used reports. Excel opens these
          natively.
        </p>
      </div>
      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {exports.map((e) => (
          <Card key={e.key}>
            <CardHeader>
              <CardTitle>{e.label}</CardTitle>
            </CardHeader>
            <CardBody>
              {e.hint && (
                <p className="text-xs text-ink-muted">{e.hint}</p>
              )}
              {e.key === "marks" && (
                <input
                  value={examIdMarks}
                  onChange={(ev) => setExamIdMarks(ev.target.value)}
                  placeholder="Exam ID (default 1)"
                  className="mt-2 w-full rounded-md border border-surface-border bg-surface-subtle px-3 py-1.5 text-sm text-ink"
                />
              )}
              <Button
                className="mt-3 w-full"
                onClick={() => download(e)}
                loading={loading === e.key}
              >
                Download CSV
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
