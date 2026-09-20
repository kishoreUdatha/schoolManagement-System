"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

type SchoolInfo = { school_name: string; logo_url: string | null; address: string | null; phone: string | null; email: string | null };
type Opening = {
  id: number;
  reference_no: string;
  title: string;
  department_name: string | null;
  employment_type: string;
  vacancies: number;
  description: string | null;
  requirements: string | null;
  closes_on: string | null;
};

const human = (s: string) => s.replace(/_/g, " ");

export default function CareersPage() {
  const params = useParams<{ tenant: string; school: string }>();
  const base = `/api/v1/public/careers/${encodeURIComponent(params.tenant)}/${encodeURIComponent(params.school)}`;
  const [info, setInfo] = useState<SchoolInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [applyTo, setApplyTo] = useState<Opening | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    qualification: "",
    experience_years: "",
    current_employer: "",
    message: "",
    website: "", // honeypot
  });

  useEffect(() => {
    api.get<SchoolInfo>(base).then((r) => setInfo(r.data)).catch(() => setNotFound(true));
    api.get<Opening[]>(`${base}/openings`).then((r) => setOpenings(r.data)).catch(() => setOpenings([]));
  }, [base]);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!applyTo || form.website) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ message: string }>(`${base}/openings/${applyTo.id}/apply`, {
        candidate: {
          full_name: form.full_name,
          email: form.email,
          phone: form.phone || null,
          qualification: form.qualification || null,
          experience_years: form.experience_years || null,
          current_employer: form.current_employer || null,
        },
        message: form.message || null,
      });
      setDone(r.data.message);
      setApplyTo(null);
      setForm({ full_name: "", email: "", phone: "", qualification: "", experience_years: "", current_employer: "", message: "", website: "" });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (notFound) return <div className="p-10 text-center text-ink-muted">This careers page isn&apos;t available.</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-ink">{info?.school_name ?? "Careers"}</h1>
        <p className="text-sm text-ink-muted">Work with us</p>
        {info?.address && <p className="text-xs text-ink-subtle">{info.address}</p>}
      </div>

      {done && <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">{done}</div>}
      {error && <div className="rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-400">{error}</div>}

      {openings.length === 0 && <p className="text-center text-sm text-ink-subtle">No openings at the moment. Please check back later.</p>}

      {openings.map((o) => (
        <Card key={o.id}>
          <CardBody className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-ink">{o.title}</h2>
                <div className="text-xs text-ink-subtle">
                  {human(o.employment_type)}
                  {o.department_name && ` · ${o.department_name}`} · {o.vacancies} post{o.vacancies === 1 ? "" : "s"}
                  {o.closes_on && ` · apply by ${o.closes_on}`}
                </div>
              </div>
              <Button onClick={() => setApplyTo(applyTo?.id === o.id ? null : o)}>{applyTo?.id === o.id ? "Close" : "Apply"}</Button>
            </div>
            {o.description && <p className="whitespace-pre-line text-sm text-ink-muted">{o.description}</p>}
            {o.requirements && (
              <div className="text-sm">
                <span className="font-medium text-ink">What we&apos;re looking for: </span>
                <span className="whitespace-pre-line text-ink-muted">{o.requirements}</span>
              </div>
            )}

            {applyTo?.id === o.id && (
              <form onSubmit={submit} className="space-y-3 border-t border-surface-border pt-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="Your name *" value={form.full_name} onChange={set("full_name")} required minLength={2} />
                  <Input label="Email *" type="email" value={form.email} onChange={set("email")} required />
                  <Input label="Phone" value={form.phone} onChange={set("phone")} />
                  <Input label="Highest qualification" value={form.qualification} onChange={set("qualification")} />
                  <Input label="Years of experience" type="number" min={0} step="0.5" value={form.experience_years} onChange={set("experience_years")} />
                  <Input label="Current school / employer" value={form.current_employer} onChange={set("current_employer")} />
                </div>
                <Input label="Anything else" value={form.message} onChange={set("message")} />
                <input className="hidden" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} aria-hidden />
                <Button type="submit" disabled={busy}>
                  {busy ? "Sending…" : "Send application"}
                </Button>
                <p className="text-xs text-ink-subtle">The school will contact you if they&apos;d like to take it further.</p>
              </form>
            )}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
