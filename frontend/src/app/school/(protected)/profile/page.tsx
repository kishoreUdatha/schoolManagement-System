"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

const ALL_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
type Day = (typeof ALL_DAYS)[number];

type Profile = {
  id: number;
  tenant_id: number;
  name: string;
  code: string;
  logo_url: string | null;
  brand_color: string | null;
  app_name: string | null;
  address: string | null;
  timezone: string;
  currency: string;
  principal_name: string | null;
  phone_primary: string | null;
  phone_secondary: string | null;
  email: string | null;
  working_days: string;
  school_start_time: string | null;
  school_end_time: string | null;
  break_start_time: string | null;
  break_end_time: string | null;
};

function trimSeconds(t: string | null | undefined) {
  if (!t) return "";
  // "08:30:00" -> "08:30"; "08:30" stays
  const parts = t.split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : t;
}

export default function SchoolProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({
    name: "",
    logo_url: "",
    brand_color: "",
    app_name: "",
    address: "",
    timezone: "Asia/Kolkata",
    currency: "INR",
    principal_name: "",
    phone_primary: "",
    phone_secondary: "",
    email: "",
    school_start_time: "",
    school_end_time: "",
    break_start_time: "",
    break_end_time: "",
  });
  const [days, setDays] = useState<Set<Day>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function applyProfile(p: Profile) {
    setProfile(p);
    setForm({
      name: p.name || "",
      logo_url: p.logo_url || "",
      brand_color: p.brand_color || "",
      app_name: p.app_name || "",
      address: p.address || "",
      timezone: p.timezone || "Asia/Kolkata",
      currency: p.currency || "INR",
      principal_name: p.principal_name || "",
      phone_primary: p.phone_primary || "",
      phone_secondary: p.phone_secondary || "",
      email: p.email || "",
      school_start_time: trimSeconds(p.school_start_time),
      school_end_time: trimSeconds(p.school_end_time),
      break_start_time: trimSeconds(p.break_start_time),
      break_end_time: trimSeconds(p.break_end_time),
    });
    setDays(new Set(p.working_days.split(",").map((d) => d.trim() as Day)));
  }

  async function load() {
    try {
      const { data } = await api.get<Profile>("/api/v1/school/profile");
      applyProfile(data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleDay(d: Day) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const orderedDays = ALL_DAYS.filter((d) => days.has(d));
    if (orderedDays.length === 0) {
      setError("Select at least one working day.");
      setSaving(false);
      return;
    }

    const payload: Record<string, unknown> = {
      name: form.name,
      logo_url: form.logo_url || null,
      brand_color: form.brand_color || null,
      app_name: form.app_name || null,
      address: form.address || null,
      timezone: form.timezone,
      currency: form.currency,
      principal_name: form.principal_name || null,
      phone_primary: form.phone_primary || null,
      phone_secondary: form.phone_secondary || null,
      email: form.email || null,
      working_days: orderedDays.join(","),
      school_start_time: form.school_start_time || null,
      school_end_time: form.school_end_time || null,
      break_start_time: form.break_start_time || null,
      break_end_time: form.break_end_time || null,
    };

    try {
      const { data } = await api.patch<Profile>("/api/v1/school/profile", payload);
      applyProfile(data);
      setSuccess("Profile updated.");
    } catch (e) {
      setError(apiError(e));
    } finally {
      setSaving(false);
    }
  }

  if (!profile && !error) {
    return <div className="text-sm text-ink-muted">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-extrabold leading-[1.28] tracking-[-1.1px] text-ink">School profile</h1>
        <p className="mt-1.5 text-[13px] text-ink-muted">
          Used across reports, fee receipts, and notifications. Code{" "}
          <code>{profile?.code}</code> is assigned by the platform and cannot be
          changed.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-danger-bg px-4 py-3 text-[13px] font-medium text-danger dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-lg bg-success-bg px-4 py-3 text-[13px] font-medium text-success dark:bg-emerald-500/15 dark:text-emerald-200">
          {success}
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input
              label="School name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              label="Logo URL"
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              placeholder="https://…"
              hint="Direct image URL (S3 upload comes later)"
            />
            <Input
              label="Principal name"
              value={form.principal_name}
              onChange={(e) =>
                setForm({ ...form, principal_name: e.target.value })
              }
            />
            <Input
              label="School email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <Input
              label="Primary phone"
              value={form.phone_primary}
              onChange={(e) =>
                setForm({ ...form, phone_primary: e.target.value })
              }
              placeholder="+91…"
            />
            <Input
              label="Secondary phone"
              value={form.phone_secondary}
              onChange={(e) =>
                setForm({ ...form, phone_secondary: e.target.value })
              }
            />
            <div className="sm:col-span-2">
              <Input
                label="Address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <Input
              label="Timezone"
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            />
            <Input
              label="Currency"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Branding</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-4 sm:grid-cols-2">
            <Input
              label="App name"
              value={form.app_name}
              onChange={(e) => setForm({ ...form, app_name: e.target.value })}
              placeholder="SMS"
              hint="Shown in the sidebar header across portals. Defaults to 'SMS'."
            />
            <label className="flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-muted">
                Brand color
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.brand_color || "#2563eb"}
                  onChange={(e) =>
                    setForm({ ...form, brand_color: e.target.value })
                  }
                  className="h-9 w-12 cursor-pointer rounded-md border border-surface-border bg-white"
                />
                <input
                  value={form.brand_color}
                  onChange={(e) =>
                    setForm({ ...form, brand_color: e.target.value })
                  }
                  placeholder="#2563eb"
                  className="flex-1 rounded-lg border border-surface-border px-3 py-2 text-sm font-mono"
                />
                {form.brand_color && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, brand_color: "" })}
                    className="text-xs text-ink-muted underline hover:text-ink-muted"
                  >
                    reset
                  </button>
                )}
              </div>
              <span className="text-xs text-ink-muted">
                Hex color used for buttons, badges and accents. Save and
                refresh to see it everywhere.
              </span>
            </label>
            <div className="sm:col-span-2">
              <p className="text-xs text-ink-muted">
                Logo image is configured in the <strong>Identity</strong>{" "}
                card above. Use a square PNG/SVG for best results.
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
          </CardHeader>
          <CardBody className="space-y-5">
            <div>
              <div className="text-sm font-medium text-ink-muted">
                Working days *
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {ALL_DAYS.map((d) => {
                  const active = days.has(d);
                  return (
                    <button
                      type="button"
                      key={d}
                      onClick={() => toggleDay(d)}
                      className={
                        "rounded-full border px-3 py-1 text-xs font-semibold transition " +
                        (active
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-surface-border bg-white text-ink-muted hover:bg-surface-subtle")
                      }
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="School start time"
                type="time"
                value={form.school_start_time}
                onChange={(e) =>
                  setForm({ ...form, school_start_time: e.target.value })
                }
              />
              <Input
                label="School end time"
                type="time"
                value={form.school_end_time}
                onChange={(e) =>
                  setForm({ ...form, school_end_time: e.target.value })
                }
              />
              <Input
                label="Break start time"
                type="time"
                value={form.break_start_time}
                onChange={(e) =>
                  setForm({ ...form, break_start_time: e.target.value })
                }
              />
              <Input
                label="Break end time"
                type="time"
                value={form.break_end_time}
                onChange={(e) =>
                  setForm({ ...form, break_end_time: e.target.value })
                }
              />
            </div>
          </CardBody>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => profile && applyProfile(profile)}
            disabled={saving}
          >
            Reset
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
