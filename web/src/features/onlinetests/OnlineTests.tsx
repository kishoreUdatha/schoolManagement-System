"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { StatStrip } from "@/components/ui/StatStrip";
import { dateTime } from "@/lib/format";
import { notify } from "@/lib/notify";
import { useApi } from "@/lib/useApi";
import { RESULTS_ROUTE, TESTS_ROUTE, num, testState, useClassSubjects, usePageAction } from "./kit";
import { TestEditor } from "./TestEditor";
import { TestForm } from "./TestForm";
import type { TestRead } from "./types";

/** NEW-023: the list without ?id=, one test's paper with it. */
export function OnlineTests() {
  const id = useSearchParams().get("id");
  return id ? <TestEditor testId={Number(id)} /> : <TestList />;
}

/** GET /school/online-tests?status=&class_subject_id=; POST to create. */
function TestList() {
  const router = useRouter();
  const cs = useClassSubjects();
  const [status, setStatus] = useState("");
  const [csId, setCsId] = useState("");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const list = useApi<TestRead[]>("/api/v1/school/online-tests", { status, class_subject_id: csId });
  const everything = useApi<TestRead[]>("/api/v1/school/online-tests");

  usePageAction(
    "add",
    useCallback(() => setCreating(true), []),
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (list.data ?? []).filter((t) => !q || t.title.toLowerCase().includes(q) || t.subject_name.toLowerCase().includes(q));
  }, [list.data, search]);

  const all = everything.data;
  const n = (f: (t: TestRead) => boolean) => (all ? String(all.filter(f).length) : "…");
  const stats = [
    { label: "Online tests", value: all ? String(all.length) : "…", note: "All the tests you can see" },
    { label: "Open now", value: n((t) => t.is_open), note: "Students can write them" },
    { label: "Drafts", value: n((t) => t.status === "draft"), note: "Not yet published" },
    { label: "Attempts", value: all ? String(all.reduce((s, t) => s + t.attempts, 0)) : "…", note: "Across every test" },
  ];

  const rows: Row[] = shown.map((t) => [
    t.title,
    `${t.class_name} · ${t.subject_name}`,
    t.audience_label,
    `${dateTime(t.starts_at)} – ${dateTime(t.ends_at)}`,
    `${t.question_count} · ${num(t.total_marks)} marks`,
    String(t.attempts),
    testState(t),
  ]);

  return (
    <>
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tests…" aria-label="Search tests" />
        </div>
        <select aria-label="Class and subject" value={csId} onChange={(e) => setCsId(e.target.value)}>
          <option value="">All classes & subjects</option>
          {cs.rows.map((c) => (
            <option key={c.class_subject_id} value={c.class_subject_id}>
              {`${c.class_name} · ${c.subject_name}`}
            </option>
          ))}
        </select>
        <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="closed">Closed</option>
        </select>
      </div>
      <ErrorNote>{list.error ?? cs.error}</ErrorNote>
      <Panel title="Online tests" sub={`${shown.length} test${shown.length === 1 ? "" : "s"}${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Title", "Class & subject", "Audience", "Window", "Questions", "Attempts", "Status"]}
          rows={rows}
          selectable={false}
          actions={(i) => (
            <>
              <button type="button" className="btn" onClick={() => router.push(`${TESTS_ROUTE()}?id=${shown[i].id}`)}>
                Open
              </button>
              {shown[i].status !== "draft" ? (
                <button type="button" className="btn" onClick={() => router.push(`${RESULTS_ROUTE()}?id=${shown[i].id}`)}>
                  Results
                </button>
              ) : null}
            </>
          )}
          empty={list.loading ? "Loading tests…" : search || status || csId ? "No tests match these filters." : "No online tests yet. Create the first one."}
        />
      </Panel>
      {creating ? (
        <TestForm
          test={null}
          classSubjects={cs.rows}
          onClose={() => setCreating(false)}
          onSaved={(t) => {
            notify("Test created. Now add its questions.");
            setCreating(false);
            router.push(`${TESTS_ROUTE()}?id=${t.id}`);
          }}
        />
      ) : null}
    </>
  );
}
