"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { ErrorBox, PageHeader, Table, Textarea, humanize, td, tdStrong } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { PanelFooter } from "@/components/ui/Workspace";
import { api, apiError } from "@/lib/api";

import { Trip } from "../../TransportTabs";

type TripStudent = {
  student_id: number;
  student_name: string;
  section_label: string | null;
  stop_name: string;
  stop_sequence: number;
  status: "boarded" | "dropped" | "absent" | null;
  marked_at: string | null;
};

type TripDetail = Trip & { students: TripStudent[] };

export default function TripSheetPage() {
  const { id } = useParams<{ id: string }>();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [odo, setOdo] = useState({ start: "", end: "", notes: "" });

  async function load() {
    try {
      const { data } = await api.get<TripDetail>(`/api/v1/school/transport/trips/${id}`);
      setTrip(data);
      setOdo({
        start: data.start_odometer_km?.toString() ?? "",
        end: data.end_odometer_km?.toString() ?? "",
        notes: data.notes ?? "",
      });
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function mark(marks: { student_id: number; status: string }[]) {
    try {
      const { data } = await api.post<TripDetail>(`/api/v1/school/transport/trips/${id}/boarding`, { marks });
      setTrip(data);
    } catch (e) {
      setError(apiError(e));
    }
  }

  async function patch(body: Record<string, unknown>) {
    try {
      const { data } = await api.patch<TripDetail>(`/api/v1/school/transport/trips/${id}`, body);
      setTrip(data);
      setError(null);
    } catch (e) {
      setError(apiError(e));
    }
  }

  if (!trip) {
    return <div className="text-sm text-ink-muted">{error ?? "Loading…"}</div>;
  }

  const present = trip.direction === "pickup" ? "boarded" : "dropped";
  const editable = trip.status === "scheduled" || trip.status === "in_progress";
  const unmarked = trip.students.filter((s) => !s.status);

  return (
    <div className="space-y-6">
      <Link href="/school/transport" className="text-sm text-ink-muted hover:underline">
        ← Transport
      </Link>
      <PageHeader
        title={`${trip.route_name} · ${humanize(trip.direction)}`}
        subtitle={`${trip.trip_date} · ${trip.vehicle_label ?? "no vehicle"} · ${
          trip.driver_name ?? "no driver"
        }`}
        actions={
          <>
            {/* The trip's own state sits with the buttons that change it. */}
            <Badge>{humanize(trip.status)}</Badge>
            {trip.status === "scheduled" && <Button onClick={() => patch({ status: "in_progress" })}>Start trip</Button>}
            {trip.status === "in_progress" && <Button onClick={() => patch({ status: "completed" })}>Complete trip</Button>}
            {editable && (
              <Button variant="ghost" onClick={() => patch({ status: "cancelled" })}>
                Cancel trip
              </Button>
            )}
            {trip.status === "cancelled" && (
              <Button variant="secondary" onClick={() => patch({ status: "scheduled" })}>
                Reinstate
              </Button>
            )}
          </>
        }
      />
      <ErrorBox>{error}</ErrorBox>

      <Card>
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>Students</CardTitle>
            <p className="mt-[5px] text-[11px] text-ink-muted">
              {trip.boarded}/{trip.expected} {present}
              {trip.absent ? ` · ${trip.absent} absent` : ""}
            </p>
          </div>
          {editable && unmarked.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => mark(unmarked.map((s) => ({ student_id: s.student_id, status: present })))}>
              Mark remaining {present}
            </Button>
          )}
        </CardHeader>
        <Table head={["Stop", "Student", "Class", "Status", ""]} empty={trip.students.length === 0 && "No students on this run."}>
          {trip.students.map((s) => (
            <tr key={s.student_id}>
              <td className={td}>
                {s.stop_sequence}. {s.stop_name}
              </td>
              <td className={tdStrong}>{s.student_name}</td>
              <td className={td}>{s.section_label ?? "—"}</td>
              <td className="px-4 py-3">
                {s.status ? (
                  <Badge tone={s.status === "absent" ? "rose" : "emerald"}>{s.status}</Badge>
                ) : (
                  <span className="text-xs text-ink-subtle">not marked</span>
                )}
                {s.marked_at && <div className="text-xs text-ink-subtle">{new Date(s.marked_at).toLocaleTimeString()}</div>}
              </td>
              <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                {editable && (
                  <>
                    <Button size="sm" variant={s.status === present ? "primary" : "secondary"} onClick={() => mark([{ student_id: s.student_id, status: present }])}>
                      {humanize(present)}
                    </Button>
                    <Button size="sm" variant={s.status === "absent" ? "danger" : "secondary"} onClick={() => mark([{ student_id: s.student_id, status: "absent" }])}>
                      Absent
                    </Button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
        <PanelFooter
          left={`${trip.students.length} child${trip.students.length === 1 ? "" : "ren"} on this run`}
          right={
            unmarked.length
              ? `${unmarked.length} not marked yet`
              : "Everybody accounted for"
          }
        />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trip log</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Input label="Start odometer (km)" type="number" min={0} value={odo.start} onChange={(e) => setOdo({ ...odo, start: e.target.value })} />
            <Input label="End odometer (km)" type="number" min={0} value={odo.end} onChange={(e) => setOdo({ ...odo, end: e.target.value })} />
            <div className="flex items-end text-sm text-ink-muted">
              {trip.distance_km != null ? `${trip.distance_km} km` : ""}
            </div>
          </div>
          <Textarea label="Notes" value={odo.notes} onChange={(e) => setOdo({ ...odo, notes: e.target.value })} />
          <Button
            variant="secondary"
            onClick={() =>
              patch({
                start_odometer_km: odo.start ? Number(odo.start) : null,
                end_odometer_km: odo.end ? Number(odo.end) : null,
                notes: odo.notes || null,
              })
            }
          >
            Save log
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
