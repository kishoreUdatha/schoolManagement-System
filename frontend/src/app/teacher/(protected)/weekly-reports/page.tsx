"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

type Section = { section_id: number; section_label: string };

type Report = {
  id: number;
  student_id: number;
  student_name: string | null;
  student_admission_no: string | null;
  week_start: string;
  week_end: string;
  attendance_present: number;
  attendance_absent: number;
  attendance_late: number;
  attendance_half_day: number;
  attendance_pct: number;
  homework_total: number;
  homework_submitted: number;
  homework_submission_pct: number;
  marks_summary: { papers: number; avg_pct: number; pass_rate_pct: number } | null;
  behaviour_avg: number | null;
  teacher_remark: string | null;
  shared_at: string | null;
};

function lastMonday(): string {
  const d = new Date();
  const day = d.getDay() || 7; // Mon=1..Sun=7
  d.setDate(d.getDate() - day + 1 - 7); // last Monday
  return d.toISOString().slice(0, 10);
}

export default function TeacherWeeklyReportsPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionId, setSectionId] = useState<number | "">("");
  const [weekStart, setWeekStart] = useState<string>(lastMonday());
  const [items, setItems] = useState<Report[]>([]);
  const [remark, setRemark] = useState("");
  const [share, setShare] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ class_teacher_of: Section[] }>("/api/v1/teacher/my-classes")
      .then((r) => {
        setSections(r.data.class_teacher_of);
        if (r.data.class_teacher_of.length > 0) {
          setSectionId(r.data.class_teacher_of[0].section_id);
        }
      })
      .catch((e) => setError(apiError(e)));
  }, []);

  async function load() {
    if (!sectionId) return;
    try {
      const { data } = await api.get<Report[]>("/api/v1/teacher/weekly-reports", {
        params: { section_id: sectionId, week_start: weekStart },
      });
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionId, weekStart]);

  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!sectionId) return;
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/v1/teacher/weekly-reports/generate", {
        section_id: sectionId,
        week_start: weekStart,
        teacher_remark: remark.trim() || null,
        share_with_parents: share,
      });
      setNotice("Reports generated.");
      await load();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }

  async function toggleShare(r: Report) {
    try {
      await api.patch(`/api/v1/teacher/weekly-reports/${r.id}`, {
        share_with_parents: !r.shared_at,
      });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Weekly reports</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Per-student weekly snapshot of attendance, homework, marks and
          behaviour for sections you class-teach.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate / refresh</CardTitle>
        </CardHeader>
        <CardBody>
          <form onSubmit={generate} className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">Section *</span>
              <select
                value={sectionId}
                onChange={(e) =>
                  setSectionId(e.target.value ? Number(e.target.value) : "")
                }
                className="rounded-lg border border-surface-border bg-surface-subtle px-3 py-1.5 text-ink"
                required
              >
                {sections.map((s) => (
                  <option key={s.section_id} value={s.section_id}>
                    {s.section_label}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Week starting (Mon)"
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">Teacher remark</span>
              <input
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="Optional shared remark for all rows"
                className="rounded-lg border border-surface-border bg-surface-subtle px-3 py-1.5 text-ink"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={share}
                onChange={(e) => setShare(e.target.checked)}
              />
              Share with parents
            </label>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" loading={loading} disabled={!sectionId}>
                Generate
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}

      {items.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-ink-muted">
              No reports yet for this section + week. Generate above.
            </p>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <table className="min-w-full divide-y divide-surface-border text-sm">
              <thead className="text-left text-xs uppercase text-ink-subtle">
                <tr>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Att %</th>
                  <th className="px-3 py-2 font-medium">HW</th>
                  <th className="px-3 py-2 font-medium">Marks</th>
                  <th className="px-3 py-2 font-medium">Behaviour</th>
                  <th className="px-3 py-2 font-medium">Shared</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {items.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-ink">
                        {r.student_name}
                      </div>
                      <div className="font-mono text-xs text-ink-subtle">
                        {r.student_admission_no}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {r.attendance_pct}%
                      <div className="text-xs text-ink-subtle">
                        P{r.attendance_present} A{r.attendance_absent} L
                        {r.attendance_late}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {r.homework_submitted}/{r.homework_total}
                      <div className="text-xs text-ink-subtle">
                        {r.homework_submission_pct}%
                      </div>
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {r.marks_summary ? (
                        <>
                          {r.marks_summary.avg_pct}%
                          <div className="text-xs text-ink-subtle">
                            {r.marks_summary.papers} papers
                          </div>
                        </>
                      ) : (
                        <span className="text-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink">
                      {r.behaviour_avg ?? <span className="text-ink-subtle">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleShare(r)}
                      >
                        {r.shared_at ? "Unshare" : "Share"}
                      </Button>
                      {r.shared_at && (
                        <Badge tone="emerald" className="ml-1">
                          shared
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
