"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Table, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { FilterBar, PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { CalendarRange, LayoutList, Layers } from "lucide-react";
import { api, apiError } from "@/lib/api";

/** A select sized for the filter bar: same height as the search box. */
const filterSelect =
  "h-[41px] rounded-control border border-surface-control bg-surface-raised px-3 text-[12px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300 disabled:cursor-not-allowed disabled:text-ink-subtle";

type Year = { id: number; name: string; start_date: string; end_date: string; is_current: boolean };
type Term = { id: number; name: string; sequence: number; start_date: string; end_date: string };

export default function TermsPage() {
  const [years, setYears] = useState<Year[]>([]);
  const [yearId, setYearId] = useState("");
  const [terms, setTerms] = useState<Term[]>([]);
  const [editing, setEditing] = useState<Term | null>(null);
  const [f, setF] = useState({ name: "", start_date: "", end_date: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Year[]>("/api/v1/school/academic-years")
      .then((r) => {
        setYears(r.data);
        const cur = r.data.find((y) => y.is_current) ?? r.data[0];
        if (cur) setYearId(String(cur.id));
      })
      .catch((e) => setError(apiError(e)));
  }, []);

  const load = () =>
    yearId &&
    api
      .get<Term[]>(`/api/v1/school/academic-years/${yearId}/terms`)
      .then((r) => setTerms(r.data))
      .catch((e) => setError(apiError(e)));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId]);

  const year = years.find((y) => String(y.id) === yearId);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      if (editing) await api.put(`/api/v1/school/academic-years/${yearId}/terms/${editing.id}`, f);
      else await api.post(`/api/v1/school/academic-years/${yearId}/terms`, f);
      setNotice(editing ? "Term updated." : "Term added.");
      setEditing(null);
      setF({ name: "", start_date: "", end_date: "" });
      setError(null);
      load();
    } catch (err) {
      setError(apiError(err));
    }
  }

  async function remove(t: Term) {
    if (!window.confirm(`Delete ${t.name}?`)) return;
    try {
      await api.delete(`/api/v1/school/terms/${t.id}`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-[18px]">
      <PageHeader title="Terms" subtitle="Split each academic year into terms or semesters. Exams can be filed under a term." />

      {/* Counted off the two lists already loaded — the years, and this
          year's terms. Nothing extra is asked of the server. */}
      <StatStrip
        stats={[
          {
            label: "Terms in this year",
            value: terms.length || "—",
            note: year ? year.name : "Pick a year",
            icon: LayoutList,
          },
          {
            label: "Year runs",
            value: year ? year.name : "—",
            note: year ? `${year.start_date} → ${year.end_date}` : undefined,
            icon: CalendarRange,
          },
          {
            label: "Years on file",
            value: years.length || "—",
            note: "Each can have its own terms",
            icon: Layers,
          },
        ]}
      />

      <FilterBar>
        <select
          aria-label="Academic year"
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className={filterSelect}
        >
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
              {y.is_current ? " (current)" : ""}
            </option>
          ))}
        </select>
      </FilterBar>

      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {year && (
        <Card>
          <CardBody>
            <form onSubmit={save} className="flex flex-wrap items-end gap-3">
              <Input label="Name *" placeholder="Term 1" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
              <Input label="Starts *" type="date" min={year.start_date} max={year.end_date} value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} required />
              <Input label="Ends *" type="date" min={year.start_date} max={year.end_date} value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} required />
              <Button type="submit">{editing ? "Save" : "Add term"}</Button>
              {editing && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditing(null);
                    setF({ name: "", start_date: "", end_date: "" });
                  }}
                >
                  Cancel
                </Button>
              )}
            </form>
            <p className="mt-2 text-xs text-ink-subtle">
              {year.name} runs {year.start_date} to {year.end_date}. Terms can&apos;t overlap.
            </p>
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Terms in this year</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {year ? `${year.name} · ${year.start_date} to ${year.end_date}` : "No year selected"}
            </p>
          </div>
        </CardHeader>
        <Table head={["#", "Term", "From", "To", ""]} empty={terms.length === 0 && "No terms for this year yet."}>
          {terms.map((t) => (
            <tr key={t.id}>
              <td className={td}>{t.sequence}</td>
              <td className={tdStrong}>{t.name}</td>
              <td className={td}>{t.start_date}</td>
              <td className={td}>{t.end_date}</td>
              <td className="space-x-1 whitespace-nowrap px-3 py-2 text-right">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditing(t);
                    setF({ name: t.name, start_date: t.start_date, end_date: t.end_date });
                  }}
                >
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(t)}>
                  Delete
                </Button>
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`${terms.length} term${terms.length === 1 ? "" : "s"} defined`}
          right={terms.length > 0 ? "Terms can't overlap" : "Add the first term above"}
        />
      </Card>
    </div>
  );
}
