"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

type SchoolInfo = {
  school_name: string;
  logo_url: string | null;
  brand_color: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

const fieldClass =
  "rounded-lg border border-surface-border bg-surface-subtle px-3 py-2 text-sm text-ink shadow-sm";

export default function PublicEnquiryPage() {
  const params = useParams<{ tenant: string; school: string }>();
  const base = `/api/v1/public/admissions/${encodeURIComponent(params.tenant)}/${encodeURIComponent(
    params.school
  )}`;

  const [info, setInfo] = useState<SchoolInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    student_name: "",
    dob: "",
    gender: "",
    applying_for_class: "",
    previous_school: "",
    parent_name: "",
    parent_phone: "",
    parent_email: "",
    message: "",
    website: "", // honeypot
  });

  useEffect(() => {
    api
      .get<SchoolInfo>(base)
      .then((r) => setInfo(r.data))
      .catch(() => setNotFound(true));
  }, [base]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const n = (v: string) => (v.trim() ? v.trim() : null);
    try {
      const { data } = await api.post<{ message: string }>(`${base}/enquiries`, {
        student_name: form.student_name,
        dob: form.dob || null,
        gender: form.gender || null,
        applying_for_class: n(form.applying_for_class),
        previous_school: n(form.previous_school),
        parent_name: form.parent_name,
        parent_phone: form.parent_phone,
        parent_email: n(form.parent_email),
        message: n(form.message),
        website: form.website || null,
      });
      setDone(data.message);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-ink-muted">This enquiry form link isn’t valid.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        {info && (
          <div className="flex items-center gap-4">
            {info.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={info.logo_url} alt="" className="h-14 w-14 rounded-lg object-contain" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-ink">{info.school_name}</h1>
              <p className="text-sm text-ink-muted">Admission enquiry</p>
            </div>
          </div>
        )}

        <Card className="p-6">
          {done ? (
            <div className="space-y-2 text-center">
              <div className="text-lg font-semibold text-ink">Enquiry received</div>
              <p className="text-ink-muted">{done}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Child’s full name *" value={form.student_name} onChange={set("student_name")} required />
                <Input
                  label="Class applying for"
                  placeholder="e.g. Grade 3"
                  value={form.applying_for_class}
                  onChange={set("applying_for_class")}
                />
                <Input label="Date of birth" type="date" value={form.dob} onChange={set("dob")} />
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-ink-muted">Gender</span>
                  <select value={form.gender} onChange={set("gender")} className={fieldClass}>
                    <option value="">—</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <Input label="Current / previous school" value={form.previous_school} onChange={set("previous_school")} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Parent’s name *" value={form.parent_name} onChange={set("parent_name")} required />
                <Input label="Mobile number *" type="tel" value={form.parent_phone} onChange={set("parent_phone")} required />
                <Input label="Email" type="email" value={form.parent_email} onChange={set("parent_email")} />
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">Questions for the school</span>
                <textarea value={form.message} onChange={set("message")} rows={3} className={fieldClass} />
              </label>
              {/* Honeypot: hidden from people, filled by bots. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={set("website")}
                className="hidden"
                aria-hidden="true"
              />
              {error && <div className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
              <Button type="submit" loading={busy} className="w-full">
                Send enquiry
              </Button>
            </form>
          )}
        </Card>

        {info && (info.phone || info.email || info.address) && (
          <p className="text-center text-xs text-ink-subtle">
            {[info.address, info.phone, info.email].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </main>
  );
}
