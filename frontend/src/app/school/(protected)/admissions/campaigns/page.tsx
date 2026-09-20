"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

import { AdmissionSource, Campaign, SOURCES, label, selectClass } from "../types";

export default function CampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);
  const [formLink, setFormLink] = useState<string | null>(null);

  async function load() {
    try {
      const { data } = await api.get<Campaign[]>("/api/v1/school/admissions/campaigns");
      setItems(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    api
      .get<{ tenant_code: string; code: string }>("/api/v1/school/admissions/public-link")
      .then((r) =>
        setFormLink(`${window.location.origin}/apply/${r.data.tenant_code}/${r.data.code}`)
      )
      .catch(() => undefined);
  }, []);

  async function toggle(c: Campaign) {
    try {
      await api.patch(`/api/v1/school/admissions/campaigns/${c.id}`, { is_active: !c.is_active });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function remove(c: Campaign) {
    if (!window.confirm(`Delete "${c.name}"? Its enquiries are kept.`)) return;
    try {
      await api.delete(`/api/v1/school/admissions/campaigns/${c.id}`);
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/school/admissions" className="text-sm text-ink-muted hover:underline">
        ← Admissions
      </Link>
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Campaigns</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Attribute enquiries to ads, open days and social pushes to see what works.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>+ New campaign</Button>
      </div>

      {formLink && (
        <Card className="p-4 text-sm">
          <div className="font-medium text-ink">Public enquiry form</div>
          <div className="mt-1 text-ink-muted">
            Put this link on your website, Google listing and social pages. Submissions arrive
            here with source “Website”.
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="rounded bg-surface-subtle px-2 py-1 text-[12px] font-mono text-ink">
              {formLink}
            </code>
            <Button size="sm" variant="secondary" onClick={() => navigator.clipboard?.writeText(formLink)}>
              Copy
            </Button>
          </div>
        </Card>
      )}

      {error && <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>}

      <Card className="overflow-x-auto">
        <table className="min-w-full divide-y divide-surface-border text-[13px]">
          <thead className="bg-surface-subtle text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
            <tr>
              <th className="px-4 py-3 font-bold">Name</th>
              <th className="px-4 py-3 font-bold">Channel</th>
              <th className="px-4 py-3 font-bold">Dates</th>
              <th className="px-4 py-3 font-bold">Budget</th>
              <th className="px-4 py-3 font-bold">Enquiries</th>
              <th className="px-4 py-3 font-bold">Enrolled</th>
              <th className="px-4 py-3 font-bold">Cost / enrolment</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {items.map((c) => {
              const budget = c.budget ? Number(c.budget) : null;
              return (
                <tr key={c.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3 font-medium text-ink">
                    {c.name} {!c.is_active && <Badge>inactive</Badge>}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{label(c.channel)}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {c.start_date ?? "—"} → {c.end_date ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {budget != null ? `₹${budget.toLocaleString("en-IN")}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink">{c.enquiry_count}</td>
                  <td className="px-4 py-3 text-ink">{c.enrolled_count}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {budget != null && c.enrolled_count
                      ? `₹${Math.round(budget / c.enrolled_count).toLocaleString("en-IN")}`
                      : "—"}
                  </td>
                  <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(c)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggle(c)}>
                      {c.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => remove(c)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-ink-muted">
                  No campaigns yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {(creating || editing) && (
        <CampaignModal
          existing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function CampaignModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: Campaign | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: existing?.name ?? "",
    channel: (existing?.channel ?? "campaign") as AdmissionSource,
    start_date: existing?.start_date ?? "",
    end_date: existing?.end_date ?? "",
    budget: existing?.budget ?? "",
    description: existing?.description ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name,
      channel: form.channel,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      budget: form.budget === "" ? null : form.budget,
      description: form.description.trim() || null,
    };
    try {
      if (existing) {
        await api.patch(`/api/v1/school/admissions/campaigns/${existing.id}`, payload);
      } else {
        await api.post("/api/v1/school/admissions/campaigns", payload);
      }
      onSaved();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={existing ? `Edit ${existing.name}` : "New campaign"}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Name *"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Channel</span>
            <select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value as AdmissionSource })}
              className={selectClass}
            >
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Budget (₹)"
            type="number"
            min="0"
            step="0.01"
            value={form.budget}
            onChange={(e) => setForm({ ...form, budget: e.target.value })}
          />
          <Input
            label="Start date"
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
          />
          <Input
            label="End date"
            type="date"
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">Description</span>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className={selectClass}
          />
        </label>
        {error && <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">{error}</div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {existing ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
