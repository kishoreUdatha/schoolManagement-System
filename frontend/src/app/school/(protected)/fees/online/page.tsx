"use client";

import { FormEvent, useEffect, useState } from "react";

import { OnlinePaymentsList } from "@/components/OnlinePaymentsList";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { api, apiError } from "@/lib/api";

type Gateway = {
  configured: boolean;
  key_id: string | null;
  mode: "test" | "live" | null;
  has_webhook_secret: boolean;
  is_enabled: boolean;
  webhook_url_path: string;
  test_mode_available: boolean;
};

export default function OnlinePaymentsPage() {
  const [gw, setGw] = useState<Gateway | null>(null);
  const [form, setForm] = useState({ key_id: "", key_secret: "", webhook_secret: "", is_enabled: true });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  async function load() {
    try {
      const { data } = await api.get<Gateway>("/api/v1/school/payments/gateway");
      setGw(data);
      setForm({ key_id: data.key_id ?? "", key_secret: "", webhook_secret: "", is_enabled: data.is_enabled || !data.configured });
      setEditing(!data.configured);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.put("/api/v1/school/payments/gateway", {
        key_id: form.key_id.trim(),
        key_secret: form.key_secret || null,
        webhook_secret: form.webhook_secret || null,
        is_enabled: form.is_enabled,
      });
      setNotice("Razorpay settings saved.");
      load();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle() {
    if (!gw) return;
    try {
      await api.put("/api/v1/school/payments/gateway", { key_id: gw.key_id, is_enabled: !gw.is_enabled });
      load();
    } catch (e) {
      setError(apiError(e));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Online payments" subtitle="Parents pay fees from the parent portal; money settles to the school’s Razorpay account." />
      <ErrorBox>{error}</ErrorBox>
      <NoticeBox>{notice}</NoticeBox>

      {gw && (
        <Card>
          <CardHeader>
            <CardTitle>
              Razorpay{" "}
              {gw.configured ? (
                <Badge tone={gw.is_enabled ? "emerald" : "neutral"}>
                  {gw.is_enabled ? `enabled · ${gw.mode}` : "disabled"}
                </Badge>
              ) : (
                <Badge tone="amber">not connected</Badge>
              )}
            </CardTitle>
            {gw.configured && !editing && (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                  Update keys
                </Button>
                <Button size="sm" variant="ghost" onClick={toggle}>
                  {gw.is_enabled ? "Disable" : "Enable"}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardBody className="space-y-4 text-sm">
            {!gw.configured && gw.test_mode_available && (
              <p className="text-ink-muted">
                Until keys are added, parents get a <b>test-mode</b> checkout (development builds only).
              </p>
            )}
            {gw.configured && !editing && (
              <div className="space-y-1 text-ink-muted">
                <div>
                  Key ID: <code className="text-ink">{gw.key_id}</code>
                </div>
                <div>Webhook secret: {gw.has_webhook_secret ? "saved" : "not set (recommended)"}</div>
              </div>
            )}
            {editing && (
              <form onSubmit={save} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Input
                    label="Key ID *"
                    placeholder="rzp_live_…"
                    value={form.key_id}
                    onChange={(e) => setForm({ ...form, key_id: e.target.value })}
                    required
                  />
                  <Input
                    label={gw.configured ? "Key secret (leave blank to keep)" : "Key secret *"}
                    type="password"
                    autoComplete="off"
                    value={form.key_secret}
                    onChange={(e) => setForm({ ...form, key_secret: e.target.value })}
                    required={!gw.configured}
                  />
                  <Input
                    label="Webhook secret"
                    type="password"
                    autoComplete="off"
                    value={form.webhook_secret}
                    onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })}
                  />
                </div>
                <div className="rounded-lg bg-surface-subtle p-3 text-xs text-ink-muted">
                  In the Razorpay dashboard → Settings → Webhooks, add{" "}
                  <code className="text-ink">
                    {apiBase}
                    {gw.webhook_url_path}
                  </code>{" "}
                  with events <b>payment.captured</b>, <b>order.paid</b> and <b>payment.failed</b>, using the
                  same webhook secret. This confirms payments even if a parent closes the page mid-payment.
                </div>
                <div className="flex justify-end gap-2">
                  {gw.configured && (
                    <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                      Cancel
                    </Button>
                  )}
                  <Button type="submit" loading={busy}>
                    Save
                  </Button>
                </div>
              </form>
            )}
          </CardBody>
        </Card>
      )}

      <OnlinePaymentsList />
    </div>
  );
}
