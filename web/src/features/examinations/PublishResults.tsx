"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Badge, Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { api, errorText } from "@/lib/api";
import { date, dateTime, label } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import type { AcademicYear } from "@/features/students/types";
import type { Exam, ExamDashboard } from "./types";

/**
 * SCR-150, live: GET /school/exams?academic_year_id= and each exam's
 * /school/exam-ops/{id}/dashboard (what is still outstanding);
 * POST /school/exams/{id}/publish and /unpublish. The principal is told what
 * is unfinished before the publish goes through.
 */
export function PublishResults() {
  const years = useApi<AcademicYear[]>("/api/v1/school/academic-years");
  const [yearId, setYearId] = useState<number | null>(null);
  useEffect(() => {
    if (yearId === null && years.data?.length) setYearId((years.data.find((y) => y.is_current) ?? years.data[0]).id);
  }, [years.data, yearId]);
  const exams = useApi<Exam[]>(yearId ? "/api/v1/school/exams" : null, { academic_year_id: yearId });
  const [checks, setChecks] = useState<Record<number, ExamDashboard | "error">>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChecks({});
    (exams.data ?? []).forEach((e) =>
      api
        .get<ExamDashboard>(`/api/v1/school/exam-ops/${e.id}/dashboard`)
        .then((d) => setChecks((c) => ({ ...c, [e.id]: d })))
        .catch(() => setChecks((c) => ({ ...c, [e.id]: "error" }))),
    );
  }, [exams.data]);

  const list = exams.data ?? [];
  const check = (id: number) => {
    const c = checks[id];
    return c && c !== "error" ? c : null;
  };
  const published = list.filter((e) => e.is_published).length;
  const ready = list.filter((e) => !e.is_published && check(e.id)?.ready_to_publish).length;
  const checked = list.filter((e) => checks[e.id]).length;

  async function act(e: Exam, action: "publish" | "unpublish") {
    const c = check(e.id);
    if (action === "publish") {
      const outstanding = c?.blockers.map((b) => `• ${b.detail}`).join("\n");
      const msg = outstanding
        ? `${e.name} is not finished:\n${outstanding}\n\nPublishing now puts these results in front of families as they stand. Publish anyway?`
        : `Every paper of ${e.name} is marked and signed off. Publish the results to students and parents?`;
      if (!window.confirm(msg)) return;
    } else if (!window.confirm(`Take ${e.name} back off the student and parent portals? Families may already have seen it.`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/school/exams/${e.id}/${action}`);
      notify(action === "publish" ? `${e.name} is now with families.` : `${e.name} has been taken back.`);
      exams.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const n = (v: number) => (exams.loading ? "…" : String(v));
  const stats = [
    { label: "Exams", value: n(list.length), note: years.data?.find((y) => y.id === yearId)?.name ?? "This academic year" },
    { label: "Published", value: n(published), note: "Families can see these" },
    { label: "Ready to publish", value: checked < list.length ? "…" : String(ready), note: ready ? "Marked and signed off" : "Nothing waiting on you" },
    { label: "Not ready", value: checked < list.length ? "…" : String(list.length - published - ready), note: "Still missing marks or sign-off" },
  ];

  return (
    <>
      <div className="filterbar">
        <select aria-label="Academic year" value={yearId ?? ""} onChange={(e) => setYearId(Number(e.target.value))}>
          {years.data?.map((y) => (
            <option key={y.id} value={y.id}>
              {`${y.name}${y.is_current ? " (current)" : ""}`}
            </option>
          ))}
        </select>
      </div>
      <StatStrip items={stats} compact />
      <div className="tip">
        <Icon name="shield" className="sm" />
        <span>Review what is still outstanding before making results available to students and parents. Results can be taken back afterwards, but families may already have seen them.</span>
      </div>
      <ErrorNote>{error ?? years.error ?? exams.error}</ErrorNote>
      <Panel title="Result publication" sub="What is marked, what is signed off, and what has gone to families" action={<Badge>{ready ? "Ready" : "Nothing ready"}</Badge>} flush>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Exam</th>
                <th>Dates</th>
                <th>Papers</th>
                <th>Marks entered</th>
                <th>Marks verified</th>
                <th>Status</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => {
                const c = check(e.id);
                const state = e.is_published ? "Published" : c?.ready_to_publish ? "Ready" : c ? `${c.blockers.length} outstanding` : checks[e.id] === "error" ? "Could not check" : "Checking…";
                return (
                  <tr key={e.id}>
                    <td>
                      {e.name}
                      <small className="muted" style={{ display: "block" }}>{label(e.kind)}</small>
                    </td>
                    <td>{`${date(e.start_date)} – ${date(e.end_date)}`}</td>
                    <td>{String(e.papers_count)}</td>
                    <td>{c ? `${c.marks_entered} / ${c.candidates}` : "—"}</td>
                    <td>{c ? `${c.papers_verified} / ${c.papers} papers` : "—"}</td>
                    <td>
                      <Badge>{state}</Badge>
                      {e.published_at ? <small className="muted" style={{ display: "block" }}>{dateTime(e.published_at)}</small> : null}
                    </td>
                    <td className="right">
                      {e.is_published ? (
                        <button type="button" className="btn" disabled={busy} onClick={() => act(e, "unpublish")}>
                          Take back
                        </button>
                      ) : (
                        <button type="button" className="btn primary" disabled={busy || !checks[e.id]} onClick={() => act(e, "publish")}>
                          <Icon name="check" className="sm" />
                          Publish results
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-empty" hidden={list.length > 0}>
          {exams.loading ? "Loading exams…" : "No exams have been set up for this year."}
        </div>
      </Panel>
    </>
  );
}
