"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  WarnBox,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { PanelFooter, StatStrip } from "@/components/ui/Workspace";
import { Activity, Building2, LifeBuoy, Users } from "lucide-react";
import { api, apiError } from "@/lib/api";

type Check = {
  name: string;
  state: "up" | "down" | "configured" | "not_configured";
  detail: string;
  monitored: boolean;
};
type Health = {
  checked_at: string;
  checks: Check[];
  all_monitored_up: boolean;
  unmonitored: number;
  tenants_active: number;
  users_active: number;
  usage_rows_today: number;
  open_tickets: number;
};

/** What is actually checked, and what is merely configured.
 *
 *  There is no auto-refresh. A page that silently re-polls invites somebody
 *  to read a five-minute-old screen as current during the one hour it
 *  matters, so checking again is a deliberate act.
 */
export default function HealthPage() {
  const [data, setData] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setBusy(true);
    api
      .get<Health>("/api/v1/super-admin/health")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    load();
  }, []);

  const monitored = (data?.checks ?? []).filter((c) => c.monitored);
  const unmonitored = (data?.checks ?? []).filter((c) => !c.monitored);
  const down = monitored.filter((c) => c.state === "down");

  return (
    <div className="space-y-6">
      <PageHeader
        title="System health"
        subtitle="What responded when this page was last loaded."
        actions={
          <Button variant="secondary" onClick={load} loading={busy}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            Check again
          </Button>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {down.length > 0 && (
        <WarnBox>
          {down.map((c) => c.name).join(", ")} did not answer. Everything that depends
          on it is affected.
        </WarnBox>
      )}

      <StatStrip
        stats={[
          {
            label: "Active schools",
            value: data?.tenants_active ?? "—",
            note: data ? `As at ${data.checked_at.slice(0, 16).replace("T", " ")}` : undefined,
            icon: Building2,
          },
          {
            label: "Active users",
            value: data?.users_active ?? "—",
            note: "Across every school",
            icon: Users,
          },
          {
            label: "Usage rows today",
            value: data?.usage_rows_today ?? "—",
            note: "Schools that have sent something",
            icon: Activity,
          },
          {
            label: "Open tickets",
            value: data?.open_tickets ?? "—",
            note: data && data.open_tickets ? "Waiting on support" : "Nothing outstanding",
            icon: LifeBuoy,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Checked</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Services something actually probed when this page was loaded.
            </p>
          </div>
          {data && (
            <Badge tone={data.all_monitored_up ? "emerald" : "rose"}>
              {data.all_monitored_up ? "All up" : "Something is down"}
            </Badge>
          )}
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Service", "State", "What was checked"]}
            empty={monitored.length === 0 && "Nothing reported."}
          >
            {monitored.map((c) => (
              <tr key={c.name}>
                <td className={tdStrong}>{c.name}</td>
                <td className={td}>
                  <Badge tone={c.state === "up" ? "emerald" : "rose"}>
                    {c.state === "up" ? "Up" : "Down"}
                  </Badge>
                </td>
                <td className={td}>{c.detail}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${monitored.length} service(s) probed · ${down.length} down`}
          right={data ? `Checked at ${data.checked_at.slice(11, 16)}` : "Not checked yet"}
        />
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Not monitored</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              Listed so nobody assumes something is watching them.
            </p>
          </div>
          <span className="text-[12px] font-bold text-ink-muted">
            {unmonitored.length} service(s)
          </span>
        </CardHeader>
        <CardBody className="space-y-3">
          <NoticeBox>
            Nothing probes these. What is shown is whether credentials exist in the
            configuration — not whether the service works. They are listed so nobody
            assumes they are being watched.
          </NoticeBox>
          <Table head={["Service", "Configuration", "Note"]} empty={false}>
            {unmonitored.map((c) => (
              <tr key={c.name}>
                <td className={tdStrong}>{c.name}</td>
                <td className={td}>
                  <Badge tone="neutral">
                    {c.state === "configured" ? "Credentials present" : "Not configured"}
                  </Badge>
                </td>
                <td className={td}>{c.detail}</td>
              </tr>
            ))}
          </Table>
        </CardBody>
        <PanelFooter
          left={`${unmonitored.length} service(s) with no probe`}
          right={`${unmonitored.filter((c) => c.state === "configured").length} have credentials on file`}
        />
      </Card>
    </div>
  );
}
