"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Select,
  Table,
  WarnBox,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";

type Slice = { used: number; limit: number; percent: number; unlimited: boolean };
type Row = {
  tenant_id: number;
  tenant_name: string;
  tenant_code: string;
  tenant_status: string;
  students: Slice;
  staff: Slice;
  storage_mb: Slice;
  sms: Slice;
  whatsapp: Slice;
  email: Slice;
  parents: number;
  active_users: number;
  over: string[];
  near: string[];
  no_limits_set: boolean;
};
type Usage = {
  tenants: Row[];
  total: number;
  over_quota: number;
  near_quota: number;
  without_limits: number;
};

/** One quota as "used of limit", with the tone carrying how close it is.
 *  An unlimited slice shows the number alone — a percentage of nothing is
 *  not a number anybody can act on. */
function Quota({ s }: { s: Slice }) {
  if (s.unlimited) {
    return (
      <>
        {s.used}
        <span className="block text-[11px] text-ink-subtle">no limit</span>
      </>
    );
  }
  const tone = s.used > s.limit ? "rose" : s.percent >= 80 ? "amber" : "neutral";
  return (
    <>
      {s.used}
      <span className="text-ink-subtle"> / {s.limit}</span>
      <Badge tone={tone} className="ml-2">
        {s.percent}%
      </Badge>
    </>
  );
}

type Filter = "all" | "over" | "near" | "no_limits";

export default function UsagePage() {
  const [data, setData] = useState<Usage | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Usage>("/api/v1/super-admin/usage-overview")
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  const rows = (data?.tenants ?? []).filter((t) =>
    filter === "over"
      ? t.over.length > 0
      : filter === "near"
        ? t.near.length > 0 && t.over.length === 0
        : filter === "no_limits"
          ? t.no_limits_set
          : true
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage and quotas"
        subtitle="What each school is using against the plan it is on."
        actions={
          <Select
            aria-label="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as Filter)}
          >
            <option value="all">Every school</option>
            <option value="over">Over a limit</option>
            <option value="near">Near a limit</option>
            <option value="no_limits">No limits set</option>
          </Select>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Schools" value={data?.total ?? "—"} />
        <StatCard
          label="Over a limit"
          value={data?.over_quota ?? "—"}
          accent={data && data.over_quota ? "rose" : "emerald"}
        />
        <StatCard
          label="Near a limit"
          value={data?.near_quota ?? "—"}
          accent={data && data.near_quota ? "amber" : "emerald"}
          hint="At or above 80%"
        />
        <StatCard
          label="No limits set"
          value={data?.without_limits ?? "—"}
          hint="Nothing to breach"
        />
      </div>

      {data && data.over_quota > 0 && (
        <WarnBox>
          {data.over_quota} school(s) are past a limit their plan sets. Nothing here
          stops them — quotas are reported, not enforced — so this is a conversation
          to have rather than an outage to fix.
        </WarnBox>
      )}

      <NoticeBox>
        Message counts are the last thirty days. Students, staff and storage are
        current.
      </NoticeBox>

      <Card>
        <CardHeader>
          <CardTitle>School by school</CardTitle>
          <span className="text-[12px] font-bold text-ink-muted">
            {rows.length} of {data?.total ?? 0}
          </span>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["School", "Students", "Staff", "Storage (MB)", "SMS", "WhatsApp", "Email"]}
            empty={rows.length === 0 && "No schools match that filter."}
          >
            {rows.map((t) => (
              <tr key={t.tenant_id}>
                <td className={tdStrong}>
                  <Link
                    href={`/super-admin/tenants/${t.tenant_id}`}
                    className="hover:underline"
                  >
                    {t.tenant_name}
                  </Link>
                  <span className="block text-[11px] font-normal text-ink-subtle">
                    {t.tenant_code}
                    {t.no_limits_set ? " · no plan limits" : ""}
                  </span>
                </td>
                <td className={td}>
                  <Quota s={t.students} />
                </td>
                <td className={td}>
                  <Quota s={t.staff} />
                </td>
                <td className={td}>
                  <Quota s={t.storage_mb} />
                </td>
                <td className={td}>
                  <Quota s={t.sms} />
                </td>
                <td className={td}>
                  <Quota s={t.whatsapp} />
                </td>
                <td className={td}>
                  <Quota s={t.email} />
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
