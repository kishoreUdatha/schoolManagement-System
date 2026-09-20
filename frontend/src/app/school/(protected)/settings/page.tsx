"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, td, tdStrong } from "@/components/ui/Field";
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
          <CardTitle>School settings</CardTitle>
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
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outside services</CardTitle>
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
      </Card>
    </div>
  );
}
