"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/Field";
import {
  FilterBar,
  PanelFooter,
  PersonCell,
  SearchBox,
  StatStrip,
} from "@/components/ui/Workspace";
import { BellRing, GraduationCap, Inbox, TrendingUp } from "lucide-react";
import { api, apiError } from "@/lib/api";

import { EnquiryFormModal } from "./EnquiryFormModal";
import {
  AdmissionSource,
  AdmissionStage,
  Enquiry,
  SOURCES,
  STAGES,
  label,
  stageTone,
} from "./types";

/** A select sized for the filter bar: same height as the search box. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Paginated<T> = { items: T[]; total: number; page: number; pages: number };

type Stats = {
  total: number;
  by_stage: Record<AdmissionStage, number>;
  enrolled: number;
  lost: number;
  open: number;
  conversion_rate: number;
  follow_ups_due: number;
};

export default function AdmissionsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [data, setData] = useState<Paginated<Enquiry> | null>(null);
  const [stage, setStage] = useState<AdmissionStage | "">("");
  const [source, setSource] = useState<AdmissionSource | "">("");
  const [dueOnly, setDueOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);

  async function load() {
    try {
      const params: Record<string, string | number | boolean> = { page, page_size: 50 };
      if (stage) params.stage = stage;
      if (source) params.source = source;
      if (dueOnly) params.follow_up_due = true;
      if (search) params.search = search;
      const [list, st] = await Promise.all([
        api.get<Paginated<Enquiry>>("/api/v1/school/admissions/enquiries", { params }),
        api.get<Stats>("/api/v1/school/admissions/stats"),
      ]);
      setData(list.data);
      setStats(st.data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, source, dueOnly, page]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-[18px]">
      <PageHeader
        title="Admissions"
        subtitle="Track enquiries from first contact to enrolment."
        actions={
          <>
            <Link href="/school/admissions/campaigns">
              <Button variant="secondary">Campaigns</Button>
            </Link>
            <Button onClick={() => setOpenCreate(true)}>+ New enquiry</Button>
          </>
        }
      />

      {/* The same four figures the stats endpoint already returns for this
          page — one strip instead of four cards. */}
      {stats && (
        <StatStrip
          stats={[
            { label: "Open enquiries", value: stats.open, note: `of ${stats.total} received`, icon: Inbox },
            {
              label: "Follow-ups due",
              value: stats.follow_ups_due,
              note: "Today or overdue",
              icon: BellRing,
            },
            { label: "Enrolled", value: stats.enrolled, note: `${stats.lost} lost`, icon: GraduationCap },
            {
              label: "Conversion",
              value: `${stats.conversion_rate}%`,
              note: `${stats.enrolled} enrolled · ${stats.lost} lost`,
              icon: TrendingUp,
            },
          ]}
        />
      )}

      {stats && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setStage("");
              setPage(1);
            }}
            className={pillClass(stage === "")}
          >
            All · {stats.total}
          </button>
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => {
                setStage(s);
                setPage(1);
              }}
              className={pillClass(stage === s)}
            >
              {label(s)} · {stats.by_stage[s] ?? 0}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
      >
        <FilterBar>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Student, parent, phone, email"
            label="Search enquiries"
          />
          <select
            aria-label="Source"
            value={source}
            onChange={(e) => {
              setSource(e.target.value as AdmissionSource | "");
              setPage(1);
            }}
            className={filterSelect}
          >
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
          <select
            aria-label="Follow-ups"
            value={dueOnly ? "due" : ""}
            onChange={(e) => {
              setDueOnly(e.target.value === "due");
              setPage(1);
            }}
            className={filterSelect}
          >
            <option value="">All enquiries</option>
            <option value="due">Follow-ups due only</option>
          </select>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </FilterBar>
      </form>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}
      {notice && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">{notice}</div>
      )}

      <Card className="overflow-x-auto">
        <CardHeader>
          <div>
            <CardTitle>Enquiries</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {[
                stage ? label(stage) : "Every stage",
                source ? label(source) : "All sources",
                dueOnly ? "Follow-ups due only" : "All follow-ups",
              ].join(" · ")}
            </p>
          </div>
        </CardHeader>
        <table className="min-w-full divide-y divide-surface-border text-[13px]">
          <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-bold">Student</th>
              <th className="px-4 py-3 font-bold">Class</th>
              <th className="px-4 py-3 font-bold">Parent</th>
              <th className="px-4 py-3 font-bold">Source</th>
              <th className="px-4 py-3 font-bold">Stage</th>
              <th className="px-4 py-3 font-bold">Follow-up</th>
              <th className="px-4 py-3 font-bold">Received</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {data?.items.map((e) => {
              const overdue =
                e.next_follow_up_date &&
                e.next_follow_up_date <= today &&
                e.stage !== "enrolled" &&
                e.stage !== "lost";
              return (
                <tr key={e.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <Link
                      href={`/school/admissions/${e.id}`}
                      className="block hover:underline"
                    >
                      <PersonCell name={e.student_name} />
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{e.applying_for_class ?? "—"}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    <div>{e.parent_name}</div>
                    <div className="text-xs text-ink-subtle">{e.parent_phone}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {label(e.source)}
                    {e.campaign_name && (
                      <div className="text-xs text-ink-subtle">{e.campaign_name}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={stageTone(e.stage)}>{label(e.stage)}</Badge>
                  </td>
                  <td className={`px-3 py-2 ${overdue ? "font-medium text-warning" : "text-ink-muted"}`}>
                    {e.next_follow_up_date ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-subtle">{e.created_at.slice(0, 10)}</td>
                </tr>
              );
            })}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-ink-muted">
                  No enquiries match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {data && (
          <PanelFooter
            left={`Showing ${data.items.length} of ${data.total.toLocaleString("en-IN")} enquiries`}
            right={
              data.pages > 1 ? (
                <span className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                    ← Prev
                  </Button>
                  <span className="text-[11px] font-bold text-ink-muted">
                    Page {data.page} of {data.pages}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={page >= data.pages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next →
                  </Button>
                </span>
              ) : (
                "All records on this page"
              )
            }
          />
        )}
      </Card>

      {openCreate && (
        <EnquiryFormModal
          onClose={() => setOpenCreate(false)}
          onSaved={(msg) => {
            setOpenCreate(false);
            setNotice(msg);
            load();
          }}
        />
      )}
    </div>
  );
}

function pillClass(active: boolean) {
  return `rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
    active
      ? "bg-brand-500/15 text-brand-300 ring-brand-500/40"
      : "bg-surface-subtle text-ink-muted ring-surface-border hover:text-ink"
  }`;
}
