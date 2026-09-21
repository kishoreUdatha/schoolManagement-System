"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { Panel } from "@/components/ui/primitives";
import { StatStrip } from "@/components/ui/StatStrip";
import { ErrorNote } from "@/components/ui/states";
import { api, errorText, type Paginated } from "@/lib/api";
import { date, label } from "@/lib/format";
import { routeOf } from "@/lib/screens";
import { useApi } from "@/lib/useApi";
import { downloadCsv, ENQ, useOnAction } from "./shared";
import { SOURCES, STAGES, type AdmissionStats, type Enquiry } from "./types";

const PAGE_SIZE = 25;

/**
 * SCR-044, live: GET /admissions/enquiries (stage, source, follow_up_due,
 * search, paging) and GET /admissions/stats for the headline figures.
 */
export function EnquiryList() {
  const router = useRouter();
  const [stage, setStage] = useState("");
  const [source, setSource] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(typed.trim()), 300);
    return () => clearTimeout(t);
  }, [typed]);
  useEffect(() => setPage(1), [stage, source, dueOnly, search]);

  const filters = { stage, source, follow_up_due: dueOnly || undefined, search };
  const stats = useApi<AdmissionStats>("/api/v1/school/admissions/stats");
  const list = useApi<Paginated<Enquiry>>(ENQ, { ...filters, page, page_size: PAGE_SIZE });

  // Export every enquiry that matches the filters, not just this page.
  useOnAction("export-enquiries", async () => {
    setExportError(null);
    try {
      const all = await api.get<Paginated<Enquiry>>(ENQ, { ...filters, page: 1, page_size: 200 });
      downloadCsv(
        "enquiries.csv",
        ["Enquiry", "Applicant", "Applying for", "Parent", "Mobile", "Email", "Source", "Counsellor", "Stage", "Next follow-up", "Created"],
        all.items.map((e) => [e.id, e.student_name, e.applying_for_class, e.parent_name, e.parent_phone, e.parent_email, label(e.source), e.assigned_to_name, label(e.stage), e.next_follow_up_date, e.created_at.slice(0, 10)]),
      );
    } catch (err) {
      setExportError(errorText(err));
    }
  });

  const s = stats.data;
  const n = (v: number | undefined) => (v === undefined ? "…" : v.toLocaleString("en-IN"));
  const figures = [
    { label: "Total enquiries", value: n(s?.total), note: "All admission cycles" },
    // "New this week" in the mock: the API has no created-since count, so this shows open enquiries instead.
    { label: "Open enquiries", value: n(s?.open), note: "Not yet enrolled or lost" },
    { label: "Follow-ups due", value: n(s?.follow_ups_due), note: "Today or overdue" },
    { label: "Confirmed", value: n(s?.enrolled), note: s ? `Converted to students · ${s.conversion_rate.toFixed(1)}%` : "Converted to students" },
  ];

  const items = list.data?.items ?? [];
  const rows: Row[] = items.map((e) => [
    { name: e.student_name, sub: `ENQ-${e.id} · ${date(e.created_at)}` },
    e.applying_for_class ?? "—",
    e.parent_name,
    label(e.source),
    e.assigned_to_name ?? "Unassigned",
    label(e.stage),
  ]);

  return (
    <>
      <StatStrip items={figures} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by applicant, parent or phone…" aria-label="Search enquiries" />
        </div>
        <select aria-label="Filter by source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">All sources</option>
          {SOURCES.map((x) => (
            <option key={x} value={x}>
              {label(x)}
            </option>
          ))}
        </select>
        <select aria-label="Filter by stage" value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">All stages</option>
          {STAGES.map((x) => (
            <option key={x} value={x}>
              {label(x)}
            </option>
          ))}
        </select>
        <button type="button" className={`btn ${dueOnly ? "primary" : ""}`} aria-pressed={dueOnly} onClick={() => setDueOnly(!dueOnly)}>
          <Icon name="calendar" className="sm" />
          Follow-ups due
        </button>
      </div>
      <ErrorNote>{exportError ?? list.error ?? stats.error}</ErrorNote>
      <Panel title="All records" sub={`All enquiries${list.loading ? " · Loading…" : ""}`} flush>
        <DataTable
          columns={["Applicant", "Applying for", "Parent", "Source", "Counsellor", "Stage"]}
          rows={rows}
          total={list.data?.total}
          page={page}
          pages={list.data?.pages || 1}
          onPage={setPage}
          onView={(i) => router.push(`${routeOf(46)}?id=${items[i].id}`)}
          empty={list.loading ? "Loading enquiries…" : search || stage || source || dueOnly ? "No enquiries match these filters." : "No enquiries yet. Add the first one."}
        />
      </Panel>
    </>
  );
}
