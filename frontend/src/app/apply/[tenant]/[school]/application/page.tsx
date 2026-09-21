"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormGrid, FormSection } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type SchoolInfo = { school_name: string; address: string | null; phone: string | null; email: string | null };

export default function PublicApplicationPage() {
  const params = useParams<{ tenant: string; school: string }>();
  const base = `/api/v1/public/admissions/${encodeURIComponent(params.tenant)}/${encodeURIComponent(params.school)}`;
  const [info, setInfo] = useState<SchoolInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    student_name: "",
    dob: "",
    gender: "",
    applying_for_class: "",
    previous_school: "",
    guardian_name: "",
    father_name: "",
    mother_name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
    sibling_in_school: false,
    website: "", // honeypot
  });

  useEffect(() => {
    api.get<SchoolInfo>(base).then((r) => setInfo(r.data)).catch(() => setNotFound(true));
  }, [base]);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ application_no: string; message: string }>(`${base}/applications`, {
        ...f,
        dob: f.dob || null,
        gender: f.gender || null,
        email: f.email || null,
        father_name: f.father_name || null,
        mother_name: f.mother_name || null,
        previous_school: f.previous_school || null,
        address: f.address || null,
        notes: f.notes || null,
      });
      setDone(r.data.message);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  if (notFound) return <div className="p-10 text-center text-ink-muted">This admission form isn&apos;t available.</div>;
  if (done)
    return (
      <AuthShell
        title="Thank you"
        subtitle={done}
        headline={"Your application\nis with the school."}
        blurb="Somebody in the office will look at it and come back to you."
        topRight={info?.school_name}
      >
        <p className="text-[13px] text-ink-subtle">
          Please keep your application number for any follow-up.
        </p>
      </AuthShell>
    );

  return (
    <AuthShell
      title="Admission application"
      subtitle={
        info?.school_name
          ? `Applying to ${info.school_name}.`
          : "Tell the school about the student and how to reach you."
      }
      headline={"A place at school\nstarts with a form."}
      blurb="Fill this in once. The office picks it up from there and comes back to you."
      topRight={
        <>
          {info?.school_name}
          {info?.phone ? ` · ${info.phone}` : ""}
        </>
      }
      footer={
        <>
          Just want to enquire first?{" "}
          <Link href={`/apply/${params.tenant}/${params.school}`} className="text-brand-500 hover:underline">
            Send an enquiry instead
          </Link>
          .
        </>
      }
    >
      <div className="space-y-6">
        {error && <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>}

        <form onSubmit={submit} className="space-y-7">
          <FormSection step={1} title="The student">
            <FormGrid columns={1}>
              <Input label="Student's name *" value={f.student_name} onChange={set("student_name")} required minLength={2} />
              <Input label="Date of birth" type="date" max={new Date().toISOString().slice(0, 10)} value={f.dob} onChange={set("dob")} />
              <label className="flex flex-col gap-1 text-[12px] font-bold text-ink-muted">
                Gender
                <select value={f.gender} onChange={set("gender")} className="min-h-[43px] rounded-lg border border-surface-control bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300">
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <Input label="Applying for class" value={f.applying_for_class} onChange={set("applying_for_class")} placeholder="Class 1" />
              <Input label="Present / previous school" value={f.previous_school} onChange={set("previous_school")} />
            </FormGrid>
          </FormSection>

          <FormSection step={2} title="Parents and guardians">
            <FormGrid columns={1}>
              <Input label="Parent or guardian *" value={f.guardian_name} onChange={set("guardian_name")} required minLength={2} />
              <Input label="Father's name" value={f.father_name} onChange={set("father_name")} />
              <Input label="Mother's name" value={f.mother_name} onChange={set("mother_name")} />
            </FormGrid>
          </FormSection>

          <FormSection step={3} title="How to reach you">
            <FormGrid columns={1}>
              <Input label="Phone *" value={f.phone} onChange={set("phone")} required minLength={6} />
              <Input label="Email" type="email" value={f.email} onChange={set("email")} />
              <Input label="Address" value={f.address} onChange={set("address")} />
            </FormGrid>
          </FormSection>

          <FormSection step={4} title="Anything else">
            <FormGrid columns={1}>
              <Input label="Anything the school should know" value={f.notes} onChange={set("notes")} />
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={f.sibling_in_school} onChange={(e) => setF({ ...f, sibling_in_school: e.target.checked })} />
                A brother or sister already studies here
              </label>
            </FormGrid>
          </FormSection>

          <input className="hidden" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} aria-hidden />
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Sending…" : "Send application"}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
