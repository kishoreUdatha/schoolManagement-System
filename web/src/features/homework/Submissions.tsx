"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote, PickFirst } from "@/components/ui/states";
import { date, label } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { useSession } from "@/lib/useSession";
import { ChildPicker, downloadCsv, learnerState } from "./shared";
import { useLearnerHomework } from "./LearnerHomework";
import type { Progress, Project } from "./types";

const isLearner = (role: string | undefined) => role === "student" || role === "parent";

/** Page-head "Start evaluation", for the teacher only (keeps ?id=). */
export function StartEvaluation() {
  const role = useSession()?.user.role;
  const id = useSearchParams().get("id");
  if (isLearner(role)) return null;
  return (
    <Link href={id ? `${routeOf(137)}?id=${id}` : routeOf(134)} className="btn primary">
      <Icon name="arrow" className="sm" />
      Start evaluation
    </Link>
  );
}

/**
 * SCR-136. A teacher sees every student's progress on one assignment
 * (?id= project; GET /teacher/projects/{id}/progress). A student or parent
 * sees what has been handed in (student / parent homework portals).
 */
export function Submissions() {
  const role = useSession()?.user.role;
  return isLearner(role) ? <LearnerSubmissions /> : <ProjectSubmissions />;
}

function Filters({ search, setSearch, status, setStatus, states, extra }: { search: string; setSearch: (v: string) => void; status: string; setStatus: (v: string) => void; states: string[]; extra?: ReactNode }) {
  return (
    <div className="filterbar">
      <div className="searchbox">
        <Icon name="search" className="sm" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assignment submissions…" aria-label="Search records" />
      </div>
      {extra}
      <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="">All statuses</option>
        {states.map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}

function ProjectSubmissions() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const projects = useApi<Project[]>(id ? "/api/v1/teacher/projects" : null);
  const progress = useApi<Progress[]>(id ? `/api/v1/teacher/projects/${id}/progress` : null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [note, setNote] = useState<string | null>(null);

  if (!id) return <PickFirst what="assignment" href={routeOf(134)} cta="Open the assignment list" />;
  const p = projects.data?.find((x) => String(x.id) === id);

  const columns = ["Student", "Admission no.", "Submitted on", "Attachments", "Score", "Status"];
  const shown = (progress.data ?? [])
    .filter((r) => !search || `${r.student_name} ${r.student_admission_no}`.toLowerCase().includes(search.toLowerCase()))
    .filter((r) => !status || label(r.status) === status);
  const cells = (r: Progress) => [
    r.student_admission_no ?? "—",
    date(r.submitted_at),
    r.attachment_url ? "Link" : "—",
    r.rating != null ? `${r.rating} / 5` : "—",
    label(r.status),
  ];
  const rows: Row[] = shown.map((r) => [{ name: r.student_name ?? "—", sub: r.student_admission_no ?? undefined }, ...cells(r)]);

  return (
    <>
      <Filters search={search} setSearch={setSearch} status={status} setStatus={setStatus} states={["Not started", "In progress", "Submitted", "Reviewed"]} />
      <ErrorNote>{note ?? projects.error ?? progress.error}</ErrorNote>
      <Panel
        title={p ? p.title : "All records"}
        sub={p ? `${p.class_name ?? ""} · ${p.subject_name ?? ""} · due ${date(p.deadline)}` : progress.loading ? "Loading…" : undefined}
        action={
          <button
            type="button"
            className="btn"
            onClick={() => downloadCsv(`assignment-${id}-submissions.csv`, columns, shown.map((r) => [r.student_name ?? "", ...cells(r)]))}
          >
            <Icon name="download" className="sm" />
            Export
          </button>
        }
        flush
      >
        <DataTable
          columns={columns}
          rows={rows}
          onView={(k) => {
            const r = shown[k];
            if (r.id === 0) setNote(`${r.student_name ?? "This student"} has not started yet — nothing to evaluate.`);
            else router.push(`${routeOf(137)}?id=${id}&progress=${r.id}`);
          }}
          empty={progress.loading ? "Loading…" : "No students match."}
        />
      </Panel>
    </>
  );
}

function LearnerSubmissions() {
  const router = useRouter();
  const { learner, list, subs, subOf } = useLearnerHomework();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");

  const handed = (list.data ?? []).filter((h) => subOf(h)).sort((a, b) => (subOf(b)?.submitted_at ?? "").localeCompare(subOf(a)?.submitted_at ?? ""));
  const shown = handed
    .filter((h) => !search || h.title.toLowerCase().includes(search.toLowerCase()))
    .filter((h) => !status || learnerState(h, subOf(h)) === status);
  const columns = ["Homework", "Subject", "Submitted on", "Attachments", "Score", "Status"];
  const cells = shown.map((h) => {
    const s = subOf(h)!;
    return [
      h.title,
      h.subject_name ?? "—",
      date(s.submitted_at),
      [s.files?.length ? `${s.files.length} file${s.files.length === 1 ? "" : "s"}` : "", s.attachment_url ? "Link" : ""].filter(Boolean).join(" · ") || "—",
      s.marking?.total != null ? `${s.marking.total} / ${s.marking.max_total}` : "—",
      learnerState(h, s),
    ];
  });

  return (
    <>
      <Filters search={search} setSearch={setSearch} status={status} setStatus={setStatus} states={["Submitted", "Returned", "Marked"]} extra={<ChildPicker learner={learner} />} />
      <ErrorNote>{learner.error ?? list.error}</ErrorNote>
      <Panel
        title="All records"
        sub={learner.who ? `${learner.who.name} · ${learner.who.sub}` : undefined}
        action={
          <button type="button" className="btn" onClick={() => downloadCsv("my-submissions.csv", columns, cells)}>
            <Icon name="download" className="sm" />
            Export
          </button>
        }
        flush
      >
        <DataTable
          columns={columns}
          rows={cells}
          onView={(k) => router.push(`${routeOf(132)}?id=${shown[k].id}${learner.childQuery}`)}
          empty={list.loading || subs.loading ? "Loading…" : "Nothing handed in yet."}
        />
      </Panel>
    </>
  );
}
