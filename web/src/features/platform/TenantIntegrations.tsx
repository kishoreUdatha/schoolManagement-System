"use client";

import { useMemo, useState } from "react";
import { DataTable, type Row } from "@/components/ui/DataTable";
import { Icon } from "@/components/ui/Icon";
import { StatStrip } from "@/components/ui/StatStrip";
import { Panel } from "@/components/ui/primitives";
import { ErrorNote } from "@/components/ui/states";
import { useApi } from "@/lib/useApi";
import { PlatformMessaging } from "./Messaging";

/**
 * NEW-083, live. The platform's own WhatsApp and SMS (sign-in details for new
 * schools; features/platform/Messaging), then GET /super-admin/integrations: every school's own payment
 * gateway (Razorpay) and WhatsApp Business connection, as each school set it
 * up; secrets never leave the school's settings.
 */
type Item = {
  tenant_id: number;
  tenant_name: string;
  school_id: number;
  school_name: string;
  payments: { connected: boolean; enabled: boolean; provider: string | null; mode: string | null };
  whatsapp: { connected: boolean; enabled: boolean; provider: string | null; sender_number: string | null; last_error: string | null; sent_30d: number };
};

const PROVIDER: Record<string, string> = { razorpay: "Razorpay", meta: "Meta Cloud API", twilio: "Twilio", mock: "Test provider" };

function state(c: { connected: boolean; enabled: boolean; provider: string | null }, extra?: string | null): string {
  if (!c.connected) return "Not connected";
  const who = c.provider ? PROVIDER[c.provider] ?? c.provider : "";
  return `${c.enabled ? "On" : "Off"} · ${who}${extra ? ` · ${extra}` : ""}`;
}

export function TenantIntegrations() {
  const list = useApi<Item[]>("/api/v1/super-admin/integrations");
  const [typed, setTyped] = useState("");
  const [show, setShow] = useState("");
  const items = useMemo(() => {
    const q = typed.trim().toLowerCase();
    return (list.data ?? []).filter(
      (x) =>
        (!q || x.tenant_name.toLowerCase().includes(q) || x.school_name.toLowerCase().includes(q)) &&
        (!show ||
          (show === "no-payments" && !x.payments.connected) ||
          (show === "no-whatsapp" && !x.whatsapp.connected) ||
          (show === "problems" && Boolean(x.whatsapp.last_error))),
    );
  }, [list.data, typed, show]);
  const all = list.data ?? [];
  const n = (v: number) => (list.loading && !list.data ? "…" : String(v));
  const stats = [
    { label: "Schools", value: n(all.length), note: `${new Set(all.map((x) => x.tenant_id)).size} organizations` },
    { label: "Online payments", value: n(all.filter((x) => x.payments.connected && x.payments.enabled).length), note: `${all.filter((x) => x.payments.mode === "live").length} on live keys` },
    { label: "WhatsApp", value: n(all.filter((x) => x.whatsapp.connected && x.whatsapp.enabled).length), note: `${all.reduce((s, x) => s + x.whatsapp.sent_30d, 0)} messages in 30 days` },
    { label: "WhatsApp problems", value: n(all.filter((x) => x.whatsapp.last_error).length), note: "Last send or test failed" },
  ];
  const rows: Row[] = items.map((x) => [
    { name: x.school_name, sub: x.tenant_name },
    state(x.payments, x.payments.mode ? `${x.payments.mode} keys` : null),
    state(x.whatsapp, x.whatsapp.sender_number),
    String(x.whatsapp.sent_30d),
    x.whatsapp.last_error ?? "—",
  ]);
  return (
    <>
      <PlatformMessaging />
      <StatStrip items={stats} compact />
      <div className="filterbar">
        <div className="searchbox">
          <Icon name="search" className="sm" />
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search organizations and schools…" aria-label="Search" />
        </div>
        <select aria-label="Show" value={show} onChange={(e) => setShow(e.target.value)}>
          <option value="">All schools</option>
          <option value="no-payments">Without online payments</option>
          <option value="no-whatsapp">Without WhatsApp</option>
          <option value="problems">With WhatsApp problems</option>
        </select>
      </div>
      <ErrorNote>{list.error}</ErrorNote>
      <Panel title="Integrations by school" sub="Each school connects its own Razorpay account and WhatsApp Business number in its settings" flush>
        <DataTable columns={["School", "Online payments", "WhatsApp", "WhatsApp · 30 days", "Last WhatsApp problem"]} rows={rows} selectable={false} empty={list.loading ? "Loading…" : "No schools match."} />
      </Panel>
    </>
  );
}
