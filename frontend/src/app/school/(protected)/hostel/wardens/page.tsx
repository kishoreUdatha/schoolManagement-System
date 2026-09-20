"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  NoticeBox,
  PageHeader,
  Table,
  WarnBox,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { dateTime } from "@/lib/dates";

type Hostel = {
  id: number;
  name: string;
  kind: "boys" | "girls" | "mixed";
  warden_user_id: number | null;
  warden_name: string | null;
  address: string | null;
  monthly_fee: string;
  curfew: string | null;
  is_active: boolean;
  rooms: number;
  beds: number;
  occupied: number;
};

type Outing = {
  id: number;
  student_id: number;
  student_name: string;
  kind: string;
  leave_at: string;
  return_by: string;
  reason: string;
  escort_name: string | null;
  status: string;
  requested_by_name: string | null;
  requested_by_parent: boolean;
  decision_note: string | null;
  went_out_at: string | null;
  returned_at: string | null;
  overdue: boolean;
  late_by_minutes: number | null;
};

type Complaint = {
  id: number;
  hostel_id: number;
  student_id: number | null;
  student_name: string | null;
  category: string;
  description: string;
  status: string;
  raised_by_name: string | null;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
};

type Block = { hostel: Hostel; outings: Outing[]; complaints: Complaint[] };

/** Who is responsible for each hostel, and what is waiting on them.
 *
 *  A hostel records one warden, so this is a list of wardens rather than a
 *  duty roster — there is no shift or rota anywhere in the backend to draw
 *  one from. What it can honestly show is the work sitting in each warden's
 *  in-tray, which is the question actually being asked.
 */
export default function HostelWardensPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const hostels = (await api.get<Hostel[]>("/api/v1/school/hostels")).data;
      const built = await Promise.all(
        hostels.map(async (h) => ({
          hostel: h,
          outings: await api
            .get<Outing[]>(`/api/v1/school/hostels/${h.id}/outings`, {
              params: { active_only: true },
            })
            .then((r) => r.data)
            .catch(() => [] as Outing[]),
          complaints: await api
            .get<Complaint[]>(`/api/v1/school/hostels/${h.id}/complaints`, {
              params: { open_only: true },
            })
            .then((r) => r.data)
            .catch(() => [] as Complaint[]),
        }))
      );
      setBlocks(built);
    } catch (e) {
      setError(apiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const noWarden = blocks.filter((b) => !b.hostel.warden_user_id);
  const waiting = blocks.reduce(
    (n, b) => n + b.outings.filter((o) => o.status === "requested").length + b.complaints.length,
    0
  );
  const overdue = blocks.flatMap((b) =>
    b.outings.filter((o) => o.overdue).map((o) => ({ ...o, hostel: b.hostel.name }))
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wardens"
        subtitle="Who looks after each hostel, and what is waiting on them."
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Hostels" value={loading ? "—" : blocks.length} />
        <StatCard
          label="Without a warden"
          value={loading ? "—" : noWarden.length}
          accent={noWarden.length ? "rose" : "emerald"}
        />
        <StatCard
          label="Waiting on a decision"
          value={loading ? "—" : waiting}
          accent={waiting ? "amber" : "emerald"}
        />
        <StatCard
          label="Overdue back"
          value={loading ? "—" : overdue.length}
          accent={overdue.length ? "rose" : "emerald"}
        />
      </div>

      {overdue.length > 0 && (
        <WarnBox>
          {overdue.length} student(s) are past the time they were due back:{" "}
          {overdue.map((o) => `${o.student_name} (${o.hostel})`).join(", ")}.
        </WarnBox>
      )}

      {noWarden.length > 0 && (
        <WarnBox>
          No warden is recorded for {noWarden.map((b) => b.hostel.name).join(", ")}.
          Outings and complaints there have nobody assigned to decide them.
        </WarnBox>
      )}

      <NoticeBox>
        Each hostel records one warden. There is no shift rota in the system, so
        this is who is responsible rather than who is on duty tonight.
      </NoticeBox>

      {loading ? (
        <p className="text-[13px] text-ink-subtle">Loading…</p>
      ) : blocks.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-[13px] text-ink-subtle">
              No hostels have been set up yet.
            </p>
          </CardBody>
        </Card>
      ) : (
        blocks.map(({ hostel, outings, complaints }) => {
          const pending = outings.filter((o) => o.status === "requested");
          return (
            <Card key={hostel.id}>
              <CardHeader>
                <div className="min-w-0">
                  <CardTitle>{hostel.name}</CardTitle>
                  <p className="mt-1 text-[13px] text-ink-muted">
                    {humanize(hostel.kind)} · {hostel.occupied} of {hostel.beds} beds
                    {hostel.curfew ? ` · curfew ${hostel.curfew}` : ""}
                  </p>
                </div>
                {hostel.warden_name ? (
                  <Badge tone="brand">{hostel.warden_name}</Badge>
                ) : (
                  <Badge tone="rose">No warden</Badge>
                )}
              </CardHeader>
              <CardBody className="space-y-4">
                <div>
                  <h4 className="mb-2 text-[13px] font-extrabold text-ink">
                    Outings to decide
                  </h4>
                  <Table
                    head={["Student", "Kind", "Leaves", "Back by", "State"]}
                    empty={pending.length === 0 && "Nothing waiting."}
                  >
                    {pending.map((o) => (
                      <tr key={o.id}>
                        <td className={tdStrong}>{o.student_name}</td>
                        <td className={td}>{humanize(o.kind)}</td>
                        <td className={td}>{dateTime(o.leave_at)}</td>
                        <td className={td}>{dateTime(o.return_by)}</td>
                        <td className={td}>
                          <Badge tone="amber">{humanize(o.status)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>

                <div>
                  <h4 className="mb-2 text-[13px] font-extrabold text-ink">
                    Open complaints
                  </h4>
                  <Table
                    head={["Raised", "Student", "Category", "What", "State"]}
                    empty={complaints.length === 0 && "Nothing open."}
                  >
                    {complaints.map((c) => (
                      <tr key={c.id}>
                        <td className={td}>{dateTime(c.created_at)}</td>
                        <td className={tdStrong}>{c.student_name ?? "—"}</td>
                        <td className={td}>{c.category}</td>
                        <td className={td}>
                          <span className="line-clamp-2">{c.description}</span>
                        </td>
                        <td className={td}>
                          <Badge tone={c.status === "open" ? "rose" : "amber"}>
                            {humanize(c.status)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </Table>
                </div>

                <div>
                  <Link href="/school/hostel/allocations">
                    <Button variant="secondary">Residents</Button>
                  </Link>
                </div>
              </CardBody>
            </Card>
          );
        })
      )}
    </div>
  );
}
