"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

import { EnquiryFormModal } from "./EnquiryFormModal";
import {
  AdmissionSource,
  AdmissionStage,
  Enquiry,
  SOURCES,
  STAGES,
  label,
  selectClass,
  stageTone,
} from "./types";

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Admissions</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Track enquiries from first contact to enrolment.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/school/admissions/campaigns">
            <Button variant="secondary">Campaigns</Button>
          </Link>
          <Button onClick={() => setOpenCreate(true)}>+ New enquiry</Button>
        </div>
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Open enquiries" value={stats.open} />
          <StatCard
            label="Follow-ups due"
            value={stats.follow_ups_due}
            accent={stats.follow_ups_due ? "amber" : "brand"}
            hint="Today or overdue"
          />
          <StatCard label="Enrolled" value={stats.enrolled} accent="emerald" />
          <StatCard
            label="Conversion"
            value={`${stats.conversion_rate}%`}
            hint={`${stats.enrolled} enrolled · ${stats.lost} lost`}
          />
        </div>
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
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
      >
        <Input
          label="Search"
          placeholder="Student, parent, phone, email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">Source</span>
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value as AdmissionSource | "");
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            checked={dueOnly}
            onChange={(e) => {
              setDueOnly(e.target.checked);
              setPage(1);
            }}
          />
          Follow-ups due only
        </label>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {error && (
        <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>
      )}

      <Card className="overflow-x-auto">
        <table className="min-w-full divide-y divide-surface-border text-sm">
          <thead className="text-left text-xs uppercase text-ink-subtle">
            <tr>
              <th className="px-3 py-2 font-medium">Student</th>
              <th className="px-3 py-2 font-medium">Class</th>
              <th className="px-3 py-2 font-medium">Parent</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Stage</th>
              <th className="px-3 py-2 font-medium">Follow-up</th>
              <th className="px-3 py-2 font-medium">Received</th>
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
                  <td className="px-3 py-2">
                    <Link
                      href={`/school/admissions/${e.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {e.student_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{e.applying_for_class ?? "—"}</td>
                  <td className="px-3 py-2 text-ink-muted">
                    <div>{e.parent_name}</div>
                    <div className="text-xs text-ink-subtle">{e.parent_phone}</div>
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {label(e.source)}
                    {e.campaign_name && (
                      <div className="text-xs text-ink-subtle">{e.campaign_name}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={stageTone(e.stage)}>{label(e.stage)}</Badge>
                  </td>
                  <td className={`px-3 py-2 ${overdue ? "font-medium text-amber-500" : "text-ink-muted"}`}>
                    {e.next_follow_up_date ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-ink-subtle">{e.created_at.slice(0, 10)}</td>
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
      </Card>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm text-ink-muted">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            ← Prev
          </Button>
          Page {data.page} of {data.pages}
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= data.pages}
            onClick={() => setPage(page + 1)}
          >
            Next →
          </Button>
        </div>
      )}

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
