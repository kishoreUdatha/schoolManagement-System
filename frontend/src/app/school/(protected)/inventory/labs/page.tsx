"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ErrorBox,
  PageHeader,
  Select,
  Table,
  humanize,
  td,
  tdStrong,
} from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { api, apiError } from "@/lib/api";
import { hhmm, shortDate } from "@/lib/dates";

type Lab = {
  id: number;
  name: string;
  code: string;
  room_id: number | null;
  room_name: string | null;
  subject_id: number | null;
  subject_name: string | null;
  in_charge_user_id: number | null;
  in_charge_name: string | null;
  capacity: number | null;
  equipment: string | null;
  safety_notes: string | null;
  is_active: boolean;
  upcoming_bookings: number;
};
type Booking = {
  id: number;
  lab_id: number;
  lab_name: string;
  booking_date: string;
  period_number: number;
  start_time: string | null;
  end_time: string | null;
  section_label: string | null;
  subject_name: string | null;
  teacher_name: string | null;
  purpose: string | null;
  students: number | null;
  status: string;
};

/** The labs, who looks after them, and what is booked.
 *
 *  A lab's equipment is one block of text on the record. That means the page
 *  can show what somebody wrote down but cannot count anything — which is
 *  said on the page, because a list that looks like an inventory and is not
 *  one will be trusted as if it were.
 */
export default function LabsPage() {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [labId, setLabId] = useState<number | "">("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Lab[]>("/api/v1/school/labs")
      .then((r) => setLabs(r.data))
      .catch((e) => setError(apiError(e)));
  }, []);

  useEffect(() => {
    api
      .get<Booking[]>("/api/v1/school/lab-bookings", {
        params: { lab_id: labId || undefined },
      })
      .then((r) => setBookings(r.data))
      .catch((e) => setError(apiError(e)));
  }, [labId]);

  const active = labs.filter((l) => l.is_active);
  const withoutRoom = labs.filter((l) => !l.room_id);
  const withoutInCharge = labs.filter((l) => !l.in_charge_user_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Labs"
        subtitle="Where practical lessons happen, who is responsible for each one, and what is booked in the next month."
      />
      <ErrorBox>{error}</ErrorBox>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Labs" value={active.length} />
        <StatCard
          label="Without a room"
          value={withoutRoom.length}
          accent={withoutRoom.length ? "amber" : "emerald"}
        />
        <StatCard
          label="Without someone in charge"
          value={withoutInCharge.length}
          accent={withoutInCharge.length ? "amber" : "emerald"}
        />
        <StatCard label="Bookings ahead" value={bookings.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {labs.map((l) => (
          <Card key={l.id}>
            <CardHeader>
              <div className="min-w-0">
                <CardTitle>{l.name}</CardTitle>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {l.code}
                  {l.subject_name ? ` · ${l.subject_name}` : ""}
                </p>
              </div>
              {l.is_active ? (
                <Badge tone="emerald">In use</Badge>
              ) : (
                <Badge tone="neutral">Retired</Badge>
              )}
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="grid gap-2 text-[13px] sm:grid-cols-3">
                <div>
                  <div className="text-[11px] font-bold text-ink-subtle">Room</div>
                  <div className="text-ink">{l.room_name || "Not set"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-ink-subtle">In charge</div>
                  <div className="text-ink">{l.in_charge_name || "Nobody"}</div>
                </div>
                <div>
                  <div className="text-[11px] font-bold text-ink-subtle">Seats</div>
                  <div className="text-ink">{l.capacity ?? "Not set"}</div>
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold text-ink-subtle">Equipment</div>
                <p className="whitespace-pre-wrap text-[13px] text-ink-muted">
                  {l.equipment || "Nothing written down yet."}
                </p>
              </div>
              {l.safety_notes && (
                <div>
                  <div className="text-[11px] font-bold text-ink-subtle">Safety notes</div>
                  <p className="whitespace-pre-wrap text-[13px] text-ink-muted">
                    {l.safety_notes}
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
        {labs.length === 0 && (
          <Card>
            <CardBody className="text-[13px] text-ink-subtle">
              No labs have been set up yet.
            </CardBody>
          </Card>
        )}
      </div>

      <p className="text-[12px] text-ink-subtle">
        Equipment is a note on the lab record, not a stock list — nothing here counts
        microscopes or tells you when one goes missing. Consumables that need counting
        belong in the store, where they have quantities.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Bookings</CardTitle>
          <Select
            aria-label="Lab"
            value={labId}
            onChange={(e) => setLabId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Every lab</option>
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </CardHeader>
        <CardBody className="p-0">
          <Table
            head={["Date", "Period", "Lab", "Class", "Subject", "Teacher", "Purpose", "State"]}
            empty={bookings.length === 0 && "Nothing is booked in the next month."}
          >
            {bookings.map((b) => (
              <tr key={b.id}>
                <td className={td}>{shortDate(b.booking_date)}</td>
                <td className={td}>
                  {b.period_number}
                  {b.start_time && (
                    <span className="block text-[11px] text-ink-subtle">
                      {hhmm(b.start_time)}
                      {b.end_time ? `–${hhmm(b.end_time)}` : ""}
                    </span>
                  )}
                </td>
                <td className={tdStrong}>{b.lab_name}</td>
                <td className={td}>{b.section_label || "—"}</td>
                <td className={td}>{b.subject_name || "—"}</td>
                <td className={td}>{b.teacher_name || "—"}</td>
                <td className={td}>{b.purpose || "—"}</td>
                <td className={td}>
                  <Badge tone={b.status === "cancelled" ? "neutral" : "brand"}>
                    {humanize(b.status)}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
