"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, Select } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

import { LibraryTabs } from "../LibraryTabs";

type Settings = {
  loan_days_student: number;
  loan_days_staff: number;
  max_books_student: number;
  max_books_staff: number;
  max_renewals: number;
  fine_per_day: string;
  max_fine_per_loan: string | null;
  hold_days: number;
  fine_fee_head_id: number | null;
};

export default function LibrarySettingsPage() {
  const [form, setForm] = useState<Record<keyof Settings, string> | null>(null);
  const [heads, setHeads] = useState<{ id: number; name: string; code: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Settings>("/api/v1/school/library/settings")
      .then((r) => {
        const s = r.data;
        setForm(
          Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v === null ? "" : String(v)])) as Record<keyof Settings, string>
        );
      })
      .catch((e) => setError(apiError(e)));
    api.get<{ id: number; name: string; code: string }[]>("/api/v1/school/fees/heads").then((r) => setHeads(r.data)).catch(() => undefined);
  }, []);

  if (!form) return <ErrorBox>{error}</ErrorBox>;
  const set = (k: keyof Settings) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    try {
      await api.patch("/api/v1/school/library/settings", {
        loan_days_student: Number(form.loan_days_student),
        loan_days_staff: Number(form.loan_days_staff),
        max_books_student: Number(form.max_books_student),
        max_books_staff: Number(form.max_books_staff),
        max_renewals: Number(form.max_renewals),
        fine_per_day: form.fine_per_day,
        max_fine_per_loan: form.max_fine_per_loan || null,
        hold_days: Number(form.hold_days),
        fine_fee_head_id: form.fine_fee_head_id ? Number(form.fine_fee_head_id) : null,
      });
      setNotice("Library settings saved.");
      setError(null);
    } catch (err) {
      setError(apiError(err));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Library" subtitle="Loan periods, limits and fines." />
      <LibraryTabs />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>
      <Card>
        <CardBody>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Input label="Loan days (students)" type="number" min="1" value={form.loan_days_student} onChange={set("loan_days_student")} />
              <Input label="Loan days (staff)" type="number" min="1" value={form.loan_days_staff} onChange={set("loan_days_staff")} />
              <Input label="Max books (students)" type="number" min="0" value={form.max_books_student} onChange={set("max_books_student")} />
              <Input label="Max books (staff)" type="number" min="0" value={form.max_books_staff} onChange={set("max_books_staff")} />
              <Input label="Renewals allowed" type="number" min="0" value={form.max_renewals} onChange={set("max_renewals")} />
              <Input label="Hold for pickup (days)" type="number" min="1" value={form.hold_days} onChange={set("hold_days")} />
              <Input label="Fine per day late ₹" type="number" min="0" step="0.5" value={form.fine_per_day} onChange={set("fine_per_day")} />
              <Input label="Max fine per loan ₹" placeholder="No cap" type="number" min="0" value={form.max_fine_per_loan} onChange={set("max_fine_per_loan")} />
            </div>
            <Select label="Add student fines to fees under" value={form.fine_fee_head_id} onChange={set("fine_fee_head_id")}>
              <option value="">Don't — collect at the library desk</option>
              {heads.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name} ({h.code})
                </option>
              ))}
            </Select>
            <Button type="submit">Save</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
