"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, td, tdStrong } from "@/components/ui/Field";
import { PanelFooter } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

type SettingsRow = {
  key: string;
  module: string;
  name: string;
  description: string;
  read: string;
  write: string | null;
  configured: boolean;
};
type IntegrationRow = {
  key: string;
  name: string;
  purpose: string;
  read: string | null;
  write: string | null;
  enabled: boolean;
  configured: boolean;
  detail: string | null;
};

// Each settings area lives with the module that owns it; this index says where
// to go. The endpoint returns the API path, which maps to a page here.
const PAGE: Record<string, string> = {
  school_profile: "/school/profile",
  report_cards: "/school/grading",
  library: "/school/library/settings",
  payroll: "/school/payroll",
  roles: "/school/roles",
  branches: "/school/roles",
};
const INTEGRATION_PAGE: Record<string, string> = {
  razorpay: "/school/fees/online",
  storage: "/school/documents",
  notifications: "/school/notices",
};

export default function SchoolSettingsPage() {
  const [areas, setAreas] = useState<SettingsRow[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<SettingsRow[]>("/api/v1/school/settings")
      .then((r) => setAreas(r.data))
      .catch((e) => setError(apiError(e)));
    api
      .get<IntegrationRow[]>("/api/v1/school/integrations")
      .then((r) => setIntegrations(r.data))
      .catch(() => setIntegrations([]));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Every settings area in one place, and whether it has been set up."
      />
      <ErrorBox>{error}</ErrorBox>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>School settings</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Each area lives with the module that owns it — this is the index, not a
              second place to change them.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table head={["Area", "What it covers", "Module", "State", ""]} empty={areas.length === 0 && "Loading…"}>
            {areas.map((a) => (
              <tr key={a.key}>
                <td className={tdStrong}>{a.name}</td>
                <td className={td}>{a.description}</td>
                <td className={td}>{a.module}</td>
                <td className={td}>
                  {a.configured ? (
                    <Badge tone="emerald">Set up</Badge>
                  ) : (
                    <Badge tone="amber">Not set up</Badge>
                  )}
                </td>
                <td className={td}>
                  {PAGE[a.key] ? (
                    <Link href={PAGE[a.key]} className="font-bold text-brand-600 hover:underline">
                      Open
                    </Link>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${areas.length} settings area${areas.length === 1 ? "" : "s"}`}
          right={`${areas.filter((a) => a.configured).length} set up`}
        />
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Outside services</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Anything the school depends on that is not this system: payments, files,
              messages.
            </p>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <Table head={["Service", "What it is for", "State", "Detail", ""]} empty={integrations.length === 0 && "None."}>
            {integrations.map((i) => (
              <tr key={i.key}>
                <td className={tdStrong}>{i.name}</td>
                <td className={td}>{i.purpose}</td>
                <td className={td}>
                  {i.enabled ? (
                    <Badge tone="emerald">On</Badge>
                  ) : i.configured ? (
                    <Badge tone="amber">Set up, off</Badge>
                  ) : (
                    <Badge tone="neutral">Not connected</Badge>
                  )}
                </td>
                <td className={td}>{i.detail ?? "—"}</td>
                <td className={td}>
                  {INTEGRATION_PAGE[i.key] ? (
                    <Link href={INTEGRATION_PAGE[i.key]} className="font-bold text-brand-600 hover:underline">
                      Open
                    </Link>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${integrations.length} service${integrations.length === 1 ? "" : "s"}`}
          right={`${integrations.filter((i) => i.enabled).length} switched on`}
        />
      </Card>
    </div>
  );
}
