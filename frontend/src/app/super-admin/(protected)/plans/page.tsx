"use client";

import { FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { api, apiError } from "@/lib/api";

const MODULE_KEYS = [
  "attendance",
  "homework",
  "exams",
  "fees",
  "behaviour",
  "digital_learning",
  "ai_reports",
  "ai_chatbot",
  "whatsapp",
  "sms",
] as const;

type ModuleKey = (typeof MODULE_KEYS)[number];

type Plan = {
  id: number;
  name: string;
  tier: "basic" | "standard" | "premium";
  description: string | null;
  price_monthly: string;
  price_yearly: string;
  student_limit: number;
  staff_limit: number;
  storage_mb_limit: number;
  sms_quota: number;
  whatsapp_quota: number;
  email_quota: number;
  is_active: boolean;
  modules: { module_key: ModuleKey; enabled: boolean }[];
};

const tierTone = { basic: "neutral", standard: "brand", premium: "emerald" } as const;

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    try {
      const { data } = await api.get<{ items: Plan[] }>("/api/v1/super-admin/plans");
      setPlans(data.items);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">Plans</h1>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Subscription tiers — define quotas and which modules each plan unlocks.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>+ New plan</Button>
      </div>

      {error && (
        <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-slate-900">{p.name}</h3>
                  <Badge tone={tierTone[p.tier]}>{p.tier}</Badge>
                </div>
                {p.description && (
                  <p className="mt-1.5 text-[13px] text-ink-muted">{p.description}</p>
                )}
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-brand-700">
                  ₹{Number(p.price_monthly).toLocaleString("en-IN")}
                  <span className="text-xs font-normal text-slate-500">/mo</span>
                </div>
                <div className="text-xs text-slate-500">
                  ₹{Number(p.price_yearly).toLocaleString("en-IN")}/yr
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-600">
              <div>Students: <span className="font-medium text-slate-900">{p.student_limit}</span></div>
              <div>Staff: <span className="font-medium text-slate-900">{p.staff_limit}</span></div>
              <div>Storage: <span className="font-medium text-slate-900">{p.storage_mb_limit} MB</span></div>
              <div>SMS: <span className="font-medium text-slate-900">{p.sms_quota}</span></div>
              <div>WhatsApp: <span className="font-medium text-slate-900">{p.whatsapp_quota}</span></div>
              <div>Email: <span className="font-medium text-slate-900">{p.email_quota}</span></div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {p.modules.map((m) => (
                <Badge key={m.module_key} tone={m.enabled ? "emerald" : "neutral"}>
                  {m.module_key}
                </Badge>
              ))}
            </div>
          </Card>
        ))}
        {plans.length === 0 && (
          <Card className="p-8 text-center text-slate-500">
            No plans defined yet. Click <strong>New plan</strong>.
          </Card>
        )}
      </div>

      <CreatePlanModal
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          setOpen(false);
          load();
        }}
      />
    </div>
  );
}

function CreatePlanModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    tier: "basic" as "basic" | "standard" | "premium",
    description: "",
    price_monthly: "0",
    price_yearly: "0",
    student_limit: 100,
    staff_limit: 20,
    storage_mb_limit: 1024,
    sms_quota: 500,
    whatsapp_quota: 500,
    email_quota: 2000,
  });
  const [modules, setModules] = useState<Record<ModuleKey, boolean>>(
    Object.fromEntries(MODULE_KEYS.map((k) => [k, true])) as Record<ModuleKey, boolean>
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/v1/super-admin/plans", {
        ...form,
        modules: MODULE_KEYS.map((k) => ({ module_key: k, enabled: modules[k] })),
      });
      onCreated();
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create plan" size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name *"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <label className="flex flex-col gap-1">
            <span className="text-[12px] font-bold text-ink-muted">Tier</span>
            <select
              value={form.tier}
              onChange={(e) => setForm({ ...form, tier: e.target.value as typeof form.tier })}
              className="min-h-[43px] rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-[13px] text-ink focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-300"
            >
              <option value="basic">Basic</option>
              <option value="standard">Standard</option>
              <option value="premium">Premium</option>
            </select>
          </label>
          <Input
            label="Price / month (₹)"
            type="number"
            min="0"
            step="0.01"
            value={form.price_monthly}
            onChange={(e) => setForm({ ...form, price_monthly: e.target.value })}
          />
          <Input
            label="Price / year (₹)"
            type="number"
            min="0"
            step="0.01"
            value={form.price_yearly}
            onChange={(e) => setForm({ ...form, price_yearly: e.target.value })}
          />
          <Input
            label="Student limit"
            type="number"
            min="0"
            value={form.student_limit}
            onChange={(e) => setForm({ ...form, student_limit: Number(e.target.value) })}
          />
          <Input
            label="Staff limit"
            type="number"
            min="0"
            value={form.staff_limit}
            onChange={(e) => setForm({ ...form, staff_limit: Number(e.target.value) })}
          />
          <Input
            label="Storage (MB)"
            type="number"
            min="0"
            value={form.storage_mb_limit}
            onChange={(e) => setForm({ ...form, storage_mb_limit: Number(e.target.value) })}
          />
          <Input
            label="SMS quota"
            type="number"
            min="0"
            value={form.sms_quota}
            onChange={(e) => setForm({ ...form, sms_quota: Number(e.target.value) })}
          />
          <Input
            label="WhatsApp quota"
            type="number"
            min="0"
            value={form.whatsapp_quota}
            onChange={(e) => setForm({ ...form, whatsapp_quota: Number(e.target.value) })}
          />
          <Input
            label="Email quota"
            type="number"
            min="0"
            value={form.email_quota}
            onChange={(e) => setForm({ ...form, email_quota: Number(e.target.value) })}
          />
        </div>

        <Input
          label="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        <div>
          <div className="text-sm font-medium text-slate-700">Enabled modules</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MODULE_KEYS.map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={modules[k]}
                  onChange={(e) => setModules({ ...modules, [k]: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <span>{k}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-[#FFEBEE] px-4 py-3 text-[13px] font-medium text-[#B82E45] dark:bg-rose-500/15 dark:text-rose-200">{error}</div>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create plan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
