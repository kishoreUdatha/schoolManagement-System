"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, LucideIcon } from "lucide-react";

import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, NoticeBox, PageHeader, humanize } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Tone = "rose" | "amber" | "emerald";
type Stat = { label: string; value: string | number; tone?: Tone | null };
type Panel = {
  key: string;
  title: string;
  href: string;
  stats: Stat[];
  todo: string | null;
};
type Dashboard = {
  name: string;
  role: string;
  panels: Panel[];
  jobs: string[];
  nothing_assigned: boolean;
};

/** A tone on its own is invisible — StatCard tints the icon chip, not the
 *  number, so a flagged stat needs something to tint. Only flagged stats get
 *  a mark; giving every tile a decoration would make none of them stand out. */
const TONE_ICON: Record<Tone, LucideIcon> = {
  rose: AlertCircle,
  amber: AlertTriangle,
  emerald: CheckCircle2,
};

/** The staff home is assembled from the jobs this person holds, not from
 *  their role. Whatever panels the server sends are what they can do, so
 *  nothing about the library or the hostel is hardcoded here. */
export default function StaffHomePage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Dashboard>("/api/v1/staff/dashboard")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const firstName = data?.name.trim().split(/\s+/)[0];

  return (
    <div className="space-y-6">
      <PageHeader
        title={firstName ? `Hello, ${firstName}` : "Hello"}
        subtitle={
          data
            ? `${humanize(data.role)} — what you look after is below.`
            : "Fetching what you look after…"
        }
      />
      <ErrorBox>{error}</ErrorBox>

      {data?.nothing_assigned && (
        <NoticeBox>
          Nothing has been assigned to this account yet. That is not a fault — the
          school office grants jobs like the library or the front desk, and the
          panels appear here once they have.
        </NoticeBox>
      )}

      {data && data.jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Today</CardTitle>
          </CardHeader>
          <CardBody>
            {/* Plain text rather than a warning colour: most of these are the
                ordinary run of the day, not an alarm. */}
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink-muted">
              {data.jobs.map((job) => (
                <li key={job}>{job}</li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {(data?.panels ?? []).map((panel) => (
        <Card key={panel.key}>
          <CardHeader>
            <CardTitle>
              <Link href={panel.href} className="hover:text-brand-600 hover:underline">
                {panel.title}
              </Link>
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {panel.stats.map((stat) => (
                <StatCard
                  key={stat.label}
                  label={stat.label}
                  value={stat.value}
                  accent={stat.tone ?? undefined}
                  icon={stat.tone ? TONE_ICON[stat.tone] : undefined}
                />
              ))}
            </div>
            {panel.todo && <p className="text-[13px] text-ink-muted">{panel.todo}</p>}
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
