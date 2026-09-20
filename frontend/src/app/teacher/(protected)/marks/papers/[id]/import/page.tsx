"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ChangeEvent, useEffect, useState } from "react";
import { ChevronLeft, Download, Upload } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  WarnBox,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { openAuthed } from "@/lib/download";

type Section = { id: number; name: string };
type Job = {
  id: number;
  import_type: string;
  status: string;
  file_name: string | null;
  total_rows: number;
  good_rows: number;
  error_rows: number;
  imported_rows: number;
  created_at: string;
  created_by_name: string | null;
};

const base = "/api/v1/teacher/mark-imports";

/** Marks from a spreadsheet, for the teacher who owns the paper.
 *
 *  Nothing is written by the upload itself: the file is checked first and the
 *  bad rows come back as a file to fix, so a typo in row 30 does not leave
 *  rows 1 to 29 half-entered with no way to tell which.
 */
export default function TeacherMarksImportPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const classId = params.get("class_id");

  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState<number | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadHistory = () =>
    api
      .get<Job[]>(`${base}/papers/${id}/imports`)
      .then((r) => setHistory(r.data))
      .catch(() => setHistory([]));

  useEffect(() => {
    api
      .get<{
        subject_teacher_of: {
          class_id: number;
          sections: { section_id: number; section_name: string }[];
        }[];
      }>("/api/v1/teacher/my-classes")
      .then((r) => {
        const cs = r.data.subject_teacher_of.find((c) => c.class_id === Number(classId));
        const secs = cs?.sections.map((s) => ({ id: s.section_id, name: s.section_name })) ?? [];
        setSections(secs);
        if (secs.length > 0) setSectionId(secs[0].id);
      })
      .catch((e) => setError(apiError(e)));
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, classId]);

  const upload = async () => {
    if (!file || sectionId === "") return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("section_id", String(sectionId));
      const r = await api.post<Job>(`${base}/papers/${id}/imports`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setJob(r.data);
      loadHistory();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<Job>(`${base}/imports/${job.id}/commit`, {
        skip_bad_rows: true,
      });
      setJob(r.data);
      setDone(`${r.data.imported_rows} row(s) written.`);
      loadHistory();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setBusy(false);
    }
  };

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null);
    setJob(null);
    setDone(null);
  };

  return (
    <div className="space-y-6">
      <Link
        href={`/teacher/marks/papers/${id}${classId ? `?class_id=${classId}` : ""}`}
        className="inline-flex items-center gap-1 text-[13px] font-bold text-brand-600 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to the marks grid
      </Link>

      <PageHeader
        title="Upload marks"
        subtitle="One section at a time, from a spreadsheet. The file is checked before anything is written."
        actions={
          <Button
            variant="secondary"
            onClick={() => openAuthed(`${base}/template.csv`, "marks-template.csv")}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Blank template
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>
      {done && <NoticeBox>{done}</NoticeBox>}

      <Card>
        <CardHeader>
          <CardTitle>The file</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[12px] font-bold text-ink-muted">
              <span className="mb-1 block">Section</span>
              <Select
                value={sectionId}
                onChange={(e) => setSectionId(Number(e.target.value))}
                aria-label="Section"
              >
                {sections.length === 0 && <option value="">No sections</option>}
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="text-[12px] font-bold text-ink-muted">
              <span className="mb-1 block">Spreadsheet (.csv)</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={pick}
                className="block text-[13px] text-ink-muted file:mr-3 file:rounded-[9px] file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-[13px] file:font-bold file:text-brand-600"
              />
            </label>
            <Button onClick={upload} loading={busy} disabled={!file || sectionId === ""}>
              <Upload className="mr-1.5 h-4 w-4" />
              Check the file
            </Button>
          </div>
          <p className="text-[12px] text-ink-subtle">
            Columns: admission_no, marks, status, remark. Leave marks blank when the child
            was absent or exempt and put that in the status column.
          </p>
        </CardBody>
      </Card>

      {job && (
        <Card>
          <CardHeader>
            <CardTitle>What the check found</CardTitle>
            <Badge tone={job.error_rows ? "amber" : "emerald"}>{job.status}</Badge>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Rows in the file" value={job.total_rows} />
              <StatCard label="Good" value={job.good_rows} accent="emerald" />
              <StatCard
                label="Need fixing"
                value={job.error_rows}
                accent={job.error_rows ? "rose" : "emerald"}
              />
              <StatCard label="Written" value={job.imported_rows} />
            </div>

            {job.error_rows > 0 && (
              <WarnBox>
                {job.error_rows} row(s) could not be read. Download them, fix them and
                upload again — or write the good rows now and deal with the rest after.
              </WarnBox>
            )}

            <div className="flex flex-wrap gap-2">
              {job.error_rows > 0 && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    openAuthed(`${base}/imports/${job.id}/errors.csv`, "rows-to-fix.csv")
                  }
                >
                  <Download className="mr-1.5 h-4 w-4" />
                  Rows to fix
                </Button>
              )}
              {job.status === "checked" && (
                <Button onClick={commit} loading={busy} disabled={job.good_rows === 0}>
                  Write {job.good_rows} row(s)
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Earlier uploads</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["File", "When", "Rows", "Written", "State"]}
            empty={history.length === 0 && "You haven't uploaded marks for this paper yet."}
          >
            {history.map((j) => (
              <tr key={j.id}>
                <td className={tdStrong}>{j.file_name ?? "—"}</td>
                <td className={td}>{j.created_at.slice(0, 16).replace("T", " ")}</td>
                <td className={td}>
                  {j.good_rows} good
                  {j.error_rows > 0 && (
                    <span className="block text-[11px] text-ink-subtle">
                      {j.error_rows} needed fixing
                    </span>
                  )}
                </td>
                <td className={td}>{j.imported_rows}</td>
                <td className={td}>
                  <Badge tone={j.status === "imported" ? "emerald" : "neutral"}>
                    {j.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
