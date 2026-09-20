"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  Textarea,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime, hhmm } from "@/lib/dates";

type Assessment = {
  id: number;
  kind: string;
  scheduled_at: string;
  venue: string | null;
  assessor_name: string | null;
  max_marks: string | null;
  marks_obtained: string | null;
  status: "scheduled" | "done" | "absent" | "cancelled";
  passed: boolean | null;
  remarks: string | null;
};
type AppRow = {
  id: number;
  application_no: string;
  student_name: string;
  class_name: string | null;
  applying_for_class: string | null;
  status: string;
};
type AppDetail = AppRow & { assessments: Assessment[] };

type Row = { app: AppRow; test: Assessment };

const base = "/api/v1/school/admissions/applications";
const OUTCOMES: Assessment["status"][] = ["done", "absent", "cancelled"];

function statusTone(s: Assessment["status"]) {
  if (s === "done") return "emerald" as const;
  if (s === "absent") return "rose" as const;
  if (s === "cancelled") return "neutral" as const;
  return "amber" as const;
}

export default function EntranceAssessmentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Row | null>(null);
  const [status, setStatus] = useState<Assessment["status"]>("done");
  const [marks, setMarks] = useState("");
  const [passed, setPassed] = useState<"" | "yes" | "no">("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      // Assessments only come back on the detail call, so the list is narrowed
      // to the assessment stage first and each of those is opened.
      const list = await api.get<AppRow[]>(base, { params: { status: "assessment" } });
      const details = await Promise.all(
        list.data.map((a) => api.get<AppDetail>(`${base}/${a.id}`).then((r) => r.data))
      );
      const out: Row[] = [];
      for (const d of details) {
        for (const test of d.assessments) out.push({ app: d, test });
      }
      out.sort((a, z) => a.test.scheduled_at.localeCompare(z.test.scheduled_at));
      setRows(out);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const open = (r: Row) => {
    setEditing(r);
    setStatus(r.test.status === "scheduled" ? "done" : r.test.status);
    setMarks(r.test.marks_obtained ?? "");
    setPassed(r.test.passed === null ? "" : r.test.passed ? "yes" : "no");
    setRemarks(r.test.remarks ?? "");
    setError(null);
    setDone(null);
  };

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await api.put(`${base}/assessments/${editing.test.id}`, {
        status,
        marks_obtained: status === "done" && marks !== "" ? marks : null,
        passed: passed === "" ? null : passed === "yes",
        remarks: remarks || null,
      });
      setDone(`Result recorded for ${editing.app.student_name}.`);
      setEditing(null);
      load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Row) => {
    if (!window.confirm(`Remove the ${humanize(r.test.kind).toLowerCase()} for ${r.app.student_name}?`)) {
      return;
    }
    setError(null);
    try {
      await api.delete(`${base}/assessments/${r.test.id}`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  };

  const waiting = rows.filter((r) => r.test.status === "scheduled");
  const marked = rows.filter((r) => r.test.status !== "scheduled");

  const renderTable = (list: Row[], showResult: boolean) => (
    <Table
      head={
        showResult
          ? ["When", "Child", "Kind", "Result", "Marks", "Outcome", ""]
          : ["When", "Child", "Kind", "Venue", "Assessor", ""]
      }
      empty={list.length === 0 && (showResult ? "Nothing has been marked yet." : "Nobody is waiting to be assessed.")}
    >
      {list.map((r) => (
        <tr key={r.test.id}>
          <td className={td}>{dateTime(r.test.scheduled_at)}</td>
          <td className={tdStrong}>
            {r.app.student_name}
            <span className="block text-[11px] font-normal text-ink-subtle">
              {r.app.application_no} · {r.app.class_name ?? r.app.applying_for_class ?? "—"}
            </span>
          </td>
          <td className={td}>{humanize(r.test.kind)}</td>
          {showResult ? (
            <>
              <td className={td}>
                <Badge tone={statusTone(r.test.status)}>{humanize(r.test.status)}</Badge>
              </td>
              <td className={td}>
                {r.test.marks_obtained ?? "—"}
                {r.test.max_marks && (
                  <span className="text-ink-subtle"> / {r.test.max_marks}</span>
                )}
              </td>
              <td className={td}>
                {r.test.passed === null ? (
                  "—"
                ) : (
                  <Badge tone={r.test.passed ? "emerald" : "rose"}>
                    {r.test.passed ? "Passed" : "Not passed"}
                  </Badge>
                )}
                {r.test.remarks && (
                  <span className="block text-[11px] text-ink-subtle">{r.test.remarks}</span>
                )}
              </td>
            </>
          ) : (
            <>
              <td className={td}>{r.test.venue ?? "—"}</td>
              <td className={td}>{r.test.assessor_name ?? "Not set"}</td>
            </>
          )}
          <td className={td}>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => open(r)}>
                {showResult ? "Edit" : "Record"}
              </Button>
              <Button size="sm" variant="danger" onClick={() => remove(r)}>
                Remove
              </Button>
            </div>
          </td>
        </tr>
      ))}
    </Table>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Entrance assessments"
        subtitle="Everybody at the assessment stage, and what they scored."
        actions={
          <Button variant="secondary" onClick={load} loading={loading}>
            Refresh
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {done && <NoticeBox>{done}</NoticeBox>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Scheduled" value={loading ? "…" : rows.length} />
        <StatCard label="Still to mark" value={loading ? "…" : waiting.length} accent={waiting.length ? "amber" : "emerald"} />
        <StatCard label="Marked" value={loading ? "…" : marked.length} />
        <StatCard
          label="Passed"
          value={loading ? "…" : marked.filter((r) => r.test.passed).length}
          accent="emerald"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Waiting to be marked</CardTitle>
          <Badge tone={waiting.length ? "amber" : "neutral"}>{waiting.length}</Badge>
        </CardHeader>
        <CardBody className="p-0">{renderTable(waiting, false)}</CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Already marked</CardTitle>
          <Badge tone="neutral">{marked.length}</Badge>
        </CardHeader>
        <CardBody className="p-0">{renderTable(marked, true)}</CardBody>
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Result — ${editing.app.student_name}` : ""}
      >
        <form onSubmit={save} className="space-y-4">
          <Select
            label="Outcome"
            value={status}
            onChange={(e) => setStatus(e.target.value as Assessment["status"])}
          >
            {OUTCOMES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
          {status === "done" && (
            <Input
              label="Marks"
              type="number"
              min={0}
              step="0.01"
              value={marks}
              onChange={(e) => setMarks(e.target.value)}
              hint={editing?.test.max_marks ? `Out of ${editing.test.max_marks}` : "No maximum was set when this was scheduled."}
            />
          )}
          <Select
            label="Passed"
            value={passed}
            onChange={(e) => setPassed(e.target.value as "" | "yes" | "no")}
          >
            <option value="">Not decided</option>
            <option value="yes">Passed</option>
            <option value="no">Not passed</option>
          </Select>
          <Textarea
            label="Remarks"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={3}
            placeholder="Read fluently; needed help with subtraction."
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Save result
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
