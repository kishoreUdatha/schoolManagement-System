"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

import { AdmissionSource, Campaign, Enquiry, SOURCES, label, selectClass } from "./types";

type StaffOption = { user_id: number; full_name: string; is_active: boolean };

export function EnquiryFormModal({
  existing,
  onClose,
  onSaved,
}: {
  existing?: Enquiry;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    student_name: existing?.student_name ?? "",
    dob: existing?.dob ?? "",
    gender: existing?.gender ?? "",
    applying_for_class: existing?.applying_for_class ?? "",
    previous_school: existing?.previous_school ?? "",
    parent_name: existing?.parent_name ?? "",
    parent_phone: existing?.parent_phone ?? "",
    parent_email: existing?.parent_email ?? "",
    address: existing?.address ?? "",
    source: (existing?.source ?? "walk_in") as AdmissionSource,
    campaign_id: existing?.campaign_id ? String(existing.campaign_id) : "",
    assigned_to_user_id: existing?.assigned_to_user_id
      ? String(existing.assigned_to_user_id)
      : "",
    next_follow_up_date: existing?.next_follow_up_date ?? "",
    notes: existing?.notes ?? "",
  });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Campaign[]>("/api/v1/school/admissions/campaigns", { params: { active_only: true } })
      .then((r) => setCampaigns(r.data))
      .catch(() => undefined);
    api
      .get<StaffOption[]>("/api/v1/school/staff")
      .then((r) => setStaff(r.data.filter((s) => s.is_active)))
      .catch(() => undefined);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const nullIfEmpty = (v: string) => (v.trim() ? v.trim() : null);
    const payload = {
      student_name: form.student_name,
      dob: form.dob || null,
      gender: form.gender || null,
      applying_for_class: nullIfEmpty(form.applying_for_class),
      previous_school: nullIfEmpty(form.previous_school),
      parent_name: form.parent_name,
      parent_phone: form.parent_phone,
      parent_email: nullIfEmpty(form.parent_email),
      address: nullIfEmpty(form.address),
      source: form.source,
      campaign_id: form.campaign_id ? Number(form.campaign_id) : null,
      assigned_to_user_id: form.assigned_to_user_id ? Number(form.assigned_to_user_id) : null,
      next_follow_up_date: form.next_follow_up_date || null,
      notes: nullIfEmpty(form.notes),
    };
    try {
      if (existing) {
        await api.patch(`/api/v1/school/admissions/enquiries/${existing.id}`, payload);
        onSaved("Enquiry updated.");
      } else {
        await api.post("/api/v1/school/admissions/enquiries", payload);
        onSaved("Enquiry added.");
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <Modal open onClose={onClose} title={existing ? "Edit enquiry" : "New enquiry"} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="text-xs font-semibold uppercase text-ink-subtle">Student</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Student name *" value={form.student_name} onChange={set("student_name")} required />
          <Input
            label="Applying for class"
            placeholder="e.g. Grade 3"
            value={form.applying_for_class}
            onChange={set("applying_for_class")}
          />
          <Input label="Date of birth" type="date" value={form.dob} onChange={set("dob")} />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Gender</span>
            <select value={form.gender} onChange={set("gender")} className={selectClass}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </label>
          <Input label="Previous school" value={form.previous_school} onChange={set("previous_school")} />
        </div>

        <div className="text-xs font-semibold uppercase text-ink-subtle">Parent</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Parent name *" value={form.parent_name} onChange={set("parent_name")} required />
          <Input label="Phone *" value={form.parent_phone} onChange={set("parent_phone")} required />
          <Input
            label="Email"
            type="email"
            hint="Needed to create a parent login on enrolment"
            value={form.parent_email}
            onChange={set("parent_email")}
          />
          <Input label="Address" value={form.address} onChange={set("address")} />
        </div>

        <div className="text-xs font-semibold uppercase text-ink-subtle">Tracking</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Source *</span>
            <select value={form.source} onChange={set("source")} className={selectClass}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Campaign</span>
            <select value={form.campaign_id} onChange={set("campaign_id")} className={selectClass}>
              <option value="">None</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Assigned to</span>
            <select
              value={form.assigned_to_user_id}
              onChange={set("assigned_to_user_id")}
              className={selectClass}
            >
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.user_id} value={s.user_id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Next follow-up"
            type="date"
            value={form.next_follow_up_date}
            onChange={set("next_follow_up_date")}
          />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">Notes</span>
          <textarea value={form.notes} onChange={set("notes")} rows={2} className={selectClass} />
        </label>

        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {existing ? "Save" : "Add enquiry"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
