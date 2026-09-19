"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select, Table, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

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
    <div className="space-y-6">
      <PageHeader title="Terms" subtitle="Split each academic year into terms or semesters. Exams can be filed under a term." />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      <Select label="Academic year" value={yearId} onChange={(e) => setYearId(e.target.value)}>
        {years.map((y) => (
          <option key={y.id} value={y.id}>
            {y.name}
            {y.is_current ? " (current)" : ""}
          </option>
        ))}
      </Select>
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
      </Card>
    </div>
  );
}
